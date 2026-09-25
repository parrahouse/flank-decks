import { useState, useRef, useCallback, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { getSharedAudio, unlockSharedAudio, claimAudio, isAudioOwner, releaseAudio } from '@/lib/narrationAudio';

const CACHE_KEY = 'swabbie_tts_cache_v2';
const LEGACY_CACHE_KEY = 'swabbie_tts_cache'; // v1: keyed by text only, all entries were VOICE 'honey'
const CACHE_MAX = 200;
const VOICE = 'honey';

function normalize(text) {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function stripForSpeech(text) {
  let s = String(text || '');
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1'); // images -> alt text
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'); // links -> text
  s = s.replace(/<[^>]*>/g, ' ');                // html tags
  s = s.replace(/\$\$/g, ' ');                    // display math delims
  s = s.replace(/\$/g, ' ');                      // inline math delims
  s = s.replace(/[#*_`~>|]/g, ' ');               // markdown symbols
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

// Status/queue identity for a piece of text; null when there is nothing to speak.
function normOf(text) {
  const stripped = stripForSpeech(text);
  return stripped ? normalize(stripped) : null;
}

// Cache identity: voice-scoped so a VOICE change can never serve stale audio.
function cacheKeyOf(norm) {
  return `${VOICE}:${norm}`;
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw);
    // One-time migration from v1 so existing generations aren't re-billed.
    const legacy = localStorage.getItem(LEGACY_CACHE_KEY);
    if (!legacy) return {};
    const old = JSON.parse(legacy);
    const migrated = {};
    for (const [norm, url] of Object.entries(old)) migrated[`honey:${norm}`] = url;
    localStorage.setItem(CACHE_KEY, JSON.stringify(migrated));
    localStorage.removeItem(LEGACY_CACHE_KEY);
    return migrated;
  } catch {
    return {};
  }
}

function saveCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* storage full or unavailable — silently drop */
  }
}

function touchCache(cache, key, url) {
  const next = { ...cache };
  if (next[key]) delete next[key]; // move to end (most recent) for LRU
  next[key] = url;
  const keys = Object.keys(next);
  if (keys.length > CACHE_MAX) {
    for (let i = 0; i < keys.length - CACHE_MAX; i++) delete next[keys[i]];
  }
  return next;
}

function evictCache(cache, key) {
  if (!cache[key]) return cache;
  const next = { ...cache };
  delete next[key];
  return next;
}

export function useNarration() {
  const [statuses, setStatuses] = useState({}); // norm -> 'queued' | 'loading' | 'playing'
  const cacheRef = useRef(loadCache());
  const queueRef = useRef([]);           // [{ text, norm }]
  const activeRef = useRef(new Set());   // norms currently queued/loading/playing
  // Identity on the shared audio element (src/lib/narrationAudio.js). When another
  // narrator claims the element, release() resets this hook via clear().
  const clearRef = useRef(() => {});
  const ownerRef = useRef({ release: () => clearRef.current() });
  const currentRef = useRef(null);       // item being generated or played: { text, norm, key, cancelled, retried }
  const epochRef = useRef(0);            // bumped by clear()/unmount; invalidates all in-flight work
  const processingRef = useRef(false);

  const setStatus = useCallback((norm, status) => {
    setStatuses((prev) => (prev[norm] === status ? prev : { ...prev, [norm]: status }));
  }, []);

  const deleteStatus = useCallback((norm) => {
    setStatuses((prev) => {
      if (!prev[norm]) return prev;
      const next = { ...prev };
      delete next[norm];
      return next;
    });
  }, []);

  const processNext = useCallback(() => {
    if (processingRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;
    processingRef.current = true;

    const epoch = epochRef.current;
    const item = { ...next, key: cacheKeyOf(next.norm), cancelled: false, retried: false };
    currentRef.current = item;
    // False once clear()/unmount ran or stop() cancelled this item. Every async
    // continuation checks this before touching audio, status, or the queue.
    const isLive = () => epochRef.current === epoch && !item.cancelled;

    // Normal completion or failure: free this item and advance the queue.
    const release = () => {
      if (currentRef.current === item) currentRef.current = null;
      activeRef.current.delete(item.norm);
      deleteStatus(item.norm);
      processingRef.current = false;
      processNext();
    };

    let generate; // hoisted for the cache-retry path in play()

    const play = (url, fromCache) => {
      if (!isLive()) return;
      setStatus(item.norm, 'playing');
      const audio = claimAudio(ownerRef.current); // stops any other narrator first
      let settled = false;
      const detach = () => { audio.onended = null; audio.onerror = null; };
      const done = () => {
        if (settled) return;
        settled = true;
        detach();
        if (isLive()) release();
      };
      audio.onended = done;
      audio.onerror = () => {
        if (settled) return;
        // A cached URL that no longer loads: evict it and regenerate once.
        if (fromCache && !item.retried && isLive()) {
          settled = true;
          detach();
          item.retried = true;
          item.playing = false;
          cacheRef.current = evictCache(cacheRef.current, item.key);
          saveCache(cacheRef.current);
          generate();
          return;
        }
        done();
      };
      audio.src = url;
      item.playing = true; // real audio (not the unlock clip) is on the element
      audio.play().catch((err) => {
        // NotAllowedError: autoplay refused — nothing will play, move on.
        // AbortError: src replaced by stop/clear/next item — already handled.
        // Load failures also fire onerror, which owns the retry path.
        if (err?.name === 'NotAllowedError') done();
      });
    };

    generate = async () => {
      if (!isLive()) return;
      setStatus(item.norm, 'loading');
      let url = null;
      try {
        const res = await base44.integrations.Core.GenerateSpeech({ text: item.text, voice: VOICE });
        url = res?.url || null;
      } catch {
        url = null;
      }
      // Cache even if cancelled meanwhile — the generation was paid for.
      if (url) {
        cacheRef.current = touchCache(cacheRef.current, item.key, url);
        saveCache(cacheRef.current);
      }
      if (!isLive()) return; // stopped or cleared during generation: play nothing, touch nothing
      if (!url) { release(); return; }
      play(url, false);
    };

    const cached = cacheRef.current[item.key];
    if (cached) {
      cacheRef.current = touchCache(cacheRef.current, item.key, cached);
      saveCache(cacheRef.current);
      play(cached, true);
    } else {
      generate();
    }
  }, [deleteStatus, setStatus]);

  const speak = useCallback((text) => {
    const norm = normOf(text);
    if (!norm) return;
    if (activeRef.current.has(norm)) return;
    unlockSharedAudio(); // synchronous, inside the click gesture
    activeRef.current.add(norm);
    queueRef.current.push({ text: stripForSpeech(text), norm });
    setStatus(norm, 'queued');
    processNext();
  }, [setStatus, processNext]);

  // Stops one item: playing -> stop and advance queue; loading -> cancel
  // (result still cached); queued -> remove from queue. Other items untouched.
  const stop = useCallback((text) => {
    const norm = normOf(text);
    if (!norm || !activeRef.current.has(norm)) return;

    const cur = currentRef.current;
    if (cur && cur.norm === norm) {
      cur.cancelled = true;
      releaseAudio(ownerRef.current); // no-op unless this hook owns the element
      currentRef.current = null;
      activeRef.current.delete(norm);
      deleteStatus(norm);
      processingRef.current = false;
      processNext();
      return;
    }

    queueRef.current = queueRef.current.filter((item) => item.norm !== norm);
    activeRef.current.delete(norm);
    deleteStatus(norm);
  }, [deleteStatus, processNext]);

  // Idle -> speak. Active (playing/loading/queued) -> stop.
  const toggle = useCallback((text) => {
    const norm = normOf(text);
    if (!norm) return;
    if (activeRef.current.has(norm)) stop(text);
    else speak(text);
  }, [speak, stop]);

  const clear = useCallback(() => {
    epochRef.current += 1; // invalidate all in-flight work
    queueRef.current = [];
    // Only touches the element if this hook owns it — never pauses another
    // narrator's audio (e.g. a card change while Learn More is reading).
    releaseAudio(ownerRef.current);
    currentRef.current = null;
    activeRef.current = new Set();
    setStatuses({});
    processingRef.current = false;
  }, []);
  clearRef.current = clear;

  // Playback clock for the word highlighter: { time, duration } only while
  // `text` is the item actually playing, else null. Read once per animation frame.
  const getClock = useCallback((text) => {
    const cur = currentRef.current;
    if (!cur || !cur.playing || !isAudioOwner(ownerRef.current)) return null;
    const audio = getSharedAudio();
    if (cur.norm !== normOf(text)) return null;
    return { time: audio.currentTime, duration: audio.duration };
  }, []);

  const getStatus = useCallback((text) => {
    const norm = normOf(text);
    if (!norm) return 'idle';
    return statuses[norm] || 'idle';
  }, [statuses]);

  useEffect(() => () => {
    epochRef.current += 1;
    releaseAudio(ownerRef.current); // no-op unless this hook owns the element
  }, []);

  return { speak, toggle, stop, getStatus, getClock, clear };
}