import { useEffect } from 'react';

/**
 * Word tokenization, spoken-weight estimates, and the estimated-timing
 * highlight driver for narration ("option A").
 *
 * GenerateSpeech returns audio only — no word timestamps. Each rendered word
 * span carries an estimated spoken weight (data-wt). While its text is playing,
 * audio currentTime/duration is mapped onto the cumulative weights to pick the
 * active word. Drift grows with length; tuned for clue/choice-length text.
 *
 * Span contract (MathRenderer `wordSpans` and NarratedText both emit this):
 *   <span class="nw" data-w data-wt="<weight>">word</span>
 * Whitespace stays OUTSIDE spans so line breaking is unchanged.
 */

// Silence in the TTS audio before the first word / after the last (seconds).
// Estimates — tune against real GenerateSpeech output.
export const NARRATION_LEAD_S = 0.12;
export const NARRATION_TAIL_S = 0.25;

const WS_SPLIT = /(\s+)/;
const WS_ONLY = /^\s+$/;

// Spoken-length estimate for one token. Letters ~1 unit, digits ~3 (a digit is
// spoken as a whole word), plus pause weight for trailing punctuation.
// LaTeX commands (\frac, \sqrt, …) contribute nothing themselves.
export function wordWeight(raw) {
  const s = String(raw || '').replace(/\\[a-zA-Z]+/g, ' ');
  let letters = 0;
  let digits = 0;
  for (const ch of s) {
    if (/\p{N}/u.test(ch)) digits++;
    else if (/\p{L}/u.test(ch)) letters++;
  }
  if (letters + digits === 0) return 0; // pure markup/symbols: never highlighted
  let w = (letters > 0 ? Math.max(2, letters) : 0) + digits * 3;
  const trimmed = s.trimEnd();
  if (/[.!?]['"\u2019\u201d)\]]*$/.test(trimmed)) w += 5;
  else if (/[,;:\u2014\u2013]['"\u2019\u201d)\]]*$/.test(trimmed)) w += 3;
  return w;
}

// Split plain text into alternating word / whitespace parts (whitespace kept verbatim).
export function splitWords(text) {
  return String(text || '').split(WS_SPLIT).filter((p) => p.length > 0);
}

export function isWhitespace(part) {
  return WS_ONLY.test(part);
}

// Index of the active span for position x in [0, total). cum[i] is the running
// weight total through span i. Zero-weight spans have an empty interval and are
// never selected.
export function activeIndex(cum, x) {
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Toggles .nw-on on the active span inside containerRef while `active` is true.
 * DOM-only via refs/classList — no React state per frame (same discipline as the
 * game band's phase machine). Call it AFTER any effect that writes the
 * container's innerHTML so it queries the spans that effect produced.
 */
export function useWordHighlight(containerRef, active, getClock, text) {
  useEffect(() => {
    const root = containerRef.current;
    if (!active || !root || typeof getClock !== 'function') return undefined;

    const spans = Array.from(root.querySelectorAll('[data-w]'));
    const cum = [];
    let total = 0;
    for (const s of spans) {
      total += Number(s.dataset.wt) || 0;
      cum.push(total);
    }
    if (!spans.length || total <= 0) return undefined;

    let cur = -1;
    let raf = 0;
    const set = (i) => {
      if (i === cur) return;
      if (cur >= 0) spans[cur].classList.remove('nw-on');
      if (i >= 0) spans[i].classList.add('nw-on');
      cur = i;
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const clock = getClock(text);
      if (!clock || !Number.isFinite(clock.duration) || clock.duration <= 0) {
        set(-1);
        return;
      }
      const usable = Math.max(0.1, clock.duration - NARRATION_LEAD_S - NARRATION_TAIL_S);
      const x = ((clock.time - NARRATION_LEAD_S) / usable) * total;
      if (x < 0) { set(-1); return; }
      set(activeIndex(cum, Math.min(x, total - 1e-6)));
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      set(-1);
    };
  }, [containerRef, active, getClock, text]);
}