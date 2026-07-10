import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles, Plus, RefreshCw, Check, X } from 'lucide-react';

/**
 * Asks AI to suggest new flash cards based on the existing deck's concepts,
 * then lets the user pick which ones to add.
 */
export default function AiCardSuggestionsModal({ open, onClose, deck, activeCards, onAddCards }) {
  const [suggestions, setSuggestions] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [generated, setGenerated] = useState(false);

  const generate = async () => {
    setLoading(true);
    setGenerated(false);
    setSuggestions([]);
    setSelected(new Set());

    const existingConcepts = activeCards
      .map(c => c.correct_answers || c.correct_answer)
      .filter(Boolean)
      .slice(0, 80)
      .join(', ');

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are helping a student build a flashcard deck titled "${deck?.title}".
The deck already covers these concepts: ${existingConcepts}.
Suggest 8 NEW flashcard questions that complement what's already there — covering related concepts, common misconceptions, or important gaps.
Each card should have:
- A concise answer/term (the "correct answer")
- A one-sentence question or prompt
- 3 plausible but wrong distractor choices (so 4 choices total including the correct one)
- An optional short clue (one sentence hint)
Do NOT duplicate any concept already in the list above.`,
      response_json_schema: {
        type: 'object',
        properties: {
          cards: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                correct_answer: { type: 'string' },
                question: { type: 'string' },
                distractors: { type: 'array', items: { type: 'string' } },
                clue: { type: 'string' },
              },
            },
          },
        },
      },
    });

    const cards = result?.cards || [];
    setSuggestions(cards);
    setSelected(new Set(cards.map((_, i) => i)));
    setGenerated(true);
    setLoading(false);
  };

  const toggleSelect = (i) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const handleAdd = async () => {
    setAdding(true);
    const toAdd = suggestions
      .filter((_, i) => selected.has(i))
      .map(s => ({
        correct_answers: s.correct_answer,
        correct_answer: s.correct_answer,
        question_type: 'multiple_choice',
        choices: [s.correct_answer, ...(s.distractors || []).slice(0, 3)].sort(() => Math.random() - 0.5),
        clue: s.clue || '',
      }));
    await onAddCards(toAdd);
    setAdding(false);
    onClose();
  };

  const handleOpenChange = (open) => {
    if (!open) {
      setSuggestions([]);
      setSelected(new Set());
      setGenerated(false);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> AI Card Suggestions
          </DialogTitle>
        </DialogHeader>

        {!generated && !loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-accent-foreground" />
            </div>
            <div>
              <p className="font-semibold text-base">Generate card suggestions</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                AI will analyse your existing {activeCards.length} card{activeCards.length !== 1 ? 's' : ''} and suggest new ones that fill gaps or cover related concepts.
              </p>
            </div>
            <Button onClick={generate} className="gap-2 mt-2">
              <Sparkles className="w-4 h-4" /> Generate suggestions
            </Button>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="w-7 h-7 border-4 border-muted border-t-primary rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Analysing your deck…</p>
          </div>
        )}

        {generated && !loading && (
          <>
            <div className="flex items-center justify-between mb-2 shrink-0">
              <p className="text-sm text-muted-foreground">
                {selected.size} of {suggestions.length} selected
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelected(suggestions.size === selected.size ? new Set() : new Set(suggestions.map((_, i) => i)))}
                  className="text-xs text-primary hover:underline"
                >
                  {selected.size === suggestions.length ? 'Deselect all' : 'Select all'}
                </button>
                <button onClick={generate} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Regenerate
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => toggleSelect(i)}
                  className={`w-full text-left border rounded-lg px-4 py-3 transition-all ${
                    selected.has(i)
                      ? 'border-primary bg-accent/40'
                      : 'border-border bg-card hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                      selected.has(i) ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                    }`}>
                      {selected.has(i) && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm">{s.correct_answer}</p>
                      {s.question && <p className="text-xs text-muted-foreground mt-0.5">{s.question}</p>}
                      {s.clue && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 italic">Clue: {s.clue}</p>
                      )}
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {(s.distractors || []).slice(0, 3).map((d, j) => (
                          <span key={j} className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                            {d}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex justify-end gap-2 mt-4 shrink-0 pt-2 border-t border-border">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button
                onClick={handleAdd}
                disabled={selected.size === 0 || adding}
                className="gap-1.5"
              >
                {adding
                  ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Adding…</>
                  : <><Plus className="w-4 h-4" /> Add {selected.size} card{selected.size !== 1 ? 's' : ''}</>
                }
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}