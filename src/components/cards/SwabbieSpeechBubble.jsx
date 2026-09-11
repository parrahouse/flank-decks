import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const SHOW_DELAY_MS = 700;    // pause before the bubble appears — lets the wrong-answer sound & shake play
const TYPE_TICK_MS = 16;      // ms per revealed character (classic typewriter cadence)
const BUTTON_SETTLE_MS = 350; // pause after the text finishes before the action button appears
const LINES_PER_PAGE = 3;
const FONT_SIZE = 18;          // VT323 main text + buttons
const LINE_HEIGHT_PX = 21;    // tight pixel line height
const PAGE_COUNT_FONT = 14;   // page indicator (e.g. 1/2)

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

function parseHtml(html) {
  const host = document.createElement('div');
  host.innerHTML = html || '';
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
  const [pages, setPages] = useState([{ from: 0, to: 0 }]);
  const [step, setStep] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const [textDone, setTextDone] = useState(false);
  const [canDismiss, setCanDismiss] = useState(false);
  const contentRef = useRef(null);

  const parsed = useMemo(() => {
    const nodes = parseHtml(explanation || '');
    return { nodes, total: nodes.reduce((s, n) => s + countText(n), 0) };
  }, [explanation]);

  const safeStep = Math.min(step, pages.length - 1);
  const page = pages[safeStep];
  const isLast = safeStep === pages.length - 1;

  // Pre-show delay so the wrong-answer feedback can play first.
  useEffect(() => {
    if (!open) {
      setVisible(false); setStep(0); setRevealed(0); setTextDone(false); setCanDismiss(false);
      setPages([{ from: 0, to: 0 }]);
      return;
    }
    const t = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, [open]);

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

  // Reset to the first page when the explanation changes.
  useEffect(() => { setStep(0); }, [explanation]);

  // Typewriter ticker — one character per tick until the page's text is shown.
  useEffect(() => {
    if (!visible || !page || textDone) return;
    const target = page.to;
    if (revealed >= target) { setTextDone(true); return; }
    const t = setTimeout(() => setRevealed((r) => Math.min(target, r + 1)), TYPE_TICK_MS);
    return () => clearTimeout(t);
  }, [visible, revealed, textDone, page]);

  // Got it! appears only on the last page, after the text finishes + a brief settle.
  useEffect(() => {
    if (!textDone || !isLast) { setCanDismiss(false); return; }
    const t = setTimeout(() => setCanDismiss(true), BUTTON_SETTLE_MS);
    return () => clearTimeout(t);
  }, [textDone, isLast, step]);

  if (!open) return null;

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
                padding: '10px 12px 6px',
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

            {/* Action buttons — below the bubble, aligned to its bottom-right corner.
                Fade in + slide up after the page text finishes rendering. */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6, flexShrink: 0, minHeight: 28 }}>
              <AnimatePresence>
                {!isLast ? (
                  textDone && (
                    <motion.button
                      key="next"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      onClick={() => setStep((s) => Math.min(pages.length - 1, s + 1))}
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
                      onClick={onClose}
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