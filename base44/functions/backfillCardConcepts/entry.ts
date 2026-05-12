import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Processes a batch of cards by delegating to linkCardToConcept.
// Call with { offset: 0, batchSize: 5 } and repeat with increasing offsets
// until processed === 0.
// Requires a secret header: X-Backfill-Key matching BACKFILL_SECRET env var.
Deno.serve(async (req) => {
  try {
    const secret = Deno.env.get('BACKFILL_SECRET');
    if (secret && req.headers.get('x-backfill-key') !== secret) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const offset = body.offset ?? 0;
    const batchSize = Math.min(body.batchSize ?? 5, 10);

    const cards = await base44.asServiceRole.entities.Card.filter(
      { deleted: false },
      'created_date',
      batchSize,
      offset
    );

    if (cards.length === 0) {
      return Response.json({ success: true, offset, processed: 0, done: true });
    }

    const results = [];
    for (const card of cards) {
      const res = await base44.asServiceRole.functions.invoke('linkCardToConcept', {
        event: { type: 'create', entity_name: 'Card', entity_id: card.id },
        data: card,
        old_data: null
      });
      results.push({ card_id: card.id, result: res });
    }

    return Response.json({
      success: true,
      offset,
      processed: results.length,
      next_offset: offset + results.length,
      done: results.length < batchSize,
      results
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});