import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const token = (body && body.token) || (body && body.share_token);

    if (!token || typeof token !== 'string') {
      return Response.json({ error: 'Missing token' }, { status: 400 });
    }

    // Service role bypasses owner-only RLS so a public deck's cards and notes
    // are readable by anyone holding the share token.
    const decks = await base44.asServiceRole.entities.Deck.filter({ share_token: token });
    const deck = decks && decks[0];
    if (!deck || !deck.is_public) {
      return Response.json({ error: 'Deck not found or no longer shared' }, { status: 404 });
    }

    const [cards, notes] = await Promise.all([
      base44.asServiceRole.entities.Card.filter({ deck_id: deck.id, deleted: { $ne: true } }, 'order'),
      base44.asServiceRole.entities.CardNote.filter({ include_in_share: true }),
    ]);

    const cardIds = new Set((cards || []).map((c) => c.id));
    const sharedNotes = (notes || []).filter((n) => cardIds.has(n.card_id));

    return Response.json({
      deck: {
        id: deck.id,
        title: deck.title,
        description: deck.description,
        cover_image_url: deck.cover_image_url,
        cover_focal_point: deck.cover_focal_point,
        clue_mode: deck.clue_mode,
        clue_default_revealed: deck.clue_default_revealed,
      },
      cards: cards || [],
      notes: sharedNotes || [],
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});