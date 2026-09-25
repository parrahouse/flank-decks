import { useState, useRef, useCallback, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const CACHE_KEY = 'swabbie_tts_cache_v2';
const LEGACY_CACHE_KEY = 'swabbie_tts_cache'; // v1: keyed by text only, all entries were VOICE 'honey'
const CACHE_MAX = 200;
const DEFAULT_VOICE = 'honey';
// 44-byte silent PCM WAV. Played on the shared element inside a click so iOS
// Safari allows later programmatic play() calls after an async generation.
const SILENT_SRC = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';

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

// Voice-scoped key for both the audio cache and the in-memory status/active set,
// so a voice change can never serve stale audio or collide status for the same text.
function keyOf(voice, norm) {
  return `${voice}:${norm}`;
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
  const [statuses, setStatuses] = useState({}); // key (voice:norm) -> 'queued' | 'loading' | 'playing'
  const cacheRef = useRef(loadCache());
  const queueRef = useRef([]);           // [{ text, norm, voice, key }]
  const activeRef = useRef(new Set());   // keys currently queued/loading/playing
  const audioRef = useRef(null);         // ONE shared element for the hook's lifetime
  const unlockedRef = useRef(false);     // shared element has been played inside a gesture
  const currentRef = useRef(null);       // item being generated or played: { text, norm, voice, key, cancelled, retried, playing }
  const epochRef = useRef(0);            // bumped by clear()/unmount; invalidates all in-flight work
  const processingRef = useRef(false);

  const setStatus = useCallback((key, status) => {
    setStatuses((prev) => (prev[key] === status ? prev : { ...prev, [key]: status }));
  }, []);

  const deleteStatus = useCallback((key) => {
    setStatuses((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = 'auto';
      audioRef.current = audio;
      unlockedRef.current = false;
    }
    return audioRef.current;
  }, []);

  // Must be called synchronously inside a user gesture. Skipped while real
  // audio is playing (swapping src would cut it off).
  const unlockAudio = useCallback(() => {
    if (unlockedRef.current) return;
    const audio = getAudio();
    if (!audio.paused) return;
    audio.src = SILENT_SRC;
    audio.play().then(() => { unlockedRef.current = true; }).catch(() => {});
  }, [getAudio]);

  const processNext = useCallback(() => {
    if (processingRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;
    processingRef.current = true;

    const epoch = epochRef.current;
    const item = { ...next, cancelled: false, retried: false };
    currentRef.current = item;
    // False once clear()/unmount ran or stop() cancelled this item. Every async
    // continuation checks this before touching audio, status, or the queue.
    const isLive = () => epochRef.current === epoch && !item.cancelled;

    // Normal completion or failure: free this item and advance the queue.
    const release = () => {
      if (currentRef.current === item) currentRef.current = null;
      activeRef.current.delete(item.key);
      deleteStatus(item.key);
      processingRef.current = false;
      processNext();
    };

    let generate; // hoisted for the cache-retry path in play()

    const play = (url, fromCache) => {
      if (!isLive()) return;
      setStatus(item.key, 'playing');
      const audio = getAudio();
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
      setStatus(item.key, 'loading');
      let url = null;
      try {
        const res = await base44.integrations.Core.GenerateSpeech({ text: item.text, voice: item.voice });
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
  }, [deleteStatus, setStatus, getAudio]);

  const speak = useCallback((text, voice = DEFAULT_VOICE) => {
    const norm = normOf(text);
    if (!norm) return;
    const key = keyOf(voice, norm);
    if (activeRef.current.has(key)) return;
    unlockAudio();
    activeRef.current.add(key);
    queueRef.current.push({ text: stripForSpeech(text), norm, voice, key });
    setStatus(key, 'queued');
    processNext();
  }, [unlockAudio, setStatus, processNext]);

  // Stops one item: playing -> stop and advance queue; loading -> cancel
  // (result still cached); queued -> remove from queue. Other items untouched.
  const stop = useCallback((text, voice = DEFAULT_VOICE) => {
    const norm = normOf(text);
    if (!norm) return;
    const key = keyOf(voice, norm);
    if (!activeRef.current.has(key)) return;

    const cur = currentRef.current;
    if (cur && cur.key === key) {
      cur.cancelled = true;
      const audio = audioRef.current;
      if (audio) {
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
      }
      currentRef.current = null;
      activeRef.current.delete(key);
      deleteStatus(key);
      processingRef.current = false;
      processNext();
      return;
    }

    queueRef.current = queueRef.current.filter((item) => item.key !== key);
    activeRef.current.delete(key);
    deleteStatus(key);
  }, [deleteStatus, processNext]);

  // Idle -> speak. Active (playing/loading/queued) -> stop.
  const toggle = useCallback((text, voice = DEFAULT_VOICE) => {
    const norm = normOf(text);
    if (!norm) return;
    const key = keyOf(voice, norm);
    if (activeRef.current.has(key)) stop(text, voice);
    else speak(text, voice);
  }, [speak, stop]);

  const clear = useCallback(() => {
    epochRef.current += 1; // invalidate all in-flight work
    queueRef.current = [];
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      // keep the element for the hook's lifetime so the iOS unlock persists
    }
    currentRef.current = null;
    activeRef.current = new Set();
    setStatuses({});
    processingRef.current = false;
  }, []);

  // Playback clock for the word highlighter: { time, duration } only while
  // `text` is the item actually playing, else null. Read once per animation frame.
  const getClock = useCallback((text, voice = DEFAULT_VOICE) => {
    const cur = currentRef.current;
    const audio = audioRef.current;
    if (!cur || !cur.playing || !audio) return null;
    if (cur.voice !== voice || cur.norm !== normOf(text)) return null;
    return { time: audio.currentTime, duration: audio.duration };
  }, []);

  const getStatus = useCallback((text, voice = DEFAULT_VOICE) => {
    const norm = normOf(text);
    if (!norm) return 'idle';
    return statuses[keyOf(voice, norm)] || 'idle';
  }, [statuses]);

  useEffect(() => () => {
    epochRef.current += 1;
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
    }
  }, []);

  return { speak, toggle, stop, getStatus, getClock, clear };
}