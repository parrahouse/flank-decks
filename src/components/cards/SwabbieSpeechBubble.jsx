import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Volume2, Loader2, Square } from 'lucide-react';
import { useExplanationNarration } from '@/hooks/useExplanationNarration';

const SHOW_DELAY_MS = 400;    // pause before the bubble appears — lets the wrong-answer flinch & sound play
const TYPE_TICK_MS = 16;      // ms per revealed character (classic typewriter cadence)
const BUTTON_SETTLE_MS = 350; // pause after the text finishes before the action button appears
const EXIT_MS = 220;           // fade-up-and-out dismissal duration (matches the exit transition)
const LINES_PER_PAGE = 3;
const FONT_SIZE = 18;          // VT323 main text + buttons
const LINE_HEIGHT_PX = 21;    // tight pixel line height
const PAGE_COUNT_FONT = 14;   // page indicator (e.g. 1/2)
const NARRATION_MAX_CHARS = 3000; // must match MAX_CHARS in base44/functions/narrateText

// Inline tags are rendered with their wrapper; block tags are flattened so the text
// flows as one inline stream (no paragraph margins). VT323 is monospace, so tag
// styling (bold/italic) does not change character width — line breaks measured on
// plain text match the tagged rendering exactly.
const INLINE_TAGS = new Set(['STRONG', 'EM', 'B', 'I', 'U', 'S', 'CODE', 'SPAN', 'A', 'SUB', 'SUP', 'MARK']);

const CONTENT_CSS = `
.swabbie-bubble-content strong { font-weight: 700; }
.swabbie-bubble-content em { font-style: italic; }
.swabbie-bubble-content code { background: #f0f0f0; padding: 1px 4px; font-size: 12px; }
.swabbie-cursor { display: inline-block; width: 7px; height: 13px; background: #000; margin-left: 3px; vertical-align: -2px; animation: swabbie-blink 0.7s steps(2, start) infinite; }
@keyframes swabbie-blink { 50% { opacity: 0; } }
`;

// Pixel-art 2px chamfered corners (replaces smooth border-radius).
const PIXEL_CLIP = 'polygon(0 2px, 2px 2px, 2px 0, calc(100% - 2px) 0, calc(100% - 2px) 2px, 100% 2px, 100% calc(100% - 2px), calc(100% - 2px) calc(100% - 2px), calc(100% - 2px) 100%, 2px 100%, 2px calc(100% - 2px), 0 calc(100% - 2px))';

// Block elements are flattened into one inline stream, so adjacent blocks
// (Quill emits <p>a</p><p>b</p> with no whitespace between) would join words
// ("end.Next"). Insert real space text nodes at block boundaries and turn <br>
// into a space. Because the separators are actual text nodes, plainText,
// countText, renderNode and measurePages all count them identically, so
// page/char offsets stay consistent everywhere (including narration).
function separateBlocks(root) {
  const endsWs = (n) => n && n.nodeType === Node.TEXT_NODE && /\s$/.test(n.textContent);
  const startsWs = (n) => n && n.nodeType === Node.TEXT_NODE && /^\s/.test(n.textContent);
  for (const el of Array.from(root.querySelectorAll('*'))) {
    if (el.tagName === 'BR') {
      el.replaceWith(document.createTextNode(' '));
      continue;
    }
    if (INLINE_TAGS.has(el.tagName)) continue;
    if (el.previousSibling && !endsWs(el.previousSibling)) el.before(document.createTextNode(' '));
    if (el.nextSibling && !startsWs(el.nextSibling)) el.after(document.createTextNode(' '));
  }
}

function parseHtml(html) {
  const host = document.createElement('div');
  host.innerHTML = html || '';
  separateBlocks(host);
  return Array.from(host.childNodes);
}

function countText(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent.length;
  if (node.nodeType === Node.ELEMENT_NODE) {
    return Array.from(node.childNodes).reduce((s, c) => s + countText(c), 0);
  }
  return 0;
}

// Concatenate all text nodes — offsets match countText exactly, so plain-text
// char positions are valid as from/to for renderNodes.
function plainText(nodes) {
  let s = '';
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) s += node.textContent;
    else if (node.nodeType === Node.ELEMENT_NODE) Array.from(node.childNodes).forEach(walk);
  };
  nodes.forEach(walk);
  return s;
}

function renderNodes(nodes, state) {
  const out = [];
  let produced = false;
  for (const node of nodes) {
    const els = renderNode(node, state);
    if (els == null) continue;
    if (Array.isArray(els)) {
      if (els.length) { out.push(...els); produced = true; }
    } else {
      out.push(els); produced = true;
    }
  }
  return { out, produced };
}

function renderNode(node, state) {
  if (state.pos >= state.to) return null;
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent;
    const len = text.length;
    const nodeStart = state.pos;
    const nodeEnd = state.pos + len;
    state.pos = nodeEnd;
    if (nodeEnd <= state.from) return null;
    const start = Math.max(0, state.from - nodeStart);
    const end = Math.min(len, state.to - nodeStart);
    if (end <= start) return null;
    return text.slice(start, end);
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const tag = node.tagName.toLowerCase();
    if (tag === 'br') return null;
    if (INLINE_TAGS.has(node.tagName)) {
      const props = { key: state.keyCounter++ };
      for (const attr of node.attributes) {
        props[attr.name === 'class' ? 'className' : attr.name] = attr.value;
      }
      const { out, produced } = renderNodes(Array.from(node.childNodes), state);
      if (!produced) return null;
      return React.createElement(tag, props, ...out);
    }
    const { out, produced } = renderNodes(Array.from(node.childNodes), state);
    return produced ? out : null;
  }
  return null;
}

// Measure where 3-line page breaks fall using a hidden mirror div that matches
// the content's exact font / width / justify / word-wrap. Line breaking is
// independent of justify (justify only stretches full lines), so this yields the
// true word-boundary breaks. Returns [{ from, to }] in char offsets.
function measurePages(nodes, containerWidth) {
  const text = plainText(nodes);
  if (!text) return [{ from: 0, to: 0 }];
  const mirror = document.createElement('div');
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'normal';
  mirror.style.width = containerWidth + 'px';
  mirror.style.fontFamily = "'VT323', monospace";
  mirror.style.fontSize = FONT_SIZE + 'px';
  mirror.style.lineHeight = LINE_HEIGHT_PX + 'px';
  mirror.style.textAlign = 'justify';
  mirror.style.wordBreak = 'normal';
  mirror.style.overflowWrap = 'normal';
  document.body.appendChild(mirror);
  mirror.textContent = text;
  const tn = mirror.firstChild;
  const maxH = LINES_PER_PAGE * LINE_HEIGHT_PX + 0.5;
  const pages = [];
  let start = 0;
  while (start < text.length) {
    let lo = start, hi = text.length, end = start;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (mid <= start) { end = start + 1; lo = start + 2; continue; }
      const range = document.createRange();
      range.setStart(tn, start);
      range.setEnd(tn, mid);
      if (range.getBoundingClientRect().height <= maxH) { end = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    if (end <= start) end = start + 1;
    pages.push({ from: start, to: end });
    start = end;
  }
  document.body.removeChild(mirror);
  return pages.length ? pages : [{ from: 0, to: text.length }];
}

/**
 * SwabbieSpeechBubble — Learn More explanation spoken by the Swabbie character.
 * Floats above/right of the character in the progress band. The explanation is
 * typed out character-by-character (classic video game style) and paginated by
 * rendered lines: each page fills 3 justified lines, then shows a Next> control;
 * the last page shows Got it!. Black & white, pixel corners, no drop shadow.
 */
export default function SwabbieSpeechBubble({ open, onClose, explanation, anchorX, anchorBottom }) {
  const [visible, setVisible] = useState(false);
  const [displayExplanation, setDisplayExplanation] = useState('');
  const [pages, setPages] = useState([{ from: 0, to: 0 }]);
  const [step, setStep] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const [textDone, setTextDone] = useState(false);
  const [canDismiss, setCanDismiss] = useState(false);
  const contentRef = useRef(null);

  const parsed = useMemo(() => {
    const nodes = parseHtml(displayExplanation || '');
    return { nodes, total: nodes.reduce((s, n) => s + countText(n), 0) };
  }, [displayExplanation]);

  const safeStep = Math.min(step, pages.length - 1);
  const page = pages[safeStep];
  const isLast = safeStep === pages.length - 1;

  // Read-aloud (ElevenLabs). One clip for the whole explanation; while it plays,
  // the typewriter follows the voice and pages flip on word timestamps.
  const narration = useExplanationNarration();
  const narrating = narration.status === 'playing';
  const reading = narration.status !== 'idle'; // loading or playing
  const fullText = useMemo(() => plainText(parsed.nodes), [parsed]);
  const canNarrate = fullText.trim().length > 0 && fullText.length <= NARRATION_MAX_CHARS;
  // Latest pages/step for the per-frame narration loop (avoids stale closures).
  const viewRef = useRef({ pages, step: safeStep });
  viewRef.current = { pages, step: safeStep };

  // Pre-show delay so the wrong-answer feedback can play first. On close, fade
  // the bubble up and out (visible=false drives the AnimatePresence exit) while
  // holding its content; only reset state after the exit animation finishes.
  useEffect(() => {
    if (!open) {
      setVisible(false);
      const t = setTimeout(() => {
        setStep(0); setRevealed(0); setTextDone(false); setCanDismiss(false);
        setPages([{ from: 0, to: 0 }]);
        setDisplayExplanation('');
      }, EXIT_MS);
      return () => clearTimeout(t);
    }
    setDisplayExplanation(explanation || '');
    const t = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, [open, explanation]);

  // Measure page breaks from the real rendered font once the bubble is visible.
  useEffect(() => {
    if (!visible || !contentRef.current) return;
    let cancelled = false;
    (async () => {
      // Explicitly load VT323 first — document.fonts.ready can resolve before VT323
      // is fetched (it only waits for fonts already loading), and the fallback
      // monospace is narrower, which would under-count pages.
      try { await document.fonts.load(`${FONT_SIZE}px VT323`); } catch {}
      try { await document.fonts.ready; } catch {}
      if (cancelled || !contentRef.current) return;
      const w = contentRef.current.clientWidth;
      if (w > 0) setPages(measurePages(parsed.nodes, w));
    })();
    return () => { cancelled = true; };
  }, [visible, parsed]);

  // Reset the typewriter when the page or pagination changes.
  useEffect(() => {
    if (!visible || !pages.length) return;
    const p = pages[Math.min(step, pages.length - 1)];
    setRevealed(p ? p.from : 0);
    setTextDone(false);
    setCanDismiss(false);
  }, [visible, step, pages]);

  // Reset to the first page when the displayed explanation changes.
  useEffect(() => { setStep(0); }, [displayExplanation]);

  // Closing the bubble (Got it!, card change, session end) or swapping the
  // explanation stops read-aloud.
  const stopNarration = narration.stop;
  useEffect(() => { if (!open) stopNarration(); }, [open, stopNarration]);
  useEffect(() => { stopNarration(); }, [displayExplanation, stopNarration]);

  // Speech-driven typewriter: while narrating, reveal follows the audio and the
  // page flips once speech moves past the current page's end. When narration
  // stops or ends, status returns to idle and the normal ticker below finishes
  // the current page.
  useEffect(() => {
    if (!visible || !narrating) return undefined;
    const getOffset = narration.getRevealOffset;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const off = getOffset();
      if (off == null) return;
      const { pages: pg, step: s } = viewRef.current;
      const p = pg[s];
      if (!p) return;
      if (off > p.to && s < pg.length - 1) { setStep(s + 1); return; }
      const r = Math.max(p.from, Math.min(off, p.to));
      setRevealed((prev) => (prev === r ? prev : r));
      setTextDone(r >= p.to); // false while mid-page, so a stop mid-page lets the ticker finish it
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, narrating, narration.getRevealOffset]);

  // Typewriter ticker — one character per tick until the page's text is shown.
  // Paused while narrating (the narration loop above drives the reveal).
  useEffect(() => {
    if (!visible || !page || textDone || narrating) return;
    const target = page.to;
    if (revealed >= target) { setTextDone(true); return; }
    const t = setTimeout(() => setRevealed((r) => Math.min(target, r + 1)), TYPE_TICK_MS);
    return () => clearTimeout(t);
  }, [visible, revealed, textDone, page, narrating]);

  // Got it! appears only on the last page, after the text finishes + a brief settle.
  useEffect(() => {
    if (!textDone || !isLast) { setCanDismiss(false); return; }
    const t = setTimeout(() => setCanDismiss(true), BUTTON_SETTLE_MS);
    return () => clearTimeout(t);
  }, [textDone, isLast, step]);

  const state = { pos: 0, from: page ? page.from : 0, to: Math.min(revealed, page ? page.to : 0), keyCounter: 0 };
  const { out: rendered } = page ? renderNodes(parsed.nodes, state) : { out: [] };

  // Position: shift the bubble down and to the right of Swabbie. translateX(-15%)
  // puts only a sliver of the bubble left of the character and ~85% to the right;
  // the tail follows the character at 15% from the bubble's left edge.
  const clampedLeft = `clamp(150px, ${anchorX || 0}px, calc(100% - 150px))`;
  const bottomPx = (anchorBottom || 0) - 30;

  const buttonStyle = {
    fontFamily: "'VT323', monospace",
    fontSize: FONT_SIZE,
    lineHeight: '21px',
    backgroundColor: '#000',
    color: '#fff',
    border: 'none',
    padding: '4px 14px',
    cursor: 'pointer',
    letterSpacing: '0.02em',
  };

  // Same black block as the text buttons, sized to match their 29px height.
  const speakerButtonStyle = {
    ...buttonStyle,
    padding: '4px 8px',
    height: 29,
    minWidth: 32,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const handleSpeaker = () => {
    if (reading) { narration.stop(); return; }
    narration.start(fullText, page ? page.from : 0); // must stay synchronous in the tap
  };

  const handleNext = () => {
    const next = Math.min(pages.length - 1, safeStep + 1);
    setStep(next);
    if (narrating) narration.seekToOffset(pages[next].from);
    else if (reading) narration.stop(); // still loading: fall back to manual paging
  };

  const handleGotIt = () => {
    narration.stop();
    onClose();
  };

  const speakerLabel = narrating ? 'Stop reading' : reading ? 'Cancel' : 'Read aloud';

  return (
    <>
      <style>{CONTENT_CSS}</style>
      <AnimatePresence>
        {visible && (
          <motion.div
            key="swabbie-bubble"
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="absolute z-20"
            style={{
              left: clampedLeft,
              bottom: bottomPx,
              transform: 'translateX(-15%)',
              width: 300,
              maxWidth: 'calc(100vw - 24px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              pointerEvents: 'auto',
            }}
          >
            <div
              className="pixel-ui"
              style={{
                backgroundColor: '#fff',
                border: '2px solid #000',
                padding: '6px 12px 4px',
                display: 'flex',
                flexDirection: 'column',
                clipPath: PIXEL_CLIP,
              }}
            >
              <div
                ref={contentRef}
                className="swabbie-bubble-content"
                style={{
                  fontFamily: "'VT323', monospace",
                  fontSize: FONT_SIZE,
                  lineHeight: `${LINE_HEIGHT_PX}px`,
                  letterSpacing: 'normal',
                  color: '#000',
                  textAlign: 'justify',
                  textAlignLast: 'start',
                  wordBreak: 'normal',
                  overflowWrap: 'normal',
                  whiteSpace: 'normal',
                  height: LINES_PER_PAGE * LINE_HEIGHT_PX,
                  overflow: 'hidden',
                }}
              >
                {rendered}
                {!textDone && <span className="swabbie-cursor" />}
              </div>

              {/* Page count — bottom-right inside the bubble */}
              {pages.length > 1 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2, flexShrink: 0 }}>
                  <span style={{ fontFamily: "'VT323', monospace", fontSize: PAGE_COUNT_FONT, lineHeight: '16px', color: '#000' }}>
                    {safeStep + 1}/{pages.length}
                  </span>
                </div>
              )}
            </div>

            {/* Action buttons — below the bubble, right-aligned so they don't
                overlap the Swabbie character. Read-aloud sits next to Next>/Got it!,
                fading in after the page text finishes rendering (Next> stays
                available while reading aloud, to skip ahead). */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-start', gap: 6, marginTop: 6, flexShrink: 0, minHeight: 28 }}>
              {canNarrate && (
                <button
                  type="button"
                  onClick={handleSpeaker}
                  title={speakerLabel}
                  aria-label={speakerLabel}
                  style={speakerButtonStyle}
                >
                  {narrating ? (
                    <Square fill="currentColor" strokeWidth={0} style={{ width: 12, height: 12 }} />
                  ) : reading ? (
                    <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} />
                  ) : (
                    <Volume2 style={{ width: 16, height: 16 }} />
                  )}
                </button>
              )}
              <AnimatePresence>
                {!isLast ? (
                  (textDone || reading) && (
                    <motion.button
                      key="next"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      onClick={handleNext}
                      style={buttonStyle}
                    >
                      Next&gt;
                    </motion.button>
                  )
                ) : (
                  canDismiss && (
                    <motion.button
                      key="gotit"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      onClick={handleGotIt}
                      style={buttonStyle}
                    >
                      Got it!
                    </motion.button>
                  )
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}