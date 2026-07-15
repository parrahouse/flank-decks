import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const svc = base44.asServiceRole.entities;
    const payload = await req.json();
    const action = payload.action;

    // The caller must own the collection. Returns null on missing OR not-owned —
    // callers surface a generic 404 either way, matching getGroupDetail's posture.
    async function ownedCollection(collectionId) {
      if (!collectionId) return null;
      const rows = await svc.Collection.filter({ id: collectionId });
      const col = rows && rows[0];
      if (!col || col.created_by !== user.email) return null;
      return col;
    }

    const notFound = () => Response.json({ error: 'Not found' }, { status: 404 });

    if (action === 'add') {
      const collectionId = payload.collection_id;
      const deckIds = Array.isArray(payload.deck_ids) ? payload.deck_ids : [];
      const col = await ownedCollection(collectionId);
      if (!col) return notFound();
      if (!deckIds.length) return Response.json({ rows: [] });

      // Every deck must belong to the caller. This is the check that closes the
      // escalation path: without it, any deck id in the payload gets linked.
      for (const id of deckIds) {
        const decks = await svc.Deck.filter({ id });
        const deck = decks && decks[0];
        if (!deck || deck.created_by !== user.email) return notFound();
      }

      const existing = (await svc.CollectionDeck.filter({ collection: collectionId })) || [];
      const have = new Set(existing.map((r) => r.deck));
      const toAdd = deckIds.filter((id) => !have.has(id));
      if (!toAdd.length) return Response.json({ rows: [] });

      let base = 0;
      for (const r of existing) base = Math.max(base, r.sort_order || 0);

      const rows = await svc.CollectionDeck.bulkCreate(
        toAdd.map((id, i) => ({
          collection: collectionId,
          deck: id,
          sort_order: base + 1 + i,
          owner_email: user.email,
        })),
      );
      return Response.json({ rows });
    }

    if (action === 'remove') {
      const rowIds = Array.isArray(payload.row_ids) ? payload.row_ids : [];
      for (const rowId of rowIds) {
        const found = await svc.CollectionDeck.filter({ id: rowId });
        const row = found && found[0];
        if (!row) continue;
        if (!(await ownedCollection(row.collection))) return notFound();
        await svc.CollectionDeck.delete(rowId);
      }
      return Response.json({ ok: true });
    }

    if (action === 'reorder') {
      const collectionId = payload.collection_id;
      const rows = Array.isArray(payload.rows) ? payload.rows : [];
      if (!(await ownedCollection(collectionId))) return notFound();

      const existing = (await svc.CollectionDeck.filter({ collection: collectionId })) || [];
      const valid = new Set(existing.map((r) => r.id));
      for (const r of rows) {
        if (!valid.has(r.id)) return notFound();
      }
      await svc.CollectionDeck.bulkUpdate(
        rows.map((r) => ({ id: r.id, sort_order: r.sort_order })),
      );
      return Response.json({ ok: true });
    }

    if (action === 'clear') {
      const collectionId = payload.collection_id;
      if (!(await ownedCollection(collectionId))) return notFound();
      const existing = (await svc.CollectionDeck.filter({ collection: collectionId })) || [];
      for (const r of existing) await svc.CollectionDeck.delete(r.id);
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});