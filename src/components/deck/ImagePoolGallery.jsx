import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, Loader2, Search } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function ImagePoolGallery({ deckTitle, deckDescription, selected, onSelect }) {
  const [tagQuery, setTagQuery] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [suggestedOrder, setSuggestedOrder] = useState(null); // array of ids, or null

  const { data: pool = [], isLoading } = useQuery({
    queryKey: ['image-pool'],
    queryFn: () => base44.entities.ImagePool.list('-created_date', 200),
  });

  const filtered = useMemo(() => {
    let list = pool;
    const q = tagQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => (p.tags || []).some((t) => t.toLowerCase().includes(q)));
    }
    if (suggestedOrder) {
      const idx = new Map(suggestedOrder.map((id, i) => [id, i]));
      list = [...list].sort((a, b) => {
        const ai = idx.has(a.id) ? idx.get(a.id) : 9999;
        const bi = idx.has(b.id) ? idx.get(b.id) : 9999;
        return ai - bi;
      });
    }
    return list;
  }, [pool, tagQuery, suggestedOrder]);

  const suggest = async () => {
    if (!pool.length) return;
    setSuggesting(true);
    try {
      const catalog = pool
        .map((p) => ({ id: p.id, tags: (p.tags || []).join(', ') }))
        .filter((p) => p.tags);
      if (catalog.length === 0) {
        toast.message('Tag your pool images first so the system can match them.');
        setSuggesting(false);
        return;
      }
      const result = await base44.integrations.Core.InvokeLLM({
        prompt:
          `You are matching stock images to a flashcard deck so it can pick a cover.\n` +
          `Deck title: "${deckTitle || ''}"\n` +
          `Deck description: "${deckDescription || ''}"\n\n` +
          `Available tagged stock images:\n` +
          catalog.map((c) => `${c.id}: ${c.tags}`).join('\n') +
          `\n\nReturn the ids of the images most likely to be a good cover for this deck, ranked best first. ` +
          `Return up to 8 ids. Only include ids from the list above. Return JSON.`,
        response_json_schema: {
          type: 'object',
          properties: {
            ids: { type: 'array', items: { type: 'string' } },
          },
          required: ['ids'],
        },
      });
      const ids = (result && result.ids) || (typeof result === 'string' ? [] : []);
      setSuggestedOrder(ids.filter((id) => pool.some((p) => p.id === id)));
      if (ids.length === 0) toast.message('No matches found.');
    } catch (e) {
      toast.error('Could not generate suggestions.');
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Image pool</p>
        <button
          type="button"
          onClick={suggest}
          disabled={suggesting || !pool.length}
          className="flex items-center gap-1 text-xs text-primary hover:underline font-medium disabled:opacity-50"
        >
          {suggesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          Suggest
        </button>
      </div>

      <div className="relative mb-2">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={tagQuery}
          onChange={(e) => setTagQuery(e.target.value)}
          placeholder="Filter by tag…"
          className="w-full text-xs border border-border rounded-md pl-8 pr-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">
          {pool.length === 0 ? 'Pool is empty. Add images by checking "Add to image pool" when uploading.' : 'No images match.'}
        </p>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelect(p.image_url)}
              title={(p.tags || []).join(', ')}
              className={cn(
                'relative rounded-lg overflow-hidden h-16 border-2 transition-all',
                selected === p.image_url ? 'border-primary' : 'border-transparent hover:border-primary/40'
              )}
            >
              <img src={p.image_url} alt={p.tags?.[0] || 'pool image'} className="w-full h-full object-cover" />
              {selected === p.image_url && (
                <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                  <span className="text-primary text-[10px] font-bold bg-white/80 rounded px-1">Selected</span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}