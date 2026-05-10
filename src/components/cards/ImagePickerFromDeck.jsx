import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export default function ImagePickerFromDeck({ onSelect, onClose }) {
  const [search, setSearch] = useState('');

  const { data: allCards = [], isLoading } = useQuery({
    queryKey: ['cards-all-images'],
    queryFn: () => base44.entities.Card.list(),
  });

  const cardsWithImages = allCards.filter(c => c.image_url && !c.deleted);

  const filtered = search.trim()
    ? cardsWithImages.filter(c =>
        c.correct_answer?.toLowerCase().includes(search.toLowerCase())
      )
    : cardsWithImages;

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-background mt-2">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/40">
        <span className="text-xs font-medium text-muted-foreground">Pick from your decks</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="p-2">
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by answer…"
            className="pl-8 h-7 text-xs"
          />
        </div>
        {isLoading ? (
          <div className="grid grid-cols-4 gap-1.5">
            {[1,2,3,4].map(i => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No images found</p>
        ) : (
          <div className="grid grid-cols-4 gap-1.5 max-h-52 overflow-y-auto">
            {filtered.map(card => (
              <button
                key={card.id}
                onClick={() => onSelect(card.image_url)}
                className={cn(
                  'relative rounded-lg overflow-hidden border-2 border-transparent hover:border-primary transition-all group'
                )}
                title={card.correct_answer}
              >
                <img src={card.image_url} alt={card.correct_answer} className="w-full h-16 object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all" />
                <span className="absolute bottom-0 inset-x-0 text-white text-[10px] px-1 py-0.5 bg-black/50 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                  {card.correct_answer}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}