import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const { event, data, old_data } = payload;
    const cardId = event?.entity_id;

    if (!cardId) {
      return Response.json({ error: 'No card ID in payload' }, { status: 400 });
    }

    // SAFETY: this automation is restricted to card CREATION only.
    // If it is ever triggered for any other event type (update/delete) or
    // invoked manually, refuse to run and warn instead of mutating data.
    if (event?.type && event.type !== 'create') {
      console.warn(`[linkCardToConcept] BLOCKED — triggered for event "${event.type}" on card ${cardId}, but this automation is restricted to card creation only. No action taken.`);
      return Response.json({
        skipped: true,
        warning: `linkCardToConcept is restricted to card creation; ignored "${event.type}" event for card ${cardId}.`,
      });
    }

    // Fetch full card data if not provided (e.g. payload_too_large)
    let card = data;
    if (!card) {
      card = await base44.asServiceRole.entities.Card.get(cardId);
    }

    // Skip deleted or cards with no meaningful content
    if (card.deleted || (!card.correct_answers && !card.explanation)) {
      return Response.json({ skipped: true });
    }

    // Skip if nothing relevant changed on updates
    if (event.type === 'update' && old_data) {
      const relevant = ['correct_answers', 'explanation', 'clue', 'choices'];
      const changed = relevant.some(f => old_data[f] !== card[f]);
      if (!changed) return Response.json({ skipped: true, reason: 'no relevant field changed' });
    }

    // Fetch all existing concepts for context
    const existingConcepts = await base44.asServiceRole.entities.Concept.list();

    const conceptList = existingConcepts.map(c => ({
      id: c.id,
      concept_name: c.concept_name,
      topic: c.topic || ''
    }));

    // Ask LLM to identify the concept and relationships
    const analysisResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `You are analyzing a flashcard to determine the concept it tests and its relationships to other concepts.

CARD CONTENT:
- Correct answer(s): ${card.correct_answers || '(none)'}
- Choices: ${(card.choices || []).join(', ')}
- Clue: ${card.clue || '(none)'}
- Explanation: ${card.explanation ? card.explanation.replace(/<[^>]+>/g, '') : '(none)'}

EXISTING CONCEPTS (id, name, topic):
${conceptList.length > 0 ? conceptList.map(c => `- id="${c.id}" name="${c.concept_name}" topic="${c.topic}"`).join('\n') : '(none yet)'}

TASKS:
1. Identify the single concept being tested by this card. Give it a short, precise name (e.g. "Taxation without Representation") and a broader topic (e.g. "American Revolution").
2. If this concept already exists in the EXISTING CONCEPTS list (match by name similarity), return its id as "existing_concept_id". Otherwise return null.
3. Identify up to 3 meaningful directed relationships between this card's concept and ANY of the existing concepts. Use only these relationship types:
   - prerequisite_of: the FROM concept must be understood before the TO concept
   - causes: the FROM concept leads to or produces the TO concept
   - interprets: the FROM concept provides a framework or lens for understanding the TO concept
   - exemplifies: the FROM concept is a concrete example of the TO concept

Return a JSON object with this exact structure:
{
  "concept_name": "string",
  "topic": "string",
  "existing_concept_id": "string or null",
  "relationships": [
    { "from_concept_name": "string", "to_concept_name": "string", "relationship_type": "prerequisite_of|causes|interprets|exemplifies" }
  ]
}

Only include relationships where BOTH concepts are meaningful and clearly related. Return an empty array if none apply.`,
      response_json_schema: {
        type: 'object',
        properties: {
          concept_name: { type: 'string' },
          topic: { type: 'string' },
          existing_concept_id: { type: 'string' },
          relationships: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                from_concept_name: { type: 'string' },
                to_concept_name: { type: 'string' },
                relationship_type: { type: 'string' }
              }
            }
          }
        }
      }
    });

    const { concept_name, topic, existing_concept_id, relationships = [] } = analysisResult;

    // Resolve or create the concept
    let conceptId = existing_concept_id || null;

    if (!conceptId) {
      const newConcept = await base44.asServiceRole.entities.Concept.create({
        concept_name,
        topic: topic || ''
      });
      conceptId = newConcept.id;
    }

    // Link the card to the concept
    await base44.asServiceRole.entities.Card.update(cardId, { concept_id: conceptId });

    // Build a lookup map: concept_name (lowercase) -> id
    const nameToId = {};
    for (const c of existingConcepts) {
      nameToId[c.concept_name.toLowerCase()] = c.id;
    }
    // Include the newly created concept too
    if (concept_name) nameToId[concept_name.toLowerCase()] = conceptId;

    // Fetch existing relationships to avoid duplicates
    const existingRelationships = await base44.asServiceRole.entities.CardRelationship.list();
    const relKey = (from, to, type) => `${from}__${to}__${type}`;
    const existingRelKeys = new Set(
      existingRelationships.map(r => relKey(r.from_concept_id, r.to_concept_id, r.relationship_type))
    );

    // Write new relationships
    const created = [];
    for (const rel of relationships) {
      const fromId = nameToId[rel.from_concept_name?.toLowerCase()];
      const toId = nameToId[rel.to_concept_name?.toLowerCase()];
      const type = rel.relationship_type;

      const validTypes = ['prerequisite_of', 'causes', 'interprets', 'exemplifies'];
      if (!fromId || !toId || fromId === toId || !validTypes.includes(type)) continue;
      if (existingRelKeys.has(relKey(fromId, toId, type))) continue;

      await base44.asServiceRole.entities.CardRelationship.create({
        from_concept_id: fromId,
        to_concept_id: toId,
        relationship_type: type
      });
      existingRelKeys.add(relKey(fromId, toId, type));
      created.push({ fromId, toId, type });
    }

    return Response.json({
      success: true,
      concept_id: conceptId,
      concept_name,
      relationships_created: created.length
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});