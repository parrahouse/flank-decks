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

    // Confirm the caller has an active membership. RLS would hide StudyGroup
    // rows from non-owners entirely, so we verify membership first and return a
    // generic 404 whether the group is missing or the user simply isn't a member.
    const myMemberships = await base44.asServiceRole.entities.GroupMembership.filter({
      group_id,
      user_email: user.email,
      status: 'active',
    });
    if (!myMemberships || myMemberships.length === 0) {
      return Response.json({ error: 'Group not found' }, { status: 404 });
    }
    const myMembership = myMemberships[0];
    const isOwner = myMembership.role === 'owner';

    const groupResults = await base44.asServiceRole.entities.StudyGroup.filter({ id: group_id });
    if (!groupResults || groupResults.length === 0) {
      return Response.json({ error: 'Group not found' }, { status: 404 });
    }
    const group = groupResults[0];

    const memberships = await base44.asServiceRole.entities.GroupMembership.filter({
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

    const response = {
      group_id: group.id,
      name: group.name,
      description: group.description || null,
      group_type: group.group_type,
      accent_color: group.accent_color || null,
      role: myMembership.role,
      roster,
    };
    // The invite code is only exposed to the owner.
    if (isOwner) response.invite_code = group.invite_code;

    return Response.json(response);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});