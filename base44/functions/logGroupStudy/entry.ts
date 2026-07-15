import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const {
      deck_id,
      score_pct = 0,
      total_points = 0,
      max_points = 0,
      card_count = 0,
      duration_ms = null,
    } = await req.json().catch(() => ({}));
    if (!deck_id) return Response.json({ error: 'deck_id is required' }, { status: 400 });

    const svc = base44.asServiceRole;

    // Find every group this deck is assigned to.
    const assignments = await svc.entities.GroupDeckAssignment.filter({ deck_id });
    if (!assignments || assignments.length === 0) {
      return Response.json({ logged: 0 });
    }

    // Deck title for the activity feed (denormalized).
    const decks = await svc.entities.Deck.filter({ id: deck_id });
    const deck_title = (decks && decks[0] && decks[0].title) || 'Deck';

    let count = 0;
    for (const a of assignments) {
      // Confirm the caller is an active member of that group before logging.
      const memberships = await svc.entities.GroupMembership.filter({
        group_id: a.group_id, user_email: user.email, status: 'active',
      });
      if (!memberships || memberships.length === 0) continue;
      const m = memberships[0];
      await svc.entities.GroupMemberStudyLog.create({
        group_id: a.group_id,
        user_email: user.email,
        display_name: m.display_name || 'Member',
        deck_id,
        deck_title,
        score_pct,
        total_points,
        max_points,
        card_count,
        duration_ms,
        studied_at: new Date().toISOString(),
      });
      count++;
    }

    return Response.json({ logged: count });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});