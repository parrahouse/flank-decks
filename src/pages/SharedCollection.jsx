import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { GalleryVerticalEnd, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function SharedCollection() {
  const { token } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: ['shared-collection', token],
    queryFn: async () => {
      const res = await base44.functions.invoke('getSharedCollection', { share_token: token });
      const status = res?.status ?? 200;
      if (status >= 400) {
        const err = new Error(res?.data?.error || 'Collection not found');
        err.status = status;
        throw err;
      }
      return res.data;
    },
    retry: false,
    enabled: !!token,
  });

  const collection = data?.collection || null;
  const decks = data?.decks || [];
  const cards = data?.cards || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3 text-center px-4">
        <h1 className="text-2xl font-bold">Collection not found</h1>
        <p className="text-muted-foreground text-sm">This link may have expired or sharing may have been disabled.</p>
      </div>
    );
  }

  const getCoverUrl = (deck) => {
    if (deck.cover_image_url) return deck.cover_image_url;
    const firstCard = cards.find((c) => c.deck_id === deck.id && c.image_url);
    return firstCard?.image_url || null;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="flex items-start gap-3 mb-8">
        <span
          className="w-4 h-4 rounded-full mt-1.5 shrink-0"
          style={{ backgroundColor: collection.accent_color || '#64748b' }}
        />
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">{collection.name}</h1>
          {collection.description && (
            <p className="text-muted-foreground mt-1">{collection.description}</p>
          )}
          <p className="text-sm text-muted-foreground mt-2">
            {decks.length} {decks.length === 1 ? 'deck' : 'decks'}
          </p>
        </div>
      </div>

      {/* Deck grid */}
      {decks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <GalleryVerticalEnd className="w-10 h-10 text-muted-foreground" />
          <p className="text-muted-foreground">No decks in this collection yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {decks.map((deck) => {
            const coverUrl = getCoverUrl(deck);
            const fp = deck.cover_focal_point;
            const objectPosition = fp ? `${fp.x}% ${fp.y}%` : '50% 50%';
            const cardCount = cards.filter((c) => c.deck_id === deck.id && !c.deleted).length;

            return (
              <div key={deck.id} className="bg-card border border-border rounded-md overflow-hidden flex flex-col hover:shadow-md transition-all">
                <div className="h-32 bg-muted relative overflow-hidden">
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt=""
                      className="w-full h-full object-cover"
                      style={{ objectPosition }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <BookOpen className="w-8 h-8 text-muted-foreground/40" />
                    </div>
                  )}
                </div>
                <div className="p-4 flex flex-col gap-1 flex-1">
                  <h3 className="font-semibold text-foreground truncate">{deck.title}</h3>
                  {deck.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{deck.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {cardCount} {cardCount === 1 ? 'card' : 'cards'}
                  </p>
                  {deck.share_token && (
                    <Link
                      to={`/shared/${deck.share_token}`}
                      className="mt-2"
                    >
                      <Button size="sm" className="w-full gap-1.5">
                        <BookOpen className="w-3.5 h-3.5" /> Study deck
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}