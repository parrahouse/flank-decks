import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { query } = await req.json().catch(() => ({}));
    const svc = base44.asServiceRole;

    // Service-role bypasses owner RLS so we can see every public deck.
    const allDecks = await svc.entities.Deck.list('-created_date', 200);
    const publicDecks = allDecks.filter(
      (d) => d.is_public && d.share_token && d.created_by !== user.email
    );

    const q = (query || '').trim().toLowerCase();
    const matched = q
      ? publicDecks.filter(
          (d) =>
            (d.title || '').toLowerCase().includes(q) ||
            (d.description || '').toLowerCase().includes(q)
        )
      : publicDecks;

    // Card counts (exclude soft-deleted cards and zero-card decks)
    const deckIds = matched.map((d) => d.id);
    const counts = {};
    if (deckIds.length) {
      const allCards = await svc.entities.Card.filter({ deck_id: { $in: deckIds } }, null, 2000);
      for (const c of allCards) {
        if (c.deleted) continue;
        counts[c.deck_id] = (counts[c.deck_id] || 0) + 1;
      }
    }

    const results = matched
      .map((d) => ({
        id: d.id,
        title: d.title,
        description: d.description || '',
        cover_image_url: d.cover_image_url || null,
        cover_focal_point: d.cover_focal_point || null,
        share_token: d.share_token,
        card_count: counts[d.id] || 0,
        author: (d.created_by || '').split('@')[0],
      }))
      .filter((d) => d.card_count > 0)
      .sort((a, b) => b.card_count - a.card_count);

    return Response.json({ decks: results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});