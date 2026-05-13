import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { StickyNote, Loader2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function CardNoteEditor({ cardId }) {
  const qc = useQueryClient();

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['card-note', cardId],
    queryFn: () => base44.entities.CardNote.filter({ card_id: cardId }),
    enabled: !!cardId,
  });

  const existing = notes[0] || null;

  const [noteText, setNoteText] = useState('');
  const [includeInShare, setIncludeInShare] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNoteText(existing?.note || '');
    setIncludeInShare(existing?.include_in_share ?? false);
  }, [existing?.id]);

  const handleSave = async () => {
    if (!noteText.trim()) {
      // Delete note if cleared
      if (existing) {
        setSaving(true);
        await base44.entities.CardNote.delete(existing.id);
        qc.invalidateQueries(['card-note', cardId]);
        qc.invalidateQueries({ predicate: q => q.queryKey[0] === 'card-notes-session' });
        setSaving(false);
        toast.success('Note removed');
      }
      return;
    }
    setSaving(true);
    if (existing) {
      await base44.entities.CardNote.update(existing.id, { note: noteText, include_in_share: includeInShare });
    } else {
      await base44.entities.CardNote.create({ card_id: cardId, note: noteText, include_in_share: includeInShare });
    }
    qc.invalidateQueries(['card-note', cardId]);
    qc.invalidateQueries({ predicate: q => q.queryKey[0] === 'card-notes-session' });
    setSaving(false);
    toast.success('Note saved');
  };

  if (!cardId) {
    return (
      <p className="text-xs text-amber-700/70 italic">Save the card first to add a note.</p>
    );
  }

  if (isLoading) {
    return <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-amber-500" /></div>;
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4 space-y-3">
      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
        <StickyNote className="w-4 h-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">Personal Note</span>
      </div>

      <Textarea
        value={noteText}
        onChange={e => setNoteText(e.target.value)}
        placeholder="Add a personal note for this card…"
        className="resize-none bg-white/70 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700 text-amber-900 dark:text-amber-100 placeholder:text-amber-400 focus-visible:ring-amber-400 min-h-[80px]"
        rows={3}
      />

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeInShare}
            onChange={e => setIncludeInShare(e.target.checked)}
            className="w-4 h-4 accent-amber-500 rounded"
          />
          <span className="text-xs text-amber-700 dark:text-amber-400">Include when sharing deck</span>
        </label>

        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving}
          className="h-7 text-xs bg-amber-500 hover:bg-amber-600 text-white border-0"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save Note'}
        </Button>
      </div>

      {existing && !noteText.trim() && (
        <p className="text-xs text-amber-600">Save with empty text to delete the note.</p>
      )}
    </div>
  );
}