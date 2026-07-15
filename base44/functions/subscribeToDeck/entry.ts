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

    // Owners don't need a subscription — they already have the deck.
    if (sourceDeck.created_by === user.email) {
      return Response.json({ deck_id: sourceDeck.id, owned: true, subscribed: false });
    }

    // Idempotent: if a subscription already exists, don't create a duplicate.
    const existing = await svc.entities.DeckSubscription.filter({
      user_email: user.email,
      deck_id: sourceDeck.id,
    });
    if (existing && existing.length) {
      return Response.json({ deck_id: sourceDeck.id, owned: false, subscribed: true, already_subscribed: true });
    }

    await svc.entities.DeckSubscription.create({
      user_email: user.email,
      deck_id: sourceDeck.id,
    });

    return Response.json({ deck_id: sourceDeck.id, owned: false, subscribed: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});