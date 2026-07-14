import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Public endpoint — no user auth required. Validates the share token against a
// public collection and returns only the data the shared-collection page needs
// to render: the collection metadata, its ordered decks, and a minimal card
// projection (id / deck_id / image_url / deleted) for counts and cover fallback.
// Card question/answer content is intentionally NOT exposed here.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let payload = {};
    try { payload = await req.json(); } catch (_e) { /* empty body */ }
    const token = (payload.share_token || '').trim();
    if (!token) return Response.json({ error: 'Collection not found' }, { status: 404 });

    const collections = await base44.asServiceRole.entities.Collection.filter({
      share_token: token,
      is_public: true,
    });
    if (!collections || collections.length === 0) {
      return Response.json({ error: 'Collection not found' }, { status: 404 });
    }
    const collection = collections[0];

    const memberships = await base44.asServiceRole.entities.CollectionDeck.filter(
      { collection: collection.id },
      'sort_order'
    );
    const deckIds = (memberships || []).map((m) => m.deck).filter(Boolean);

    let decks = [];
    if (deckIds.length > 0) {
      try {
        decks = await base44.asServiceRole.entities.Deck.filter({ id: { $in: deckIds } });
      } catch (_e) {
        decks = (await Promise.all(
          deckIds.map((id) =>
            base44.asServiceRole.entities.Deck.filter({ id }).then((r) => (r && r[0]) || null).catch(() => null)
          )
        )).filter(Boolean);
      }
    }

    const deckIdSet = new Set(decks.map((d) => d.id));
    let cards = [];
    if (deckIdSet.size > 0) {
      const perDeck = await Promise.all(
        [...deckIdSet].map((did) =>
          base44.asServiceRole.entities.Card.filter({ deck_id: did }).catch(() => [])
        )
      );
      cards = perDeck.flat();
    }

    // Preserve the membership order; skip orphan memberships (deck deleted).
    const deckMap = {};
    decks.forEach((d) => { deckMap[d.id] = d; });
    const orderedDecks = deckIds.map((id) => deckMap[id]).filter(Boolean);

    return Response.json({
      collection: {
        id: collection.id,
        name: collection.name,
        description: collection.description || null,
        accent_color: collection.accent_color || null,
      },
      decks: orderedDecks.map((d) => ({
        id: d.id,
        title: d.title,
        description: d.description || null,
        cover_image_url: d.cover_image_url || null,
        cover_focal_point: d.cover_focal_point || null,
        share_token: d.share_token || null,
      })),
      cards: cards.map((c) => ({
        id: c.id,
        deck_id: c.deck_id,
        image_url: c.image_url || null,
        deleted: c.deleted || false,
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});