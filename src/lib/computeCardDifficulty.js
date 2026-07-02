/**
 * computeCardDifficulty
 *
 * Computes difficulty ONCE at card creation. Never called at runtime.
 *
 * Layer 1 — Heuristic (deterministic, free):
 *   type_score: true_false=1, multiple_choice=2, select_all=3, short_answer=3
 *   depth_bonus: longest prerequisite chain via CardRelationships
 *     chain 0-1 → +0, 2-3 → +1, 4+ → +2
 *   base_tier = clamp(type_score + depth_bonus, 1, 5)
 *
 * Layer 2 — LLM nudge (±1 step max, creation-time only):
 *   On parse failure or API error → adjustment = 0, card still saves.
 *
 * Returns { point_value, difficulty_tier, difficulty_overridden: false, _reason }
 */

import { base44 } from '@/api/base44Client';

const TYPE_SCORES = {
  true_false: 1,
  multiple_choice: 2,
  select_all: 3,
  short_answer: 3,
};

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Compute the longest prerequisite chain length ending at conceptId.
 * Follows prerequisite_of edges backwards (to_concept_id === conceptId).
 * Guards against cycles with a visited set.
 */
async function computeChainDepth(conceptId) {
  if (!conceptId) return 0;

  const MAX_DEPTH = 10; // safety cap
  const visited = new Set();

  async function dfs(cid, depth) {
    if (depth >= MAX_DEPTH) return depth;
    if (visited.has(cid)) return depth;
    visited.add(cid);

    let prereqs = [];
    try {
      prereqs = await base44.entities.CardRelationship.filter({
        to_concept_id: cid,
        relationship_type: 'prerequisite_of',
      });
    } catch {
      return depth;
    }

    if (!prereqs.length) return depth;

    let max = depth;
    for (const rel of prereqs) {
      const d = await dfs(rel.from_concept_id, depth + 1);
      if (d > max) max = d;
    }
    return max;
  }

  return dfs(conceptId, 0);
}

/**
 * Main export. Call after card data is assembled but before saving.
 *
 * @param {object} opts
 * @param {string} opts.question_type
 * @param {string} opts.clue           - written question / clue text
 * @param {string} opts.correct_answer - first correct answer (or canonical_answer)
 * @param {string} [opts.concept_id]   - if set, used for graph depth
 * @returns {Promise<{ point_value: number, difficulty_tier: number, difficulty_overridden: false, _reason: string }>}
 */
export async function computeCardDifficulty({ question_type, clue, correct_answer, concept_id }) {
  // ── Layer 1: Heuristic ────────────────────────────────────────────────────
  const typeScore = TYPE_SCORES[question_type] ?? 2;

  const chainDepth = await computeChainDepth(concept_id);
  const depthBonus = chainDepth >= 4 ? 2 : chainDepth >= 2 ? 1 : 0;

  const baseTier = clamp(typeScore + depthBonus, 1, 5);

  // ── Layer 2: LLM nudge ────────────────────────────────────────────────────
  let adjustment = 0;
  let llmReason = '';

  try {
    const prompt = `You are evaluating the conceptual difficulty of a flashcard question.

Question type: ${question_type}
Question/Clue: ${clue || '(none)'}
Correct answer: ${correct_answer || '(none)'}
Heuristic base difficulty tier: ${baseTier} (scale 1–5, where 1=trivial, 5=very hard)

Assess whether the CONCEPTUAL complexity of this specific question warrants nudging the difficulty by one step.
Consider: abstractness, domain depth, multi-step reasoning, vocabulary level.
Do NOT consider question format (that is already captured in the base tier).

Respond ONLY with valid JSON, no preamble, no markdown fences:
{"adjustment": -1 | 0 | 1, "reason": "<one sentence explaining the nudge or why no change>"}`;

    const raw = await base44.integrations.Core.InvokeLLM({ prompt });
    // Strip possible code fences defensively
    const cleaned = (typeof raw === 'string' ? raw : JSON.stringify(raw))
      .replace(/```[a-z]*\n?/g, '')
      .trim();
    const parsed = JSON.parse(cleaned);
    if (parsed.adjustment === -1 || parsed.adjustment === 0 || parsed.adjustment === 1) {
      adjustment = parsed.adjustment;
      llmReason = parsed.reason || '';
    }
  } catch {
    // LLM failure is non-blocking — keep adjustment = 0
    llmReason = 'AI assessment unavailable; using heuristic tier.';
  }

  const resolvedTier = clamp(baseTier + adjustment, 1, 5);
  const pointValue = resolvedTier * 10;

  const reason = adjustment !== 0
    ? `Type score ${typeScore} + depth bonus ${depthBonus} → base tier ${baseTier}; AI nudged ${adjustment > 0 ? '+1' : '-1'}: ${llmReason}`
    : `Type score ${typeScore} + depth bonus ${depthBonus} → tier ${resolvedTier}. ${llmReason}`;

  return {
    point_value: pointValue,
    difficulty_tier: resolvedTier,
    difficulty_overridden: false,
    _reason: reason,
  };
}