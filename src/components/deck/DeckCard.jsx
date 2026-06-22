import { Link } from 'react-router-dom';
import { MoreHorizontal, BookOpen, Copy, Trash2, Share2, Pencil, LayoutList, Image as ImageIcon, Trophy, TrendingDown, Clock, RotateCcw, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

function timeAgo(dateStr) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function MasteryBar({ pct }) {
  const color = pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex items-center gap-1.5 w-full">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div style={{ width: `${pct}%`, backgroundColor: color, height: '100%', borderRadius: 9999, transition: 'width 0.3s' }} />
      </div>
      <span className="text-xs tabular-nums" style={{ color }}>{pct}%</span>
    </div>
  );
}

export default function DeckCard({ deck, cardCount, coverUrl, stats, onEdit, onDelete, onDuplicate, onShare, onSetCover }) {
  const avgScore = stats && stats.highScore !== null && stats.lowScore !== null
    ? Math.round((stats.highScore + stats.lowScore) / 2)
    : null;

  return (
    <div className="group bg-card border border-border rounded-xl overflow-hidden flex flex-col hover:shadow-md transition-all duration-200">
      {/* Cover image */}
      <div className="relative h-36 bg-muted flex items-center justify-center overflow-hidden">
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
        {/* Title + menu */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate">{deck.title}</h3>
            {deck.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{deck.description}</p>
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

        {/* Stats block */}
        {stats ? (
          <div className="space-y-2">
            {/* Mastery bar */}
            {avgScore !== null && (
              <div className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Avg score</span>
                </div>
                <MasteryBar pct={avgScore} />
              </div>
            )}

            {/* Score row */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {stats.highScore !== null && (
                <span className="flex items-center gap-1 text-green-600">
                  <Trophy className="w-3 h-3" /> {stats.highScore}%
                </span>
              )}
              {stats.lowScore !== null && (
                <span className="flex items-center gap-1 text-amber-600">
                  <TrendingDown className="w-3 h-3" /> {stats.lowScore}%
                </span>
              )}
              <span className="flex items-center gap-1">
                <RotateCcw className="w-3 h-3" /> {stats.timesFinished}/{stats.timesStarted}
              </span>
              {stats.lastStudied && (
                <span className="flex items-center gap-1 ml-auto">
                  <Clock className="w-3 h-3" /> {timeAgo(stats.lastStudied)}
                </span>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">Not studied yet</p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between mt-auto pt-1 border-t border-border">
          <span className="text-xs text-muted-foreground">{cardCount} {cardCount === 1 ? 'card' : 'cards'}</span>
          <div className="flex gap-1.5">
            <Link to={`/deck/${deck.id}`}>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
                <LayoutList className="w-3.5 h-3.5" /> Edit deck
              </Button>
            </Link>
            <Link to={`/study/${deck.id}`}>
              <Button size="sm" className="h-7 text-xs gap-1">
                <BookOpen className="w-3.5 h-3.5" /> Study
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}