import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function emailPrefix(email) {
  if (!email) return 'Member';
  const local = email.split('@')[0] || 'Member';
  return local.charAt(0).toUpperCase() + local.slice(1);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    // Normalize first (trim + uppercase) so a lowercase but valid code still succeeds.
    const rawCode = (payload.invite_code || '').trim().toUpperCase();
    const display_name = (payload.display_name || '').trim() || emailPrefix(user.email);

    if (!rawCode) return Response.json({ error: 'Invalid invite code' }, { status: 404 });

    // Format validation: exactly 8 chars from the invite-code alphabet.
    // Because RLS is row-level, an owner can edit their own invite_code
    // client-side (including copying another group's code), so we validate
    // the format and detect collisions before trusting a lookup.
    const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    if (rawCode.length !== 8 || !rawCode.split('').every(c => CODE_ALPHABET.includes(c))) {
      return Response.json({ error: 'Invalid invite code' }, { status: 404 });
    }

    // Look up the group by invite_code (service role — invite_code is secret)
    const groups = await base44.asServiceRole.entities.StudyGroup.filter({ invite_code: rawCode });
    if (!groups || groups.length === 0) {
      return Response.json({ error: 'Invalid invite code' }, { status: 404 });
    }
    if (groups.length > 1) {
      // Invite code collision — two groups share the same code (an owner
      // may have copied another group's code client-side). Do not guess;
      // refuse the join.
      console.error('Invite code collision for code', rawCode, '— group ids:', groups.map(g => g.id));
      return Response.json({ error: 'Invite code conflict; ask the group owner to regenerate' }, { status: 409 });
    }
    const group = groups[0];

    // Check for an existing membership for this user + group
    const existing = await base44.asServiceRole.entities.GroupMembership.filter({
      group_id: group.id,
      user_email: user.email,
    });

    if (existing && existing.length > 0) {
      const membership = existing[0];
      if (membership.status === 'active') {
        // Already a member — do not create a duplicate
        return Response.json({
          already_member: true,
          group_id: group.id,
          name: group.name,
          group_type: group.group_type,
        });
      }
      // Removed row — reactivate
      await base44.asServiceRole.entities.GroupMembership.update(membership.id, {
        status: 'active',
        display_name,
      });
      return Response.json({
        group_id: group.id,
        name: group.name,
        group_type: group.group_type,
      });
    }

    // No existing membership — create one
    await base44.asServiceRole.entities.GroupMembership.create({
      group_id: group.id,
      user_email: user.email,
      role: 'member',
      status: 'active',
      display_name,
    });

    return Response.json({
      group_id: group.id,
      name: group.name,
      group_type: group.group_type,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});