import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, Settings2, Volume2, VolumeX, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export default function DeckSettings() {
  const { deckId } = useParams();
  const qc = useQueryClient();
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('flashdeck_sound') !== '0');

  const { data: deck } = useQuery({
    queryKey: ['deck', deckId],
    queryFn: () => base44.entities.Deck.filter({ id: deckId }).then(r => r[0]),
    enabled: !!deckId,
  });

  const { data: cards = [] } = useQuery({
    queryKey: ['cards', deckId],
    queryFn: () => base44.entities.Card.filter({ deck_id: deckId }, 'order'),
    enabled: !!deckId,
  });

  const activeCards = cards.filter(c => !c.deleted);

  const updateDeckMutation = useMutation({
    mutationFn: (data) => base44.entities.Deck.update(deckId, data),
    onSuccess: () => { qc.invalidateQueries(['deck', deckId]); toast.success('Settings saved'); },
  });

  const exportCsv = () => {
    const rows = [
      ['correct_answers', 'question_type', 'choice_2', 'choice_3', 'choice_4', 'choice_5', 'choice_6', 'clue', 'explanation', 'image_url', 'tags'],
      ...activeCards.map(c => {
        const correct = (c.correct_answers || c.correct_answer || '').split('|')[0].trim();
        const decoys = (c.choices || []).filter(ch => ch !== correct);
        const choiceCols = [decoys[0] || '', decoys[1] || '', decoys[2] || '', decoys[3] || '', decoys[4] || ''];
        return [
          c.correct_answers || c.correct_answer || '',
          c.question_type || 'multiple_choice',
          ...choiceCols,
          c.clue || '',
          c.explanation || '',
          c.image_url || '',
          (c.tags || []).join(';'),
        ];
      }),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deck?.title || 'deck'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!deck) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link to={`/deck/${deckId}`} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{deck.title}</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <Settings2 className="w-3.5 h-3.5" /> Deck Settings
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Study experience */}
        <Section title="Study Experience">
          <Row label="Clue / Eliminate feature" description="Allow players to reveal a clue or remove a wrong choice during study.">
            <Select
              value={deck.clue_mode || 'allowed'}
              onValueChange={(val) => updateDeckMutation.mutate({ clue_mode: val })}
            >
              <SelectTrigger className="h-9 text-sm w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="allowed">Allowed</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </Row>

          <Row label="Show clue by default" description="Whether the clue is revealed before the user attempts an answer.">
            <Select
              value={deck.clue_default_revealed ? 'yes' : 'no'}
              onValueChange={(val) => updateDeckMutation.mutate({ clue_default_revealed: val === 'yes' })}
            >
              <SelectTrigger className="h-9 text-sm w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no">Hidden</SelectItem>
                <SelectItem value="yes">Shown</SelectItem>
              </SelectContent>
            </Select>
          </Row>

          <Row label="Answer sounds" description="Play sound effects when answering cards.">
            <button
              onClick={() => {
                const next = !soundEnabled;
                setSoundEnabled(next);
                localStorage.setItem('flashdeck_sound', next ? '1' : '0');
              }}
              className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border transition-colors ${soundEnabled ? 'border-primary text-primary bg-accent' : 'border-border text-muted-foreground hover:text-foreground'}`}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              {soundEnabled ? 'On' : 'Off'}
            </button>
          </Row>
        </Section>

        {/* Data */}
        <Section title="Data">
          <Row label="Export cards" description="Download all cards in this deck as a CSV file.">
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={activeCards.length === 0} className="gap-1.5">
              <Download className="w-4 h-4" /> Export CSV
            </Button>
          </Row>
        </Section>

        {/* Mastery */}
        <Section title="Mastery Thresholds">
          <Row label="Min sessions for mastery" description="How many completed sessions before a card can be marked as mastered.">
            <Select
              value={String(deck.mastery_min_sessions ?? 3)}
              onValueChange={(val) => updateDeckMutation.mutate({ mastery_min_sessions: Number(val) })}
            >
              <SelectTrigger className="h-9 text-sm w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 5, 7, 10].map(n => (
                  <SelectItem key={n} value={String(n)}>{n} session{n !== 1 ? 's' : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>

          <Row label="Mastery % required" description="Minimum correct-answer rate to consider a card mastered.">
            <Select
              value={String(deck.mastery_pct ?? 90)}
              onValueChange={(val) => updateDeckMutation.mutate({ mastery_pct: Number(val) })}
            >
              <SelectTrigger className="h-9 text-sm w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[70, 75, 80, 85, 90, 95, 100].map(n => (
                  <SelectItem key={n} value={String(n)}>{n}%</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-muted/40 text-sm font-medium text-muted-foreground">
        {title}
      </div>
      <div className="divide-y divide-border">
        {children}
      </div>
    </div>
  );
}

function Row({ label, description, children }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5 gap-4">
      <div className="flex-1 min-w-0">
        <Label className="text-sm font-medium text-foreground">{label}</Label>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}