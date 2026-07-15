import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function makeToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { group_id, deck_id, due_date } = await req.json().catch(() => ({}));
    if (!group_id || !deck_id) {
      return Response.json({ error: 'group_id and deck_id are required' }, { status: 400 });
    }
    const svc = base44.asServiceRole;

    // Caller must be the owner of the group.
    const myMemberships = await svc.entities.GroupMembership.filter({
      group_id, user_email: user.email, status: 'active',
    });
    if (!myMemberships || myMemberships.length === 0 || myMemberships[0].role !== 'owner') {
      return Response.json({ error: 'Only the group owner can assign decks' }, { status: 403 });
    }

    // Deck must exist and be owned by the caller.
    const decks = await svc.entities.Deck.filter({ id: deck_id });
    if (!decks || decks.length === 0) {
      return Response.json({ error: 'Deck not found' }, { status: 404 });
    }
    const deck = decks[0];
    if (deck.created_by !== user.email) {
      return Response.json({ error: 'You can only assign decks you own' }, { status: 403 });
    }

    // Idempotent assignment record.
    const existing = await svc.entities.GroupDeckAssignment.filter({ group_id, deck_id });
    let assignmentId;
    if (existing && existing.length) {
      assignmentId = existing[0].id;
      if (due_date !== undefined) {
        await svc.entities.GroupDeckAssignment.update(assignmentId, { due_date: due_date || null });
      }
    } else {
      const created = await svc.entities.GroupDeckAssignment.create({
        group_id, deck_id, assigned_by: user.email, due_date: due_date || null,
      });
      assignmentId = created.id;
    }

    // Make the deck (and its cards) readable by members so they can study it.
    await svc.entities.Deck.update(deck_id, {
      is_public: true,
      share_token: deck.share_token || makeToken(),
    });
    await svc.entities.Card.updateMany({ deck_id }, { $set: { is_public: true } });

    // Auto-subscribe every active member so the deck appears in their library.
    const members = await svc.entities.GroupMembership.filter({ group_id, status: 'active' });
    let subscribed = 0;
    for (const m of members) {
      const subs = await svc.entities.DeckSubscription.filter({ user_email: m.user_email, deck_id });
      if (!subs || subs.length === 0) {
        await svc.entities.DeckSubscription.create({ user_email: m.user_email, deck_id });
        subscribed++;
      }
    }

    return Response.json({ assignment_id: assignmentId, subscribed_members: subscribed });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});