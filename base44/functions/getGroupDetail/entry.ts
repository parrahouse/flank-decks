import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let payload = {};
    try { payload = await req.json(); } catch (_e) { /* empty body */ }
    const group_id = (payload.group_id || '').trim();
    if (!group_id) return Response.json({ error: 'Group not found' }, { status: 404 });

    const svc = base44.asServiceRole;

    // Confirm the caller has an active membership. RLS would hide StudyGroup
    // rows from non-owners entirely, so we verify membership first and return a
    // generic 404 whether the group is missing or the user simply isn't a member.
    const myMemberships = await svc.entities.GroupMembership.filter({
      group_id,
      user_email: user.email,
      status: 'active',
    });
    if (!myMemberships || myMemberships.length === 0) {
      return Response.json({ error: 'Group not found' }, { status: 404 });
    }
    const myMembership = myMemberships[0];
    const isOwner = myMembership.role === 'owner';

    const groupResults = await svc.entities.StudyGroup.filter({ id: group_id });
    if (!groupResults || groupResults.length === 0) {
      return Response.json({ error: 'Group not found' }, { status: 404 });
    }
    const group = groupResults[0];

    const memberships = await svc.entities.GroupMembership.filter({
      group_id,
      status: 'active',
    });

    const roster = (memberships || []).map((m) => {
      const entry = {
        display_name: m.display_name || 'Member',
        role: m.role,
        joined: m.created_date,
        is_self: m.user_email === user.email,
      };
      // Only the owner (teacher) sees member emails; peers see display names only.
      if (isOwner) entry.user_email = m.user_email;
      return entry;
    });

    // Assigned decks
    const assignmentsRaw = await svc.entities.GroupDeckAssignment.filter({ group_id });
    const deckIds = (assignmentsRaw || []).map((a) => a.deck_id).filter(Boolean);
    const decks = deckIds.length ? await svc.entities.Deck.filter({ id: { $in: deckIds } }) : [];
    const deckById = {};
    (decks || []).forEach((d) => { deckById[d.id] = d; });

    const cards = deckIds.length ? await svc.entities.Card.filter({ deck_id: { $in: deckIds } }) : [];
    const cardCountByDeck = {};
    (cards || []).forEach((c) => { cardCountByDeck[c.deck_id] = (cardCountByDeck[c.deck_id] || 0) + 1; });

    const mySubs = await svc.entities.DeckSubscription.filter({ user_email: user.email });
    const subDeckIds = new Set((mySubs || []).map((s) => s.deck_id));

    const assignments = (assignmentsRaw || []).map((a) => {
      const d = deckById[a.deck_id];
      return {
        deck_id: a.deck_id,
        deck_title: (d && d.title) || 'Untitled',
        deck_card_count: cardCountByDeck[a.deck_id] || 0,
        due_date: a.due_date || null,
        assigned_by: a.assigned_by,
        in_library: subDeckIds.has(a.deck_id),
      };
    });

    // Recent activity (last 20)
    const logs = await svc.entities.GroupMemberStudyLog.filter({ group_id }, '-created_date', 20);
    const activity = (logs || []).map((l) => ({
      display_name: l.display_name || 'Member',
      deck_title: l.deck_title || 'Deck',
      score_pct: l.score_pct,
      card_count: l.card_count,
      duration_ms: l.duration_ms,
      studied_at: l.studied_at,
      is_self: l.user_email === user.email,
    }));

    const response = {
      group_id: group.id,
      name: group.name,
      description: group.description || null,
      group_type: group.group_type,
      accent_color: group.accent_color || null,
      role: myMembership.role,
      roster,
      assignments,
      activity,
    };
    // The invite code is only exposed to the owner.
    if (isOwner) response.invite_code = group.invite_code;

    return Response.json(response);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});