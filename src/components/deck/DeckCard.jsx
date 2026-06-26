import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { MoreHorizontal, BookOpen, Copy, Trash2, Share2, Pencil, LayoutList, Image as ImageIcon, Trophy, TrendingDown, Clock, RotateCcw, CheckCircle2, PlayCircle } from 'lucide-react';
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

// Ruler ticks on the left side of the card body
function RulerTicks({ count = 8 }) {
  return (
    <div className="absolute left-0 top-0 bottom-0 w-4 flex flex-col justify-between py-2 pointer-events-none z-10">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center">
          <div style={{ width: i % 4 === 0 ? 8 : 5, height: 1, backgroundColor: 'rgba(100,130,160,0.35)' }} />
        </div>
      ))}
    </div>
  );
}

// Animated water fill with wave surface
function WaterFill({ pct }) {
  const [animPct, setAnimPct] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setAnimPct(pct), 80);
    return () => clearTimeout(t);
  }, [pct]);

  if (pct === 0) return null;

  return (
    <div
      className="absolute left-0 right-0 bottom-0 overflow-hidden"
      style={{
        height: `${animPct}%`,
        transition: 'height 1.6s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      {/* Wave surface */}
      <div className="absolute top-0 left-0 right-0" style={{ height: 18, marginTop: -14, overflow: 'visible' }}>
        {/* Wave 1 — slower */}
        <svg
          viewBox="0 0 800 18"
          preserveAspectRatio="none"
          style={{
            position: 'absolute',
            top: 0,
            width: '200%',
            height: 18,
            opacity: 0.6,
            animation: 'waveScroll1 16s linear infinite',
          }}
        >
          <path
            d="M0,9 C50,0 100,18 150,9 C200,0 250,18 300,9 C350,0 400,18 450,9 C500,0 550,18 600,9 C650,0 700,18 750,9 C800,0 800,9 800,9 L800,18 L0,18 Z"
            fill="#c5dff0"
          />
        </svg>
        {/* Wave 2 — faster, offset */}
        <svg
          viewBox="0 0 800 18"
          preserveAspectRatio="none"
          style={{
            position: 'absolute',
            top: 2,
            width: '200%',
            height: 18,
            opacity: 0.5,
            animation: 'waveScroll2 11s linear infinite reverse',
          }}
        >
          <path
            d="M0,12 C60,4 120,18 180,10 C240,2 300,18 360,10 C420,2 480,18 540,10 C600,2 660,18 720,10 C780,2 800,14 800,14 L800,18 L0,18 Z"
            fill="#b0d4ec"
          />
        </svg>
      </div>

      {/* Water body */}
      <div className="absolute left-0 right-0 bottom-0 top-4" style={{ backgroundColor: '#EDF3F8' }} />
    </div>
  );
}

export default function DeckCard({ deck, cardCount, coverUrl, stats, savedHoursLeft, onEdit, onDelete, onDuplicate, onShare, onSetCover }) {
  const avgScore = stats && stats.highScore !== null && stats.lowScore !== null
    ? Math.round((stats.highScore + stats.lowScore) / 2)
    : null;

  const waterPct = avgScore !== null ? avgScore : 0;

  return (
    <>
      <style>{`
        @keyframes waveScroll1 {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        @keyframes waveScroll2 {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
      `}</style>

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

        {/* Card body — the tank */}
        <div className="relative flex flex-col gap-3 flex-1 overflow-hidden">
          {/* Water fill layer */}
          <WaterFill pct={waterPct} />

          {/* Ruler ticks */}
          <RulerTicks />

          {/* Content — layered above water */}
          <div className="relative z-10 p-4 flex flex-col gap-3 flex-1">
            {/* Title + menu */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground truncate">{deck.title}</h3>
                {deck.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-3">{deck.description}</p>
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
              <div className="space-y-1">
                {avgScore !== null && (
                  <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: avgScore >= 80 ? '#16a34a' : avgScore >= 50 ? '#d97706' : '#dc2626' }}>
                    <CheckCircle2 className="w-3 h-3" /> {avgScore}% avg score
                  </div>
                )}
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
              <p className="text-xs text-muted-foreground italic">Ready to start</p>
            )}

            {/* Saved session badge */}
            {savedHoursLeft !== null && (
              <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-md px-2 py-1">
                <PlayCircle className="w-3 h-3 shrink-0" />
                <span>Session saved · {savedHoursLeft}h left to resume</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between mt-auto pt-1 border-t border-border/60">
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
      </div>
    </>
  );
}