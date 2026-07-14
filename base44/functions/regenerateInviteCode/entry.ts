import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Invite-code generation. This alphabet/length MUST stay identical to
// createGroup; because backend functions deploy independently (no local
// imports), the helper is inlined here. Keep both copies in sync.
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let payload = {};
    try { payload = await req.json(); } catch (_e) { /* empty body */ }
    const group_id = (payload.group_id || '').trim();
    if (!group_id) return Response.json({ error: 'Group not found' }, { status: 404 });

    const groupResults = await base44.asServiceRole.entities.StudyGroup.filter({ id: group_id });
    if (!groupResults || groupResults.length === 0) {
      return Response.json({ error: 'Group not found' }, { status: 404 });
    }
    const group = groupResults[0];

    // Only the owner (matched by owner_email) may regenerate the code.
    if (group.owner_email !== user.email) {
      return Response.json({ error: 'Only the group owner can regenerate the invite code' }, { status: 403 });
    }

    // Generate a fresh unique code (max 5 attempts) — same logic as createGroup.
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

    await base44.asServiceRole.entities.StudyGroup.update(group.id, { invite_code });

    return Response.json({ invite_code });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});