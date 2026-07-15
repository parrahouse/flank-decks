import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Link2, Layers } from 'lucide-react';
import AddDeckByLinkDialog from '@/components/deck/AddDeckByLinkDialog';

export default function Discover() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [showAddLink, setShowAddLink] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['discover-decks', submitted],
    queryFn: () => base44.functions.invoke('searchPublicDecks', { query: submitted }).then((r) => r.data),
  });
  const decks = data?.decks ?? [];

  const onSubmit = (e) => { e.preventDefault(); setSubmitted(query); };

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Discover</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Browse public decks shared by the community.</p>
        </div>
        <Button variant="outline" onClick={() => setShowAddLink(true)} className="gap-1.5">
          <Link2 className="w-4 h-4" /> Add via link
        </Button>
      </div>

      <form onSubmit={onSubmit} className="mb-6">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search decks by title or description…"
            className="pl-9"
          />
        </div>
      </form>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : decks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center">
            <Layers className="w-8 h-8 text-accent-foreground" />
          </div>
          <h2 className="font-semibold text-lg">No public decks found</h2>
          <p className="text-muted-foreground text-sm max-w-xs">Try a different search, or add a deck directly with a sharing link.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {decks.map((deck) => (
            <Link
              key={deck.id}
              to={`/shared/${deck.share_token}`}
              className="group rounded-xl border border-border bg-card overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="aspect-video bg-muted overflow-hidden">
                {deck.cover_image_url ? (
                  <img
                    src={deck.cover_image_url}
                    alt={deck.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <Layers className="w-8 h-8" />
                  </div>
                )}
              </div>
              <div className="p-3 space-y-1">
                <h3 className="font-semibold truncate">{deck.title}</h3>
                {deck.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{deck.description}</p>
                )}
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                  <span>{deck.card_count} cards</span>
                  <span className="truncate max-w-[55%]">by {deck.author}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <AddDeckByLinkDialog open={showAddLink} onClose={() => setShowAddLink(false)} />
    </div>
  );
}