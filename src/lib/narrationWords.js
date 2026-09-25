/**
 * Word tokenization + spoken-weight estimates for narration highlighting.
 *
 * Span contract (MathRenderer `wordSpans` and NarratedText both emit this):
 *   <span class="nw" data-w data-wt="<weight>">word</span>
 * Whitespace stays OUTSIDE spans so line breaking is unchanged.
 */

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
  else if (/[,;:\u2014\u2013['"\u2019\u201d)\]]*$/.test(trimmed)) w += 3;
  return w;
}

// Split plain text into alternating word / whitespace parts (whitespace kept verbatim).
export function splitWords(text) {
  return String(text || '').split(WS_SPLIT).filter((p) => p.length > 0);
}

export function isWhitespace(part) {
  return WS_ONLY.test(part);
}