import { useState, useRef, useCallback, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const CACHE_KEY = 'swabbie_tts_cache';
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

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
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

export function useNarration() {
  const [statuses, setStatuses] = useState({}); // norm -> 'queued' | 'loading' | 'playing'
  const cacheRef = useRef(loadCache());
  const queueRef = useRef([]);          // [{ text, norm }]
  const activeRef = useRef(new Set());  // norms currently queued/playing/loading
  const audioRef = useRef(null);
  const processingRef = useRef(false);

  const deleteStatus = useCallback((norm) => {
    setStatuses((prev) => {
      if (!prev[norm]) return prev;
      const next = { ...prev };
      delete next[norm];
      return next;
    });
  }, []);

  const processNext = useCallback(async () => {
    if (processingRef.current) return;
    const item = queueRef.current.shift();
    if (!item) return;
    processingRef.current = true;
    const { text, norm } = item;

    let url = cacheRef.current[norm];
    if (!url) {
      setStatuses((prev) => ({ ...prev, [norm]: 'loading' }));
      try {
        const res = await base44.integrations.Core.GenerateSpeech({ text, voice: VOICE });
        url = res.url;
        cacheRef.current = touchCache(cacheRef.current, norm, url);
        saveCache(cacheRef.current);
      } catch {
        activeRef.current.delete(norm);
        deleteStatus(norm);
        processingRef.current = false;
        processNext();
        return;
      }
    }

    setStatuses((prev) => ({ ...prev, [norm]: 'playing' }));
    const audio = new Audio(url);
    audioRef.current = audio;
    const finish = () => {
      activeRef.current.delete(norm);
      deleteStatus(norm);
      audioRef.current = null;
      processingRef.current = false;
      processNext();
    };
    audio.onended = finish;
    audio.onerror = finish;
    audio.play().catch(finish);
  }, [deleteStatus]);

  const speak = useCallback((text) => {
    const stripped = stripForSpeech(text);
    if (!stripped) return;
    const norm = normalize(stripped);
    if (activeRef.current.has(norm)) return;
    activeRef.current.add(norm);
    queueRef.current.push({ text: stripped, norm });
    setStatuses((prev) => ({ ...prev, [norm]: 'queued' }));
    processNext();
  }, [processNext]);

  const clear = useCallback(() => {
    queueRef.current = [];
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current = null;
    }
    activeRef.current = new Set();
    setStatuses({});
    processingRef.current = false;
  }, []);

  const getStatus = useCallback((text) => {
    const stripped = stripForSpeech(text);
    if (!stripped) return 'idle';
    const norm = normalize(stripped);
    return statuses[norm] || 'idle';
  }, [statuses]);

  useEffect(() => () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  return { speak, getStatus, clear };
}