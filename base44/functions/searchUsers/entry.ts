import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { query } = await req.json().catch(() => ({}));
    const svc = base44.asServiceRole;

    // Service role bypasses built-in User RLS so we can resolve share targets.
    const users = await svc.entities.User.list('-created_date', 500);

    const q = (query || '').trim().toLowerCase();
    const matched = q
      ? users.filter(
          (u) =>
            u.id !== user.id &&
            ((u.email || '').toLowerCase().includes(q) ||
             (u.username || '').toLowerCase().includes(q) ||
             (u.full_name || '').toLowerCase().includes(q))
        )
      : users.filter((u) => u.id !== user.id);

    const results = matched.slice(0, 20).map((u) => ({
      id: u.id,
      email: u.email,
      username: u.username || null,
      full_name: u.full_name || null,
    }));

    return Response.json({ users: results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});