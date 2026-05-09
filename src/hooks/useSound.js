import { useCallback } from 'react';

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

  return { playCorrect, playWrong };
}