// Shared helpers for the DeckStats deep-dive page.
// Legacy tolerance: every computation skips nulls; displays render "—" for missing.

export const CAP_MS = 120000; // 2 min — wall-clock answer-time cap for averages
export const capped = (ms) => (ms == null ? null : Math.min(ms, CAP_MS));

// Keys that count as a correct outcome (mirrors StudySession's CORRECT_KEYS).
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