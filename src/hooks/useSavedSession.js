import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Manages save/resume/delete of an incomplete study session.
 * Returns:
 *   savedSession      — the active SavedSession record (or null)
 *   hoursLeft         — hours until expiry (null if no saved session)
 *   saveSession(data) — persist current progress
 *   clearSession()    — delete the saved session record
 *   loading           — true while fetching
 */
export function useSavedSession(deckId, userId) {
  const [savedSession, setSavedSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!deckId || !userId) { setLoading(false); return; }
    let cancelled = false;

    const fetch = async () => {
      setLoading(true);
      const results = await base44.entities.SavedSession.filter({ deck_id: deckId, user_id: userId });
      if (cancelled) return;

      // Purge any that have expired
      const now = Date.now();
      const valid = [];
      for (const r of results) {
        if (new Date(r.expires_at).getTime() > now) {
          valid.push(r);
        } else {
          await base44.entities.SavedSession.delete(r.id).catch(() => {});
        }
      }
      setSavedSession(valid[0] || null);
      setLoading(false);
    };

    fetch();
    return () => { cancelled = true; };
  }, [deckId, userId]);

  const hoursLeft = savedSession
    ? Math.max(0, Math.ceil((new Date(savedSession.expires_at).getTime() - Date.now()) / 3600000))
    : null;

  const saveSession = async ({ cardIds, cardIndex, scores, firstWrongChoices, filterMode, answerTimes, elapsedMs, startedAt }) => {
    const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
    const payload = { deck_id: deckId, user_id: userId, card_ids: cardIds, card_index: cardIndex, scores, first_wrong_choices: firstWrongChoices, filter_mode: filterMode, expires_at: expiresAt, answer_times: answerTimes, elapsed_ms: elapsedMs, started_at: startedAt };

    if (savedSession) {
      const updated = await base44.entities.SavedSession.update(savedSession.id, payload);
      setSavedSession(updated);
    } else {
      const created = await base44.entities.SavedSession.create(payload);
      setSavedSession(created);
    }
  };

  const clearSession = async () => {
    if (savedSession) {
      await base44.entities.SavedSession.delete(savedSession.id).catch(() => {});
      setSavedSession(null);
    }
  };

  return { savedSession, hoursLeft, saveSession, clearSession, loading };
}