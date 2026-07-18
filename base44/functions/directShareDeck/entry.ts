import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { deck_id, recipient_email } = await req.json().catch(() => ({}));
    if (!deck_id || !recipient_email) {
      return Response.json({ error: 'deck_id and recipient_email are required' }, { status: 400 });
    }

    const svc = base44.asServiceRole;

    const found = await svc.entities.Deck.filter({ id: deck_id });
    const deck = found && found[0];
    if (!deck) return Response.json({ error: 'Deck not found' }, { status: 404 });

    // Only the owner (or an admin) may directly share a deck.
    if (deck.created_by !== user.email && user.role !== 'admin') {
      return Response.json({ error: 'Only the deck owner can share it' }, { status: 403 });
    }

    // The deck must be public for the recipient to read it via RLS.
    if (!deck.is_public) {
      return Response.json(
        { error: 'Enable link sharing first — the deck must be public for the recipient to study it.' },
        { status: 400 }
      );
    }

    const recipients = await svc.entities.User.filter({ email: recipient_email });
    const recipient = recipients && recipients[0];
    if (!recipient) return Response.json({ error: 'Recipient not found' }, { status: 404 });
    if (recipient.email === user.email) {
      return Response.json({ error: "You can't share a deck with yourself" }, { status: 400 });
    }

    // Idempotent: don't create a duplicate subscription.
    const existing = await svc.entities.DeckSubscription.filter({
      user_email: recipient.email,
      deck_id: deck.id,
    });
    let subscribed = false;
    if (!existing || !existing.length) {
      await svc.entities.DeckSubscription.create({
        user_email: recipient.email,
        deck_id: deck.id,
      });
      subscribed = true;
    }

    return Response.json({
      deck_id: deck.id,
      recipient: {
        email: recipient.email,
        username: recipient.username || null,
        full_name: recipient.full_name || null,
      },
      subscribed,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});