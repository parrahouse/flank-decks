import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const SHOW_DELAY_MS = 700;    // pause before the bubble appears — lets the wrong-answer sound & shake play
const TYPE_TICK_MS = 16;      // ms per revealed character (classic typewriter cadence)
const BUTTON_SETTLE_MS = 350; // pause after the text finishes before the action button appears
const LINES_PER_PAGE = 3;
const ELLIPSIS = '...';

// Inline tags are rendered with their wrapper; block tags are flattened so the text
// flows as one inline stream (no paragraph margins) — this keeps the monospace
// character-per-line calculation exact so 3 lines never overflow.
const INLINE_TAGS = new Set(['STRONG', 'EM', 'B', 'I', 'U', 'S', 'CODE', 'SPAN', 'A', 'SUB', 'SUP', 'MARK']);

const CONTENT_CSS = `
.swabbie-bubble-content strong { font-weight: 700; }
.swabbie-bubble-content em { font-style: italic; }
.swabbie-bubble-content code { background: #f0f0f0; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
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

// Render the DOM tree as inline React elements, revealing only the character window
// [state.from, state.to). Tags are preserved so bold/italic/code render correctly
// while their text streams in; block wrappers are flattened (children only).
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
    if (tag === 'br') return null; // skip forced breaks — text flows inline
    if (INLINE_TAGS.has(node.tagName)) {
      const props = { key: state.keyCounter++ };
      for (const attr of node.attributes) {
        props[attr.name === 'class' ? 'className' : attr.name] = attr.value;
      }
      const { out, produced } = renderNodes(Array.from(node.childNodes), state);
      if (!produced) return null;
      return React.createElement(tag, props, ...out);
    }
    // Block tag: flatten its children inline (no wrapper, no margins).
    const { out, produced } = renderNodes(Array.from(node.childNodes), state);
    return produced ? out : null;
  }
  return null;
}

/**
 * SwabbieSpeechBubble — Learn More explanation spoken by the Swabbie character.
 * Floats above the character in the progress band, anchored to its screen x.
 * The explanation is typed out character-by-character (classic video game style)
 * and paginated by character count: each page fills 3 lines, then shows "..."
 * and a NEXT… control; the last page shows GOT IT. Black & white, pixel corners,
 * no drop shadow, no vertical scroll.
 */
export default function SwabbieSpeechBubble({ open, onClose, explanation, anchorX, anchorBottom }) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const [textDone, setTextDone] = useState(false);
  const [canDismiss, setCanDismiss] = useState(false);
  const [charsPerPage, setCharsPerPage] = useState(0);

  const parsed = useMemo(() => {
    const nodes = parseHtml(explanation || '');
    return { nodes, total: nodes.reduce((s, n) => s + countText(n), 0) };
  }, [explanation]);

  const pages = useMemo(() => {
    if (!charsPerPage || !parsed.total) return [{ from: 0, to: 0 }];
    const out = [];
    for (let pos = 0; pos < parsed.total; pos += charsPerPage) {
      out.push({ from: pos, to: Math.min(parsed.total, pos + charsPerPage) });
    }
    return out;
  }, [charsPerPage, parsed.total]);

  const safeStep = Math.min(step, pages.length - 1);
  const page = pages[safeStep];
  const isLast = safeStep === pages.length - 1;
  // On continuation pages, reserve room for the trailing "..." so the page stays
  // within 3 lines.
  const textEnd = page ? (isLast ? page.to : Math.max(page.from, page.to - ELLIPSIS.length)) : 0;

  // Pre-show delay so the wrong-answer feedback can play first.
  useEffect(() => {
    if (!open) {
      setVisible(false); setStep(0); setRevealed(0); setTextDone(false); setCanDismiss(false);
      return;
    }
    const t = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, [open]);

  // Measure how many characters fit in 3 lines (monospace Silkscreen), so pages
  // can be sliced by character count. Runs during the pre-show delay.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try { await document.fonts.ready; } catch {}
      if (cancelled) return;
      const contentWidth = Math.min(300, window.innerWidth - 24) - 28; // card width − border − padding
      if (contentWidth <= 0) return;
      const probe = document.createElement('span');
      probe.style.fontFamily = "'Silkscreen', monospace";
      probe.style.fontSize = '13px';
      probe.style.visibility = 'hidden';
      probe.style.position = 'absolute';
      probe.style.whiteSpace = 'pre';
      probe.textContent = 'M';
      document.body.appendChild(probe);
      const charWidth = probe.getBoundingClientRect().width;
      document.body.removeChild(probe);
      if (charWidth > 0) {
        setCharsPerPage(Math.max(1, Math.floor(contentWidth / charWidth)) * LINES_PER_PAGE);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Reset the typewriter when the page or capacity changes.
  useEffect(() => {
    if (!visible || !pages.length) return;
    const p = pages[Math.min(step, pages.length - 1)];
    setRevealed(p ? p.from : 0);
    setTextDone(false);
    setCanDismiss(false);
  }, [visible, step, charsPerPage]);

  // Reset to the first page when the explanation changes.
  useEffect(() => { setStep(0); }, [explanation]);

  // Typewriter ticker — one character per tick until the page's text is shown.
  useEffect(() => {
    if (!visible || !page || textDone) return;
    if (revealed >= textEnd) { setTextDone(true); return; }
    const t = setTimeout(() => setRevealed((r) => Math.min(textEnd, r + 1)), TYPE_TICK_MS);
    return () => clearTimeout(t);
  }, [visible, revealed, textDone, textEnd, page]);

  // GOT IT appears only on the last page, after the text finishes + a brief settle.
  useEffect(() => {
    if (!textDone || !isLast) { setCanDismiss(false); return; }
    const t = setTimeout(() => setCanDismiss(true), BUTTON_SETTLE_MS);
    return () => clearTimeout(t);
  }, [textDone, isLast, step]);

  if (!open) return null;

  const state = { pos: 0, from: page ? page.from : 0, to: Math.min(revealed, textEnd), keyCounter: 0 };
  const { out: rendered } = page ? renderNodes(parsed.nodes, state) : { out: [] };
  const clampedLeft = `clamp(150px, ${anchorX || 0}px, calc(100% - 150px))`;

  return (
    <>
      <style>{CONTENT_CSS}</style>
      <AnimatePresence>
        {visible && (
          <motion.div
            key="swabbie-bubble"
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="absolute z-20"
            style={{
              left: clampedLeft,
              bottom: anchorBottom,
              transform: 'translateX(-50%)',
              display: 'flex',
              flexDirection: 'column',
              pointerEvents: 'auto',
            }}
          >
            {/* Tail — solid black pixel triangle pointing at the character */}
            <div aria-hidden style={{
              position: 'absolute', bottom: -8, left: '50%', transform: 'translateX(-50%)',
              width: 12, height: 8, backgroundColor: '#000',
              clipPath: 'polygon(50% 100%, 0 0, 100% 0)',
            }} />

            <div
              className="pixel-ui"
              style={{
                width: 300,
                maxWidth: 'calc(100vw - 24px)',
                backgroundColor: '#fff',
                border: '2px solid #000',
                padding: '10px 12px 8px',
                display: 'flex',
                flexDirection: 'column',
                clipPath: PIXEL_CLIP,
              }}
            >
              <div
                className="swabbie-bubble-content"
                style={{
                  fontSize: 13, lineHeight: 1.4, color: '#000',
                  height: 'calc(1.4em * 3)',
                  overflow: 'hidden',
                  wordBreak: 'break-all',
                }}
              >
                {rendered}
                {textDone && !isLast && <span>{ELLIPSIS}</span>}
                {!textDone && <span className="swabbie-cursor" />}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: 6, gap: 8, flexShrink: 0, minHeight: 20 }}>
                {pages.length > 1 && (
                  <span style={{ fontSize: 9, color: '#000' }}>
                    {safeStep + 1}/{pages.length}
                  </span>
                )}
                {!isLast ? (
                  textDone && (
                    <button
                      onClick={() => setStep((s) => Math.min(pages.length - 1, s + 1))}
                      className="pixel-ui"
                      style={{
                        fontSize: 10,
                        border: '2px solid #000',
                        backgroundColor: '#fff',
                        color: '#000',
                        padding: '3px 10px',
                        cursor: 'pointer',
                      }}
                    >
                      NEXT…
                    </button>
                  )
                ) : (
                  canDismiss && (
                    <button
                      onClick={onClose}
                      className="pixel-ui"
                      style={{
                        fontSize: 10,
                        border: '2px solid #000',
                        backgroundColor: '#fff',
                        color: '#000',
                        padding: '3px 10px',
                        cursor: 'pointer',
                      }}
                    >
                      GOT IT
                    </button>
                  )
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}