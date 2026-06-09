/**
 * ProgressGameBand — mount point for the pixel-art progress game HUD.
 * Sits between the session header row and the study card panel.
 * This component is intentionally a pure container/mount-point;
 * no game logic lives here. It receives progress props and passes
 * them to whatever game is rendered inside.
 *
 * Props:
 *   cardIndex   — current card (0-based)
 *   total       — total cards in session
 *   scores      — array of score results so far
 *   correctStreak — current consecutive correct streak
 */
export default function ProgressGameBand({ cardIndex = 0, total = 1, scores = [], correctStreak = 0 }) {
  const answered = scores.filter(Boolean).length;
  const correct = scores.filter((s) => s && ['correct', 'second_guess', 'correct_after_clue', 'second_guess_after_clue', 'partial'].includes(s.key)).length;
  const progressPct = total > 0 ? (cardIndex / total) * 100 : 0;

  return (
    <div className="progress-game-band" aria-hidden="true">
      {/* Progress fill stripe */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          height: 3,
          width: `${progressPct}%`,
          backgroundColor: '#4ade80',
          transition: 'width 0.4s ease',
        }}
      />
      {/* Placeholder content — swap this out for a sprite game component */}
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 16,
        paddingRight: 16,
        gap: 12,
        color: '#555',
        fontSize: 11,
        fontFamily: "'Press Start 2P', monospace",
        letterSpacing: '0.02em',
      }}>
        <span style={{ opacity: 0.5 }}>{cardIndex + 1}/{total}</span>
        {correctStreak > 1 && (
          <span style={{ color: '#f97316' }}>
            ×{correctStreak} STREAK
          </span>
        )}
      </div>
    </div>
  );
}