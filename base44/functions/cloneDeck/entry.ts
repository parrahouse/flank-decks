import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { token, deck_id } = await req.json().catch(() => ({}));
    const svc = base44.asServiceRole;

    // Resolve the source deck by share token or explicit id
    let sourceDeck;
    if (token) {
      const found = await svc.entities.Deck.filter({ share_token: token });
      sourceDeck = found && found[0];
    } else if (deck_id) {
      const found = await svc.entities.Deck.filter({ id: deck_id });
      sourceDeck = found && found[0];
    }
    if (!sourceDeck) return Response.json({ error: 'Not found' }, { status: 404 });

    // Prevent owners from cloning their own deck — they already have it.
    if (sourceDeck.created_by === user.email) {
      return Response.json({ error: 'This is already your deck.' }, { status: 409 });
    }

    // Authorization: deck must be public, OR belong to a public collection.
    if (!sourceDeck.is_public) {
      const memberships = await svc.entities.CollectionDeck.filter({ deck: sourceDeck.id });
      const collectionIds = (memberships || []).map((m) => m.collection).filter(Boolean);
      let accessible = false;
      for (const cid of collectionIds) {
        const cols = await svc.entities.Collection.filter({ id: cid });
        if (cols && cols[0] && cols[0].is_public) { accessible = true; break; }
      }
      if (!accessible) return Response.json({ error: 'Not found' }, { status: 404 });
    }

    // Fetch non-deleted source cards
    const sourceCards = (await svc.entities.Card.filter({ deck_id: sourceDeck.id }))
      .filter((c) => !c.deleted);

    // Create the new deck (owned by the current user via user-scoped SDK)
    const newDeck = await base44.entities.Deck.create({
      title: sourceDeck.title + ' (copy)',
      description: sourceDeck.description,
      is_public: false,
      share_token: null,
      clue_mode: sourceDeck.clue_mode,
      clue_default_revealed: sourceDeck.clue_default_revealed,
      cover_image_url: sourceDeck.cover_image_url,
      cover_focal_point: sourceDeck.cover_focal_point,
      cover_image_original_url: sourceDeck.cover_image_original_url,
      mastery_min_sessions: sourceDeck.mastery_min_sessions,
      mastery_pct: sourceDeck.mastery_pct,
    });

    // Create new cards, stripping ownership/score/bookmark/soft-delete state
    const newCardsData = sourceCards.map((c, i) => ({
      deck_id: newDeck.id,
      concept_id: c.concept_id,
      image_url: c.image_url,
      image_original_url: c.image_original_url,
      image_focal_point: c.image_focal_point,
      image_fit: c.image_fit,
      question_type: c.question_type,
      correct_answers: c.correct_answers,
      choices: c.choices,
      canonical_answer: c.canonical_answer,
      accepted_variants: c.accepted_variants,
      grading_guidance: c.grading_guidance,
      clue: c.clue,
      explanation: c.explanation,
      order: c.order ?? i,
      tags: c.tags,
      bonus_image_url: c.bonus_image_url,
      point_value: c.point_value,
      difficulty_tier: c.difficulty_tier,
      difficulty_overridden: c.difficulty_overridden,
    }));

    // Map old card id -> new card id for note copying
    const cardIdMap = {};
    let createdCount = 0;
    if (newCardsData.length) {
      const createdCards = await base44.entities.Card.bulkCreate(newCardsData);
      sourceCards.forEach((c, i) => { cardIdMap[c.id] = createdCards[i].id; });
      createdCount = createdCards.length;
    }

    // Option A: copy notes flagged include_in_share, gifted to the new owner
    const sourceCardIds = sourceCards.map((c) => c.id);
    let noteCount = 0;
    if (sourceCardIds.length) {
      const allNotes = await svc.entities.CardNote.filter({ card_id: { $in: sourceCardIds } });
      const shareableNotes = (allNotes || []).filter((n) => n.include_in_share);
      if (shareableNotes.length) {
        const newNotesData = shareableNotes.map((n) => ({
          card_id: cardIdMap[n.card_id],
          note: n.note,
          include_in_share: false,
        }));
        await base44.entities.CardNote.bulkCreate(newNotesData);
        noteCount = newNotesData.length;
      }
    }

    return Response.json({
      deck_id: newDeck.id,
      card_count: createdCount,
      note_count: noteCount,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});