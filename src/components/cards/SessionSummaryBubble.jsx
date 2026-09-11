import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

const SHOW_DELAY_MS = 400;
const TYPE_TICK_MS = 16;
const BUTTON_SETTLE_MS = 350;
const EXIT_MS = 220;
const FONT_SIZE = 18;
const LINE_HEIGHT_PX = 21;
const LINES = 6;

const PIXEL_CLIP = 'polygon(0 2px, 2px 2px, 2px 0, calc(100% - 2px) 0, calc(100% - 2px) 2px, 100% 2px, 100% calc(100% - 2px), calc(100% - 2px) calc(100% - 2px), calc(100% - 2px) 100%, 2px 100%, 2px calc(100% - 2px), 0 calc(100% - 2px))';

const CURSOR_CSS = `.swabbie-summary-cursor { display: inline-block; width: 7px; height: 13px; background: #000; margin-left: 3px; vertical-align: -2px; animation: swabbie-summary-blink 0.7s steps(2, start) infinite; } @keyframes swabbie-summary-blink { 50% { opacity: 0; } }`;

function fmtMs(ms) {
  if (ms == null) return '—';
  if (ms >= 60000) return `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * SessionSummaryBubble — end-of-session stats spoken by the Swabbie character.
 * Same pixel-art shell as SwabbieSpeechBubble, but renders condensed stat lines
 * (score %, points, best streak, duration) with two action buttons:
 * "Get nerdy" (navigate to full stats) and "Review missed answers" (restart with
 * only the wrong/skipped cards). Single-page, typewriter effect, no pagination.
 */
export default function SessionSummaryBubble({ open, onClose, anchorX, anchorBottom, stats, onGetNerdy, onReviewMissed, hasMissed }) {
  const [visible, setVisible] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const [textDone, setTextDone] = useState(false);
  const [canDismiss, setCanDismiss] = useState(false);

  const text = useMemo(() => {
    const { pct, totalPoints, maxPoints, bestStreak, durationMs } = stats || {};
    return `SESSION COMPLETE!\n\nSCORE: ${pct ?? 0}%\nPOINTS: ${(totalPoints ?? 0).toFixed(0)} / ${maxPoints ?? 0}\nBEST STREAK: ${bestStreak ?? 0}\nTIME: ${fmtMs(durationMs)}`;
  }, [stats]);

  useEffect(() => {
    if (!open) {
      setVisible(false);
      const t = setTimeout(() => {
        setRevealed(0); setTextDone(false); setCanDismiss(false);
      }, EXIT_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!visible) return;
    if (revealed >= text.length) { setTextDone(true); return; }
    const t = setTimeout(() => setRevealed((r) => Math.min(text.length, r + 1)), TYPE_TICK_MS);
    return () => clearTimeout(t);
  }, [visible, revealed, text]);

  useEffect(() => {
    if (!textDone) { setCanDismiss(false); return; }
    const t = setTimeout(() => setCanDismiss(true), BUTTON_SETTLE_MS);
    return () => clearTimeout(t);
  }, [textDone]);

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

  const displayText = text.slice(0, revealed);

  return (
    <>
      <style>{CURSOR_CSS}</style>
      <AnimatePresence>
        {visible && (
          <motion.div
            key="summary-bubble"
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
                position: 'relative',
              }}
            >
              <button
                onClick={onClose}
                style={{
                  position: 'absolute', top: 4, right: 6,
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: 0, lineHeight: 0,
                }}
              >
                <X style={{ width: 14, height: 14, color: '#000' }} />
              </button>

              <div
                style={{
                  fontFamily: "'VT323', monospace",
                  fontSize: FONT_SIZE,
                  lineHeight: `${LINE_HEIGHT_PX}px`,
                  color: '#000',
                  whiteSpace: 'pre-wrap',
                  height: LINES * LINE_HEIGHT_PX,
                  overflow: 'hidden',
                }}
              >
                {displayText}
                {!textDone && <span className="swabbie-summary-cursor" />}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6, minHeight: 28 }}>
              <AnimatePresence>
                {canDismiss && (
                  <motion.div
                    key="summary-buttons"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}
                  >
                    <button onClick={onGetNerdy} style={buttonStyle}>
                      Get nerdy
                    </button>
                    {hasMissed && (
                      <button onClick={onReviewMissed} style={buttonStyle}>
                        Review missed answers
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}