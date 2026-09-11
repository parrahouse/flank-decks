import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { splitHtmlSentences } from '@/lib/splitHtmlSentences';

const SHOW_DELAY_MS = 700;    // pause before the bubble appears — lets the wrong-answer sound & shake play
const TYPE_TICK_MS = 16;      // ms per revealed character (classic typewriter cadence)
const BUTTON_SETTLE_MS = 350; // pause after the text finishes before GOT IT appears

const CONTENT_CSS = `
.swabbie-bubble-content p { margin: 0 0 6px; }
.swabbie-bubble-content p:last-child { margin-bottom: 0; }
.swabbie-bubble-content ul, .swabbie-bubble-content ol { margin: 0 0 6px; padding-left: 18px; }
.swabbie-bubble-content li { margin: 2px 0; }
.swabbie-bubble-content strong { font-weight: 700; }
.swabbie-bubble-content em { font-style: italic; }
.swabbie-bubble-content code { background: #f0f0f0; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
.swabbie-cursor { display: inline-block; width: 7px; height: 13px; background: #000; margin-left: 3px; vertical-align: -2px; animation: swabbie-blink 0.7s steps(2, start) infinite; }
@keyframes swabbie-blink { 50% { opacity: 0; } }
`;

// Parse an HTML string into a list of DOM child nodes (preserves inline/block markup).
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

function totalTextLength(nodes) {
  return nodes.reduce((s, n) => s + countText(n), 0);
}

// Render DOM nodes into React elements, revealing only `budget.remaining` text characters.
// Tags are preserved (so bold/italic/lists render correctly) while their text streams in.
function renderNodes(nodes, budget) {
  const out = [];
  nodes.forEach((node, i) => {
    const el = renderNode(node, budget, i);
    if (el !== null && el !== '' && el !== undefined) out.push(el);
  });
  return out;
}

function renderNode(node, budget, key) {
  if (budget.remaining <= 0) return null;
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent;
    const take = Math.min(text.length, budget.remaining);
    budget.remaining -= take;
    return text.slice(0, take);
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const tag = node.tagName.toLowerCase();
    const props = { key: String(key) };
    for (const attr of node.attributes) {
      props[attr.name === 'class' ? 'className' : attr.name] = attr.value;
    }
    const children = renderNodes(Array.from(node.childNodes), budget);
    return React.createElement(tag, props, ...children);
  }
  return null;
}

/**
 * SwabbieSpeechBubble — Learn More explanation spoken by the Swabbie character.
 * Floats above the character in the progress band, anchored to its screen x.
 * The explanation is typed out character-by-character (classic video game style),
 * paginated across sentences with a "NEXT…" step and a "GOT IT" close. Black & white.
 */
export default function SwabbieSpeechBubble({ open, onClose, explanation, anchorX, anchorBottom }) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const [textDone, setTextDone] = useState(false);
  const [canDismiss, setCanDismiss] = useState(false);

  const chunks = useMemo(() => splitHtmlSentences(explanation), [explanation]);
  const steps = chunks.length;
  const isLast = step >= steps - 1;

  // Parse the current chunk + compute its visible character count.
  const parsed = useMemo(() => {
    const nodes = parseHtml(chunks[step] || '');
    return { nodes, total: totalTextLength(nodes) };
  }, [chunks, step]);

  // Pre-show delay so the wrong-answer feedback can play first.
  useEffect(() => {
    if (!open) {
      setVisible(false); setStep(0); setRevealed(0); setTextDone(false); setCanDismiss(false);
      return;
    }
    const t = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, [open]);

  // Reset the typewriter when the page changes.
  useEffect(() => {
    setRevealed(0);
    setTextDone(false);
    setCanDismiss(false);
  }, [step]);

  // Reset to the first page when the explanation changes.
  useEffect(() => { setStep(0); }, [explanation]);

  // Typewriter ticker — one character per tick until the whole chunk is shown.
  useEffect(() => {
    if (!visible || textDone) return;
    if (revealed >= parsed.total) { setTextDone(true); return; }
    const t = setTimeout(() => setRevealed((r) => Math.min(parsed.total, r + 1)), TYPE_TICK_MS);
    return () => clearTimeout(t);
  }, [visible, revealed, textDone, parsed.total]);

  // GOT IT appears only on the last page, after the text finishes + a brief settle.
  useEffect(() => {
    if (!textDone || !isLast) { setCanDismiss(false); return; }
    const t = setTimeout(() => setCanDismiss(true), BUTTON_SETTLE_MS);
    return () => clearTimeout(t);
  }, [textDone, isLast, step]);

  if (!open) return null;

  const budget = { remaining: revealed };
  const rendered = renderNodes(parsed.nodes, budget);
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
              maxHeight: `calc(100% - ${anchorBottom}px - 8px)`,
              display: 'flex',
              flexDirection: 'column',
              pointerEvents: 'auto',
            }}
          >
            {/* Tail — points down at the character */}
            <div aria-hidden style={{
              position: 'absolute', bottom: -10, left: '50%', transform: 'translateX(-50%)',
              width: 0, height: 0,
              borderLeft: '10px solid transparent', borderRight: '10px solid transparent',
              borderTop: '10px solid #000',
            }} />
            <div aria-hidden style={{
              position: 'absolute', bottom: -7, left: '50%', transform: 'translateX(-50%)',
              width: 0, height: 0,
              borderLeft: '8px solid transparent', borderRight: '8px solid transparent',
              borderTop: '8px solid #fff',
            }} />

            <div
              className="pixel-ui"
              style={{
                width: 300,
                maxWidth: 'calc(100vw - 24px)',
                backgroundColor: '#fff',
                border: '2px solid #000',
                borderRadius: 8,
                boxShadow: '0 4px 0 rgba(0,0,0,0.25)',
                padding: '12px 14px 10px',
                display: 'flex',
                flexDirection: 'column',
                flex: '1 1 auto',
                minHeight: 0,
              }}
            >
              <div
                className="swabbie-bubble-content"
                style={{
                  fontSize: 13, lineHeight: 1.4, color: '#000',
                  flex: '1 1 auto', minHeight: 0, overflowY: 'auto',
                }}
              >
                {rendered}
                {!textDone && <span className="swabbie-cursor" />}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: 8, gap: 8, flexShrink: 0, minHeight: 22 }}>
                {steps > 1 && (
                  <span style={{ fontSize: 9, color: '#000' }}>
                    {step + 1}/{steps}
                  </span>
                )}
                {!isLast ? (
                  textDone && (
                    <button
                      onClick={() => setStep((s) => Math.min(steps - 1, s + 1))}
                      className="pixel-ui"
                      style={{
                        fontSize: 10,
                        border: '2px solid #000',
                        backgroundColor: '#000',
                        color: '#fff',
                        padding: '5px 14px',
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
                        padding: '5px 14px',
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