// Shared helpers for the DeckStats deep-dive page.
// Legacy tolerance: every computation skips nulls; displays render "—" for missing.

export const CAP_MS = 120000; // 2 min — wall-clock answer-time cap for averages
export const capped = (ms) => (ms == null ? null : Math.min(ms, CAP_MS));

// Keys that count as a correct outcome. Canonical definition — import this rather than redefining it.
// (ProgressGameBand and ContactSheet intentionally keep their own set without 'partial', for display.)
export const CORRECT_KEYS = new Set([
  'correct', 'second_guess', 'correct_after_clue', 'second_guess_after_clue', 'partial',
]);

export function mean(nums) {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function median(nums) {
  if (!nums.length) return null;
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

// h:mm or m:ss for session/duration totals
export function formatDuration(ms) {
  if (ms == null) return '—';
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// compact seconds for per-card averages (4.3s / 1:20)
export function formatClockMs(ms) {
  if (ms == null) return '—';
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}:${String(rem).padStart(2, '0')}`;
}

// calendar span for time-to-master (days/hours/minutes)
export function formatSpan(ms) {
  if (ms == null || ms < 0 || !isFinite(ms)) return '—';
  const days = ms / 86400000;
  if (days >= 1) return `${days.toFixed(1)}d`;
  const hours = ms / 3600000;
  if (hours >= 1) return `${hours.toFixed(1)}h`;
  const min = ms / 60000;
  return `${Math.round(min)}m`;
}

export function formatDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return '—';
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatShortDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return '—';
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function pct(v) {
  if (v == null) return '—';
  return `${Math.round(v * 100)}%`;
}

// For values already stored on a 0–100 scale (e.g. StudySession.score_pct).
export function pct100(v) {
  if (v == null) return '—';
  return `${Math.round(v)}%`;
}

// ─── Card mastery model ─────────────────────────────────────────────────────
// Score = weighted average of per-session credit, newest session weight 1,
// each older session MASTERY_DECAY× the next. Kept as running state so each
// new session updates it in one step:
//   weightedSum' = credit + DECAY·weightedSum,  weightTotal' = 1 + DECAY·weightTotal
// Review-missed runs (filter_mode 'missed') and unscored keys (skipped/null) do not count.

export const MASTERY_DECAY = 0.7;

export const MASTERY_CREDIT = {
  correct: 1,
  correct_after_clue: 0.75,
  second_guess: 0.5,
  second_guess_after_clue: 0.35,
  partial: 0.5,
  // any other key (wrong, incorrect, …) → 0
};

export const UNSCORED_KEYS = new Set(['skipped']);

export const MASTERY_LEVELS = [
  { id: 'new', label: 'New' },
  { id: 'learning', label: 'Learning' },
  { id: 'familiar', label: 'Familiar' },
  { id: 'proficient', label: 'Proficient' },
  { id: 'mastered', label: 'Mastered' },
];

export const EMPTY_MASTERY_STATE = Object.freeze({
  weightedSum: 0, weightTotal: 0, scoredSessions: 0, lastKey: null,
});

export function isScoredKey(key) {
  return !!key && !UNSCORED_KEYS.has(key);
}

export function creditForKey(key) {
  return MASTERY_CREDIT[key] ?? 0;
}

// Update the running state with one session's result for one card. Unscored keys leave it unchanged.
export function stepMasteryState(state, key) {
  const s = state ?? EMPTY_MASTERY_STATE;
  if (!isScoredKey(key)) return s;
  return {
    weightedSum: creditForKey(key) + MASTERY_DECAY * s.weightedSum,
    weightTotal: 1 + MASTERY_DECAY * s.weightTotal,
    scoredSessions: s.scoredSessions + 1,
    lastKey: key,
  };
}

// 0–100 integer, or null if the card has no scored sessions.
export function masteryScore(state) {
  if (!state || !state.weightTotal) return null;
  return Math.round((100 * state.weightedSum) / state.weightTotal);
}

// Level uses the rounded score, so the displayed number and the level always agree.
// Mastered also requires the most recent scored session to be right first try with no clue.
export function masteryLevel(state, deck) {
  const n = state?.scoredSessions ?? 0;
  if (!n) return 'new';
  const score = masteryScore(state);
  const minSessions = deck?.mastery_min_sessions ?? 3;
  const threshold = deck?.mastery_pct ?? 90;
  if (score >= threshold && n >= minSessions && state.lastKey === 'correct') return 'mastered';
  if (score >= 80 && n >= 3) return 'proficient';
  if (score >= 60 && n >= 2) return 'familiar';
  return 'learning';
}

export function masteryLevelLabel(levelId) {
  return MASTERY_LEVELS.find((l) => l.id === levelId)?.label ?? 'New';
}

function sessionTime(s) {
  return new Date(s.started_at || s.ended_at || s.created_date || 0).getTime();
}

// Recompute one card's mastery from StudySession history (used by the backfill).
// Uses the first result for the card in each session.
export function computeCardMastery(sessions, cardId, deck) {
  const ordered = (sessions || [])
    .filter((s) => s.filter_mode !== 'missed')
    .sort((a, b) => sessionTime(a) - sessionTime(b));
  let state = EMPTY_MASTERY_STATE;
  for (const s of ordered) {
    const r = (s.card_results || []).find((x) => x.card_id === cardId);
    if (r) state = stepMasteryState(state, r.key);
  }
  return { state, score: masteryScore(state), level: masteryLevel(state, deck) };
}

// Deck score = mean card score over active (non-deleted) cards; unstudied cards count 0.
// activeCardIds: array of ids; scoreByCardId: { [cardId]: 0–100 | null }
export function computeDeckScore(activeCardIds, scoreByCardId) {
  if (!activeCardIds?.length) return 0;
  const sum = activeCardIds.reduce((a, id) => a + (scoreByCardId?.[id] ?? 0), 0);
  return Math.round(sum / activeCardIds.length);
}