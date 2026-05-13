import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Tag, Link2, ArrowRight } from 'lucide-react';

const RELATIONSHIP_LABELS = {
  prerequisite_of: 'Prerequisite of',
  causes: 'Causes',
  interprets: 'Interprets',
  exemplifies: 'Exemplifies',
};

export default function ConceptsTab({ card }) {
  const conceptId = card?.concept_id;

  const { data: concept, isLoading: loadingConcept } = useQuery({
    queryKey: ['concept', conceptId],
    queryFn: () => base44.entities.Concept.filter({ id: conceptId }).then(r => r[0]),
    enabled: !!conceptId,
  });

  const { data: allRelationships = [], isLoading: loadingRels } = useQuery({
    queryKey: ['relationships', conceptId],
    queryFn: () => base44.entities.CardRelationship.list(),
    enabled: !!conceptId,
  });

  const { data: allConcepts = [] } = useQuery({
    queryKey: ['concepts-all'],
    queryFn: () => base44.entities.Concept.list(),
    enabled: !!conceptId,
  });

  const conceptMap = Object.fromEntries(allConcepts.map(c => [c.id, c]));

  const relatedRels = allRelationships.filter(
    r => r.from_concept_id === conceptId || r.to_concept_id === conceptId
  );

  if (!card?.id) {
    return <p className="text-sm text-muted-foreground">Save the card first to see concepts.</p>;
  }

  if (!conceptId) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2 text-center text-muted-foreground">
        <Tag className="w-8 h-8 opacity-40" />
        <p className="text-sm font-medium">No concept linked yet</p>
        <p className="text-xs max-w-xs">Concepts are automatically linked when a card is saved. Edit and re-save this card to trigger analysis.</p>
      </div>
    );
  }

  if (loadingConcept || loadingRels) {
    return <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* Concept */}
      <div className="bg-accent/50 rounded-xl p-4 space-y-1">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          <Tag className="w-3.5 h-3.5" /> Concept
        </div>
        <p className="font-semibold text-foreground text-base">{concept?.concept_name}</p>
        {concept?.topic && <p className="text-sm text-muted-foreground">{concept.topic}</p>}
      </div>

      {/* Relationships */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <Link2 className="w-3.5 h-3.5" /> Relationships
        </div>
        {relatedRels.length === 0 ? (
          <p className="text-sm text-muted-foreground">No relationships found for this concept.</p>
        ) : (
          <div className="space-y-2">
            {relatedRels.map(rel => {
              const from = conceptMap[rel.from_concept_id];
              const to = conceptMap[rel.to_concept_id];
              const isSource = rel.from_concept_id === conceptId;
              return (
                <div key={rel.id} className="flex items-center gap-2 text-sm bg-card border border-border rounded-lg px-3 py-2">
                  <span className={`font-medium truncate ${isSource ? 'text-primary' : 'text-foreground'}`}>
                    {from?.concept_name || '…'}
                  </span>
                  <div className="flex items-center gap-1 shrink-0 text-xs text-muted-foreground">
                    <ArrowRight className="w-3.5 h-3.5" />
                    <span className="italic">{RELATIONSHIP_LABELS[rel.relationship_type] || rel.relationship_type}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                  <span className={`font-medium truncate ${!isSource ? 'text-primary' : 'text-foreground'}`}>
                    {to?.concept_name || '…'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}