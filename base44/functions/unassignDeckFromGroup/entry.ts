import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { group_id, deck_id } = await req.json().catch(() => ({}));
    if (!group_id || !deck_id) {
      return Response.json({ error: 'group_id and deck_id are required' }, { status: 400 });
    }
    const svc = base44.asServiceRole;

    // Caller must be the owner of the group.
    const myMemberships = await svc.entities.GroupMembership.filter({
      group_id, user_email: user.email, status: 'active',
    });
    if (!myMemberships || myMemberships.length === 0 || myMemberships[0].role !== 'owner') {
      return Response.json({ error: 'Only the group owner can unassign decks' }, { status: 403 });
    }

    const assignments = await svc.entities.GroupDeckAssignment.filter({ group_id, deck_id });
    for (const a of assignments) {
      await svc.entities.GroupDeckAssignment.delete(a.id);
    }
    // Note: we intentionally leave member subscriptions and the deck's public flag
    // in place so members keep their study history. The owner can disable sharing
    // on the deck separately if they want to revoke read access.

    return Response.json({ removed: (assignments || []).length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});