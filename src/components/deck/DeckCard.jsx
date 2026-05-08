import { Link } from 'react-router-dom';
import { MoreHorizontal, BookOpen, Copy, Trash2, Share2, Pencil, LayoutList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

export default function DeckCard({ deck, cardCount, onEdit, onDelete, onDuplicate, onShare }) {
  return (
    <div className="group bg-card border border-border rounded-xl p-5 flex flex-col gap-3 hover:shadow-md transition-all duration-200">
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

      <div className="flex items-center justify-between">
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
  );
}