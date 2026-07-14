import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

function generateInviteCode() {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

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
    const name = (payload.name || '').trim();
    const group_type = payload.group_type;
    const description = payload.description || undefined;
    const accent_color = payload.accent_color || undefined;
    const display_name = (payload.display_name || '').trim() || emailPrefix(user.email);

    if (!name) return Response.json({ error: 'name is required' }, { status: 400 });
    if (group_type !== 'peer' && group_type !== 'classroom') {
      return Response.json({ error: 'group_type must be "peer" or "classroom"' }, { status: 400 });
    }

    // Generate a unique invite code (max 5 attempts)
    let invite_code = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateInviteCode();
      const existing = await base44.asServiceRole.entities.StudyGroup.filter({ invite_code: candidate });
      if (!existing || existing.length === 0) {
        invite_code = candidate;
        break;
      }
    }
    if (!invite_code) {
      return Response.json({ error: 'Failed to generate unique invite code' }, { status: 500 });
    }

    // Create the StudyGroup as service role (create rule is admin-only, so the
    // caller's client cannot create it). Service-role writes attribute created_by
    // to the service role, NOT the caller, so we store the caller's email in
    // owner_email — the read RLS matches on data.owner_email to let the owner
    // read their own group.
    const group = await base44.asServiceRole.entities.StudyGroup.create({
      name,
      description,
      group_type,
      invite_code,
      accent_color,
      owner_email: user.email,
    });

    // Create the owner's GroupMembership row
    await base44.asServiceRole.entities.GroupMembership.create({
      group_id: group.id,
      user_email: user.email,
      role: 'owner',
      status: 'active',
      display_name,
    });

    return Response.json({
      group_id: group.id,
      name,
      group_type,
      invite_code,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});