import { useState, useRef, useCallback, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { getSharedAudio, unlockSharedAudio, claimAudio, isAudioOwner, releaseAudio } from '@/lib/narrationAudio';

/**
 * Learn More narration (ElevenLabs via the narrateText backend function).
 *
 * One clip per whole explanation. `text` must be SwabbieSpeechBubble's
 * plainText(nodes) verbatim: clip word offsets (from/to) are char offsets into
 * that string, the same units as the bubble's page { from, to }.
 *
 * API
 *   status            'idle' | 'loading' | 'playing'
 *   start(text, from) call from a tap. Plays from the first word at/after char
 *                     offset `from` (e.g. the current page's start).
 *   stop()            stop playback; status -> idle.
 *   seekToOffset(off) while playing, jump to the first word at/after `off`.
 *   getRevealOffset() per-frame: char offset spoken so far (for a speech-driven
 *                     typewriter), or null when this hook isn't playing.
 *
 * Options: { onEnded } — called once when the clip plays to its end.
 *
 * Shares the app's single audio element (narrationAudio.js): starting here
 * stops card read-aloud, and starting card read-aloud stops this (status -> idle).
 */

const MEM_CACHE_MAX = 20;
const memCache = new Map(); // text -> { audio_url, words } for this page session (LRU)

function memGet(text) {
  const v = memCache.get(text);
  if (v) { memCache.delete(text); memCache.set(text, v); }
  return v;
}

function memSet(text, clip) {
  memCache.delete(text);
  memCache.set(text, clip);
  while (memCache.size > MEM_CACHE_MAX) memCache.delete(memCache.keys().next().value);
}

// Start time of the first word ending after `offset`: the word containing
// `offset`, or the next word if `offset` falls in whitespace. Past the last
// word: that word's end time (i.e. the end of speech).
function timeForOffset(words, offset) {
  for (const w of words) if (w.to > offset) return w.start;
  return words.length ? words[words.length - 1].end : 0;
}

// Char offset spoken by time t. Within a word, characters are interpolated
// across [start, end]; whitespace before a word is revealed when it starts.
function offsetForTime(words, t) {
  let lo = 0;
  let hi = words.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].start <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (idx < 0) return 0;
  const w = words[idx];
  if (t >= w.end || w.end <= w.start) return w.to;
  const frac = (t - w.start) / (w.end - w.start);
  return Math.min(w.to, w.from + Math.max(1, Math.ceil(frac * (w.to - w.from))));
}

export function useExplanationNarration({ onEnded } = {}) {
  const [status, setStatus] = useState('idle');
  const clipRef = useRef(null);   // { text, audio_url, words } currently loaded
  const epochRef = useRef(0);     // bumped by start/stop/release/unmount; invalidates in-flight work
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  // Identity on the shared element. release() runs when another narrator claims
  // it: reset local state only — the element is already paused/detached.
  const ownerRef = useRef(null);
  if (!ownerRef.current) {
    ownerRef.current = {
      release: () => {
        epochRef.current += 1;
        setStatus('idle');
      },
    };
  }

  const stop = useCallback(() => {
    epochRef.current += 1;
    releaseAudio(ownerRef.current); // no-op unless this hook owns the element
    setStatus('idle');
  }, []);

  const start = useCallback(async (text, fromOffset = 0) => {
    if (typeof text !== 'string' || !text.trim()) return;
    unlockSharedAudio(); // synchronous, inside the tap
    const epoch = ++epochRef.current;

    let clip = memGet(text);
    if (!clip) {
      setStatus('loading');
      try {
        const res = await base44.functions.invoke('narrateText', { text });
        const data = res?.data;
        if (!data?.audio_url) throw new Error(data?.error || 'narrateText returned no audio_url');
        clip = { audio_url: data.audio_url, words: Array.isArray(data.words) ? data.words : [] };
        memSet(text, clip);
      } catch (err) {
        console.error('Learn More narration failed', err?.response?.data || err);
        if (epochRef.current === epoch) setStatus('idle');
        return;
      }
      if (epochRef.current !== epoch) return; // stopped/restarted/claimed while loading
    }

    clipRef.current = { text, ...clip };
    const audio = claimAudio(ownerRef.current); // stops card read-aloud if playing
    const isLive = () => epochRef.current === epoch && isAudioOwner(ownerRef.current);

    audio.onended = () => {
      if (!isLive()) return;
      releaseAudio(ownerRef.current);
      epochRef.current += 1;
      setStatus('idle');
      onEndedRef.current?.();
    };
    audio.onerror = () => {
      if (!isLive()) return;
      console.error('Learn More narration audio failed to load', clip.audio_url);
      releaseAudio(ownerRef.current);
      epochRef.current += 1;
      setStatus('idle');
    };

    const seekT = timeForOffset(clip.words, fromOffset);
    const begin = () => {
      if (!isLive()) return;
      if (seekT > 0) {
        try { audio.currentTime = seekT; } catch { /* seek unsupported before data; plays from 0 */ }
      }
      audio.play().catch((err) => {
        if (err?.name === 'NotAllowedError' && isLive()) {
          releaseAudio(ownerRef.current);
          epochRef.current += 1;
          setStatus('idle');
        }
      });
    };

    setStatus('playing');
    audio.src = clip.audio_url;
    // Seeking needs metadata; starting from 0 does not.
    if (seekT > 0) audio.addEventListener('loadedmetadata', begin, { once: true });
    else begin();
  }, []);

  const seekToOffset = useCallback((offset) => {
    const clip = clipRef.current;
    if (!clip || !isAudioOwner(ownerRef.current)) return;
    try { getSharedAudio().currentTime = timeForOffset(clip.words, offset); } catch { /* ignore */ }
  }, []);

  const getRevealOffset = useCallback(() => {
    const clip = clipRef.current;
    if (!clip || !isAudioOwner(ownerRef.current)) return null;
    return offsetForTime(clip.words, getSharedAudio().currentTime);
  }, []);

  useEffect(() => () => {
    epochRef.current += 1;
    releaseAudio(ownerRef.current);
  }, []);

  return { status, start, stop, seekToOffset, getRevealOffset };
}