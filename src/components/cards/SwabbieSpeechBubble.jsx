import { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { splitHtmlSentences } from '@/lib/splitHtmlSentences';

const SHOW_DELAY_MS = 700;    // pause before the bubble appears — lets the wrong-answer sound & shake play
const DISMISS_LOCK_MS = 3000;  // "Got it" not tappable for this long after appearing

const CONTENT_CSS = `
.swabbie-bubble-content p { margin: 0 0 6px; }
.swabbie-bubble-content p:last-child { margin-bottom: 0; }
.swabbie-bubble-content ul, .swabbie-bubble-content ol { margin: 0 0 6px; padding-left: 18px; }
.swabbie-bubble-content li { margin: 2px 0; }
.swabbie-bubble-content strong { font-weight: 700; }
.swabbie-bubble-content em { font-style: italic; }
.swabbie-bubble-content code { background: #f3f4f6; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
`;

/**
 * SwabbieSpeechBubble — Learn More explanation spoken by the Swabbie character.
 * Floats above the character in the progress band, anchored to its screen x.
 * Paginates multi-sentence explanations with "NEXT..." steps and a "GOT IT" close.
 */
export default function SwabbieSpeechBubble({ open, onClose, explanation, title, anchorX, anchorBottom }) {
  const [visible, setVisible] = useState(false);
  const [canDismiss, setCanDismiss] = useState(false);
  const [step, setStep] = useState(0);

  const chunks = useMemo(() => splitHtmlSentences(explanation), [explanation]);
  const steps = chunks.length;
  const isLast = step >= steps - 1;

  // Pre-show delay so the wrong-answer feedback can play first.
  useEffect(() => {
    if (!open) { setVisible(false); setCanDismiss(false); setStep(0); return; }
    const t = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, [open]);

  // Dismiss lock starts once the bubble is actually visible.
  useEffect(() => {
    if (!visible) { setCanDismiss(false); return; }
    const t = setTimeout(() => setCanDismiss(true), DISMISS_LOCK_MS);
    return () => clearTimeout(t);
  }, [visible]);

  // Reset to the first sentence when the explanation changes.
  useEffect(() => { setStep(0); }, [explanation]);

  if (!open) return null;

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
              borderTop: '10px solid #113656',
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
                border: '2px solid #113656',
                borderRadius: 8,
                boxShadow: '0 4px 0 rgba(17,54,86,0.18)',
                padding: '10px 12px 8px',
                display: 'flex',
                flexDirection: 'column',
                flex: '1 1 auto',
                minHeight: 0,
              }}
            >
              {title && (
                <div style={{
                  fontSize: 10, color: '#113656', fontWeight: 700,
                  borderBottom: '1.5px dashed rgba(17,54,86,0.25)',
                  paddingBottom: 5, marginBottom: 6, lineHeight: 1.2,
                  flexShrink: 0,
                }}>
                  {title}
                </div>
              )}
              <div
                className="swabbie-bubble-content"
                style={{
                  fontSize: 13, lineHeight: 1.4, color: '#1f2937',
                  flex: '1 1 auto', minHeight: 0, overflowY: 'auto',
                }}
                dangerouslySetInnerHTML={{ __html: chunks[step] || '' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: 8, gap: 8, flexShrink: 0 }}>
                {steps > 1 && (
                  <span style={{ fontSize: 9, color: '#6b7280' }}>
                    {step + 1}/{steps}
                  </span>
                )}
                {isLast ? (
                  <button
                    onClick={() => { if (canDismiss) onClose(); }}
                    disabled={!canDismiss}
                    className="pixel-ui"
                    style={{
                      fontSize: 10,
                      border: '2px solid',
                      borderColor: canDismiss ? '#00A842' : '#9ca3af',
                      backgroundColor: canDismiss ? '#00A842' : '#e5e7eb',
                      color: canDismiss ? '#fff' : '#9ca3af',
                      padding: '5px 14px',
                      cursor: canDismiss ? 'pointer' : 'not-allowed',
                      transition: 'background-color 0.2s, color 0.2s',
                    }}
                  >
                    {canDismiss ? 'GOT IT' : 'GOT IT…'}
                  </button>
                ) : (
                  <button
                    onClick={() => setStep((s) => Math.min(steps - 1, s + 1))}
                    className="pixel-ui"
                    style={{
                      fontSize: 10,
                      border: '2px solid #113656',
                      backgroundColor: '#113656',
                      color: '#fff',
                      padding: '5px 14px',
                      cursor: 'pointer',
                    }}
                  >
                    NEXT…
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}