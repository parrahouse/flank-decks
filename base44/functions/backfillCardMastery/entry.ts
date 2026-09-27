import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { secrets } from 'base44:runtime';

// Backfills mastery_* fields on UserCardStats by replaying the owner's StudySession history.
// Call with { offset: 0, batchSize: 50 } and repeat with next_offset until done === true.
// { force: true } also recomputes records that already have stored state.
// Requires header X-Backfill-Key matching BACKFILL_SECRET (refuses to run if the secret is unset).

// ── MIRROR of src/lib/statsUtils.js mastery model. Keep in sync if that changes. ──
const MASTERY_DECAY = 0.7;
const MASTERY_CREDIT: Record<string, number> = {
  correct: 1,
  correct_after_clue: 0.75,
  second_guess: 0.5,
  second_guess_after_clue: 0.35,
  partial: 0.5,
};
type State = { weightedSum: number; weightTotal: number; scoredSessions: number; lastKey: string | null };
const EMPTY: State = { weightedSum: 0, weightTotal: 0, scoredSessions: 0, lastKey: null };

const isScoredKey = (k: any) => !!k && k !== 'skipped';
function step(s: State, key: any): State {
  if (!isScoredKey(key)) return s;
  return {
    weightedSum: (MASTERY_CREDIT[key] ?? 0) + MASTERY_DECAY * s.weightedSum,
    weightTotal: 1 + MASTERY_DECAY * s.weightTotal,
    scoredSessions: s.scoredSessions + 1,
    lastKey: key,
  };
}
const score = (s: State) => (s.weightTotal ? Math.round((100 * s.weightedSum) / s.weightTotal) : null);
function level(s: State, deck: any): string {
  const n = s.scoredSessions;
  if (!n) return 'new';
  const sc = score(s) as number;
  const minSessions = deck?.mastery_min_sessions ?? 3;
  const threshold = deck?.mastery_pct ?? 90;
  if (sc >= threshold && n >= minSessions && s.lastKey === 'correct') return 'mastered';
  if (sc >= 80 && n >= 3) return 'proficient';
  if (sc >= 60 && n >= 2) return 'familiar';
  return 'learning';
}
const sessionTime = (s: any) => new Date(s.started_at || s.ended_at || s.created_date || 0).getTime();
// ── end mirror ──

export default async function(req: Request): Promise<Response> {
  try {
    const secret = secrets.get('BACKFILL_SECRET');
    if (!secret || req.headers.get('x-backfill-key') !== secret) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;
    const body = await req.json().catch(() => ({}));
    const offset = body.offset ?? 0;
    const batchSize = Math.min(body.batchSize ?? 50, 100);
    const force = body.force === true;

    const stats = await db.UserCardStats.filter({}, 'created_date', batchSize, offset);
    if (stats.length === 0) {
      return Response.json({ success: true, offset, processed: 0, updated: 0, skipped: 0, done: true });
    }

    const emailByUser: Record<string, string | null> = {};
    const deckById: Record<string, any> = {};
    const sessionsByKey: Record<string, any[]> = {};

    let updated = 0;
    let skipped = 0;
    const errors: any[] = [];

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    for (const st of stats) {
      try {
        if (!force && st.mastery_weight_total > 0) { skipped++; continue; }
        // Pace SDK calls to stay under the per-app rate limit.
        await sleep(150);

        if (!(st.user_id in emailByUser)) {
          const users = await db.User.filter({ id: st.user_id });
          emailByUser[st.user_id] = users[0]?.email ?? null;
        }
        const email = emailByUser[st.user_id];
        if (!email) { skipped++; errors.push({ id: st.id, error: 'user not found' }); continue; }

        if (!(st.deck_id in deckById)) {
          const decks = await db.Deck.filter({ id: st.deck_id });
          deckById[st.deck_id] = decks[0] ?? null;
        }
        const deck = deckById[st.deck_id];

        const key = `${st.deck_id}|${email}`;
        if (!sessionsByKey[key]) {
          const sessions = await db.StudySession.filter({ deck_id: st.deck_id, created_by: email });
          sessionsByKey[key] = sessions
            .filter((s: any) => s.filter_mode !== 'missed')
            .sort((a: any, b: any) => sessionTime(a) - sessionTime(b));
        }

        let state = EMPTY;
        for (const s of sessionsByKey[key]) {
          const r = (s.card_results || []).find((x: any) => x.card_id === st.card_id);
          if (r) state = step(state, r.key);
        }

        const lvl = level(state, deck);
        const fields: Record<string, any> = {
          mastery_level: lvl,
          mastery_weighted_sum: state.weightedSum,
          mastery_weight_total: state.weightTotal,
          mastery_scored_sessions: state.scoredSessions,
          mastered: lvl === 'mastered',
        };
        const sc = score(state);
        if (sc != null) fields.mastery_score = sc;
        if (state.lastKey != null) fields.mastery_last_key = state.lastKey;

        await db.UserCardStats.update(st.id, fields);
        updated++;
      } catch (e) {
        errors.push({ id: st.id, error: (e as Error).message });
      }
    }

    return Response.json({
      success: true,
      offset,
      processed: stats.length,
      updated,
      skipped,
      errors,
      next_offset: offset + stats.length,
      done: stats.length < batchSize,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}