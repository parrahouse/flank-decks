import { useCallback, useRef } from 'react';

const FOOTSTEP_URL = 'https://media.base44.com/files/public/69fd6153088222f7245f34d6/a36755b43_digital_footstep_grass_1.wav';

// Level-start fanfare — plays once when a study session begins
const LEVEL_START_URL = 'https://media.base44.com/files/public/69fd6153088222f7245f34d6/f04826f84_xylophone_level_start.wav';

// Egg-laying sound pool — one clip is chosen at random each time an egg is laid.
const EGGLAY_SOUND_URLS = [
  'https://media.base44.com/files/public/69fd6153088222f7245f34d6/c1d6fcd0c_goo3.wav',
  'https://media.base44.com/files/public/69fd6153088222f7245f34d6/cc8375b42_goo6.wav',
  'https://media.base44.com/files/public/69fd6153088222f7245f34d6/79d51455e_squelching_4.wav',
];

function createAudioContext() {
  return new (window.AudioContext || window.webkitAudioContext)();
}

function playTone(frequency, type, gainVal, duration) {
  const ctx = createAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime);
  gain.gain.setValueAtTime(gainVal, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

export function useSound(enabled = true) {
  const footstepRef = useRef(null);
  const eggLayPoolRef = useRef(null);
  const levelStartRef = useRef(null);

  const playCorrect = useCallback(() => {
    if (!enabled) return;
    // Cheerful three-note ascending chime
    playTone(660, 'sine', 0.15, 0.1);
    setTimeout(() => playTone(880, 'sine', 0.14, 0.1), 90);
    setTimeout(() => playTone(1320, 'sine', 0.12, 0.22), 180);
  }, [enabled]);

  const playWrong = useCallback(() => {
    if (!enabled) return;
    // Low soft thud
    playTone(220, 'sine', 0.18, 0.25);
  }, [enabled]);

  const playWalking = useCallback(() => {
    if (!enabled) return;
    if (!footstepRef.current) {
      footstepRef.current = new Audio(FOOTSTEP_URL);
      footstepRef.current.loop = true;
      footstepRef.current.volume = 0.5;
    }
    footstepRef.current.play().catch(() => {});
  }, [enabled]);

  const stopWalking = useCallback(() => {
    if (footstepRef.current) {
      footstepRef.current.pause();
      footstepRef.current.currentTime = 0;
    }
  }, []);

  const playEggLay = useCallback(() => {
    if (!enabled) return;
    // Lazily build & cache the three Audio clips on first use.
    if (!eggLayPoolRef.current) {
      eggLayPoolRef.current = EGGLAY_SOUND_URLS
        .map((url) => {
          const a = new Audio(url);
          a.volume = 0.6;
          return a;
        });
    }
    const pool = eggLayPoolRef.current;
    if (!pool.length) return;
    const clip = pool[Math.floor(Math.random() * pool.length)];
    try { clip.currentTime = 0; } catch (e) {}   // rewind so it can re-trigger
    clip.play().catch(() => {});
  }, [enabled]);

  const playLevelStart = useCallback(() => {
    if (!enabled) return;
    if (!levelStartRef.current) {
      levelStartRef.current = new Audio(LEVEL_START_URL);
      levelStartRef.current.volume = 0.7;
    }
    try { levelStartRef.current.currentTime = 0; } catch (e) {}
    levelStartRef.current.play().catch(() => {});
  }, [enabled]);

  return { playCorrect, playWrong, playWalking, stopWalking, playEggLay, playLevelStart };
}