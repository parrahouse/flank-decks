import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { username } = await req.json().catch(() => ({}));
    const clean = (username || '').trim();
    if (!clean) return Response.json({ error: 'Username is required' }, { status: 400 });
    if (clean.length < 3 || clean.length > 24) {
      return Response.json({ error: 'Username must be 3–24 characters' }, { status: 400 });
    }
    if (!/^[A-Za-z0-9_.-]+$/.test(clean)) {
      return Response.json({ error: 'Use only letters, numbers, underscore, dot, or hyphen' }, { status: 400 });
    }

    const svc = base44.asServiceRole;

    // Uniqueness check (case-insensitive) across all users.
    const all = await svc.entities.User.list('-created_date', 500);
    const taken = all.find(
      (u) => u.id !== user.id && (u.username || '').toLowerCase() === clean.toLowerCase()
    );
    if (taken) return Response.json({ error: 'That username is taken' }, { status: 409 });

    await svc.entities.User.update(user.id, { username: clean });

    return Response.json({ username: clean });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});