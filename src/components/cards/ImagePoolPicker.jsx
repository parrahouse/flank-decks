import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Search, X, Images, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * ImagePoolPicker — browse the user's reusable ImagePool and pick an image
 * for the current card. Filters by tag or name substring.
 */
export default function ImagePoolPicker({ onSelect, onClose }) {
  const [search, setSearch] = useState('');

  const { data: pool = [], isLoading } = useQuery({
    queryKey: ['image-pool'],
    queryFn: () => base44.entities.ImagePool.list('-created_date', 200),
  });

  const q = search.trim().toLowerCase();
  const filtered = q
    ? pool.filter((p) =>
        (p.tags || []).some((t) => t.toLowerCase().includes(q)) ||
        (p.name || '').toLowerCase().includes(q)
      )
    : pool;

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-background mt-2">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/40">
        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Images className="w-3.5 h-3.5" /> Image pool
        </span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="p-2">
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by tag or name…"
            className="pl-8 h-7 text-xs"
          />
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            {pool.length === 0 ? 'Your pool is empty.' : 'No images match your search.'}
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-1.5 max-h-52 overflow-y-auto">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => onSelect(p.image_url)}
                className={cn(
                  'relative rounded-lg overflow-hidden border-2 border-transparent hover:border-primary transition-all group'
                )}
                title={(p.tags || []).join(', ') || p.name}
              >
                <img src={p.image_url} alt={p.name || 'pool image'} className="w-full h-16 object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all" />
                {(p.tags || []).length > 0 && (
                  <span className="absolute bottom-0 inset-x-0 text-white text-[10px] px-1 py-0.5 bg-black/50 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                    {p.tags[0]}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}