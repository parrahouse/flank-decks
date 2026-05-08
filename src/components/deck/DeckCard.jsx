import { Link } from 'react-router-dom';
import { MoreHorizontal, BookOpen, Copy, Trash2, Share2, Pencil, LayoutList, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

export default function DeckCard({ deck, cardCount, coverUrl, onEdit, onDelete, onDuplicate, onShare, onSetCover }) {
  return (
    <div className="group bg-card border border-border rounded-xl overflow-hidden flex flex-col hover:shadow-md transition-all duration-200">
      {/* Cover image */}
      <div className="relative h-32 bg-muted flex items-center justify-center overflow-hidden">
        {coverUrl ? (
          <img src={coverUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-7 h-7 text-muted-foreground/40" />
        )}
        <button
          onClick={() => onSetCover(deck)}
          className="absolute bottom-2 right-2 bg-black/50 hover:bg-black/70 text-white text-xs rounded-md px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
        >
          <ImageIcon className="w-3 h-3" /> Set cover
        </button>
      </div>

      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate">{deck.title}</h3>
            {deck.description && (
              <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{deck.description}</p>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => onEdit(deck)}>
                <Pencil className="w-4 h-4 mr-2" /> Edit deck
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSetCover(deck)}>
                <ImageIcon className="w-4 h-4 mr-2" /> Set cover
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(deck)}>
                <Copy className="w-4 h-4 mr-2" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onShare(deck)}>
                <Share2 className="w-4 h-4 mr-2" /> Share
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onDelete(deck)} className="text-destructive focus:text-destructive">
                <Trash2 className="w-4 h-4 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center justify-between mt-auto">
          <span className="text-xs text-muted-foreground">{cardCount} {cardCount === 1 ? 'card' : 'cards'}</span>
          <div className="flex gap-1.5">
            <Link to={`/deck/${deck.id}`}>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
                <LayoutList className="w-3.5 h-3.5" /> Edit cards
              </Button>
            </Link>
            <Link to={`/study/${deck.id}`}>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                <BookOpen className="w-3.5 h-3.5" /> Study
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}