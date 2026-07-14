import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // The caller's active memberships (service role — GroupMembership read RLS
    // only matches the caller's own user_email, so a client-side query would
    // also work, but service role is consistent with the rest of this flow).
    const memberships = await base44.asServiceRole.entities.GroupMembership.filter({
      user_email: user.email,
      status: 'active',
    });

    const groupIds = (memberships || []).map((m) => m.group_id).filter(Boolean);
    if (groupIds.length === 0) {
      return Response.json({ groups: [] });
    }

    // Fetch the corresponding StudyGroups. Try a single $in query first; if the
    // SDK rejects $in, fall back to per-id fetches. Deleted groups leave orphan
    // membership rows — those simply won't appear in the result and are skipped.
    let groups = [];
    try {
      const result = await base44.asServiceRole.entities.StudyGroup.filter({ id: { $in: groupIds } });
      groups = result || [];
    } catch (_e) {
      const perId = await Promise.all(
        groupIds.map((id) =>
          base44.asServiceRole.entities.StudyGroup.filter({ id }).then((r) => (r && r[0]) || null).catch(() => null)
        )
      );
      groups = perId.filter(Boolean);
    }

    const groupMap = {};
    groups.forEach((g) => { groupMap[g.id] = g; });

    // Count active members for each surviving group in parallel.
    const survivorIds = Object.keys(groupMap);
    const counts = await Promise.all(
      survivorIds.map((gid) =>
        base44.asServiceRole.entities.GroupMembership.filter({ group_id: gid, status: 'active' }).then((r) => (r || []).length)
      )
    );
    const countMap = {};
    survivorIds.forEach((gid, i) => { countMap[gid] = counts[i]; });

    // Build the response, skipping orphan memberships (group no longer exists).
    const out = (memberships || [])
      .filter((m) => groupMap[m.group_id])
      .map((m) => {
        const g = groupMap[m.group_id];
        return {
          group_id: g.id,
          name: g.name,
          description: g.description || null,
          group_type: g.group_type,
          accent_color: g.accent_color || null,
          role: m.role,
          member_count: countMap[g.id] || 0,
        };
      });

    // Never include invite_code or owner_email here.
    return Response.json({ groups: out });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});