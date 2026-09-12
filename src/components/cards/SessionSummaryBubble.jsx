import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const SHOW_DELAY_MS = 400;
const STAT_HOLD_MS = 2600;   // total time each stat is shown (includes transition)
const STAT_TRANSITION_MS = 400;
const EXIT_MS = 220;

const HEADER_FONT = 35;
const SUB_FONT = 18;
const STAT_FONT = 18;

const PIXEL_CLIP = 'polygon(0 2px, 2px 2px, 2px 0, calc(100% - 2px) 0, calc(100% - 2px) 2px, 100% 2px, 100% calc(100% - 2px), calc(100% - 2px) calc(100% - 2px), calc(100% - 2px) 100%, 2px 100%, 2px calc(100% - 2px), 0 calc(100% - 2px))';

function fmtMs(ms) {
  if (ms == null) return '—';
  if (ms >= 60000) return `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function quipForPct(pct) {
  if (pct >= 100) return 'Perfect!';
  if (pct >= 90) return 'Outstanding!';
  if (pct >= 80) return 'Not bad!';
  if (pct >= 70) return 'Solid effort!';
  if (pct >= 60) return 'Keep at it!';
  return 'Every try counts!';
}

function articleFor(num) {
  const s = String(num);
  return s.startsWith('8') || num === 11 || num === 18 ? 'an' : 'a';
}

/**
 * SessionSummaryBubble — end-of-session stats card in pixel-art style.
 * Header shows the score, sub-header shows correct/total with a quip,
 * and a light-gray scrolling bar cycles through session stats.
 * Appears automatically when the celebration loop starts (characterIdle).
 */
export default function SessionSummaryBubble({ open, anchorX, anchorBottom, stats, onGetNerdy, onReviewMissed, hasMissed }) {
  const [visible, setVisible] = useState(false);
  const [statIndex, setStatIndex] = useState(0);

  const { pct = 0, correctCount = 0, totalCards = 0, bestStreak = 0, longestWrongStreak = 0, durationMs = null, avgAnswerMs = null } = stats || {};

  const statLines = useMemo(() => [
    `Best Streak: ${bestStreak}`,
    `Longest Wrong Streak: ${longestWrongStreak}`,
    `Study Time: ${fmtMs(durationMs)}`,
    `Avg Answer: ${fmtMs(avgAnswerMs)}`,
  ], [bestStreak, longestWrongStreak, durationMs, avgAnswerMs]);

  useEffect(() => {
    if (!open) {
      setVisible(false);
      setStatIndex(0);
      return;
    }
    const t = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!visible || statLines.length <= 1) return;
    const t = setTimeout(() => setStatIndex((i) => (i + 1) % statLines.length), STAT_HOLD_MS);
    return () => clearTimeout(t);
  }, [visible, statIndex, statLines]);

  // Anchor to the right edge of the progress band with a little padding.
  const bottomPx = (anchorBottom || 0) - 40;

  const buttonStyle = {
    fontFamily: "'VT323', monospace",
    fontSize: STAT_FONT,
    lineHeight: '21px',
    backgroundColor: '#000',
    color: '#fff',
    border: 'none',
    padding: '4px 4px',
    cursor: 'pointer',
    letterSpacing: '0.02em',
  };

  return (
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
            right: 16,
            bottom: 24,
            width: 225,
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
              display: 'flex',
              flexDirection: 'column',
              clipPath: PIXEL_CLIP,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Header — "You Made an 80" */}
            <div style={{
              fontFamily: "'VT323', monospace",
              fontSize: HEADER_FONT,
              lineHeight: '21px',
              fontWeight: 500,
              color: '#000',
              textAlign: 'center',
              padding: '2px 2px 2px',
            }}>
              You Made {articleFor(pct)} {pct}
            </div>

            {/* Sub-header — "That's 8 for 10 — not bad!" */}
            <div style={{
              fontFamily: "'VT323', monospace",
              fontSize: SUB_FONT,
              lineHeight: '15px',
              color: '#000',
              textAlign: 'center',
              padding: '0 12px 10px',
            }}>
              That's {correctCount} for {totalCards} — {quipForPct(pct)}
            </div>

            {/* Scrolling stats bar — light gray background */}
            <div style={{
              backgroundColor: '#E0E0E0',
              borderTop: '2px solid #000',
              padding: '6px 12px',
              minHeight: 30,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={statIndex}
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: STAT_TRANSITION_MS / 1000, ease: 'easeOut' }}
                  style={{
                    fontFamily: "'VT323', monospace",
                    fontSize: STAT_FONT,
                    lineHeight: '21px',
                    color: '#000',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {statLines[statIndex]}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Action buttons — horizontally aligned, centered */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 6, minHeight: 28 }}>
            {hasMissed && (
              <button onClick={onReviewMissed} style={buttonStyle}>
                Review Mistakes
              </button>
            )}
            <button onClick={onGetNerdy} style={buttonStyle}>
              Get Nerdy
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}