import { useState, useEffect } from 'react';
import { Search, Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function ImageSearchPanel({ defaultQuery, onSelect, onClose }) {
  const [query, setQuery] = useState(defaultQuery || '');
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);

  const search = async (q) => {
    if (!q.trim()) return;
    setLoading(true);
    const res = await base44.functions.invoke('wikimediaImageSearch', { query: q.trim() });
    setImages(res.data?.images || []);
    setLoading(false);
  };

  useEffect(() => {
    if (defaultQuery) search(defaultQuery);
  }, []);

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/40">
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search(query)}
          placeholder="Search Wikimedia Commons…"
          className="h-7 border-0 bg-transparent focus-visible:ring-0 px-0 text-sm"
        />
        {query && (
          <button onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <Button size="sm" variant="ghost" onClick={() => search(query)} disabled={loading} className="h-7 px-2 shrink-0">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
        </Button>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Results grid */}
      <div className="p-2 max-h-64 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : images.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">No results. Try a different search term.</p>
        ) : (
          <div className="grid grid-cols-4 gap-1.5">
            {images.map((img, i) => (
              <button
                key={i}
                onClick={() => onSelect(img.fullUrl)}
                className="aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-primary transition-all focus:outline-none focus:border-primary"
                title={img.title}
              >
                <img
                  src={img.url}
                  alt={img.title}
                  className="w-full h-full object-cover"
                  onError={e => { e.target.parentElement.style.display = 'none'; }}
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}