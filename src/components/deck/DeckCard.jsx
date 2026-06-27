import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MoreHorizontal, GalleryVerticalEnd, Copy, Trash2, Share2, Pencil, Image as ImageIcon, PlayCircle } from 'lucide-react';
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

// Tilt offset shared across all cards (singleton listener)
let _tiltListeners = [];
let _tiltGamma = 0; // left/right tilt in degrees

if (typeof window !== 'undefined') {
  window.addEventListener('deviceorientation', (e) => {
    // gamma: left/right tilt (-90 to 90). Clamp to ±20 for subtlety.
    _tiltGamma = Math.max(-20, Math.min(20, e.gamma || 0));
    _tiltListeners.forEach(fn => fn(_tiltGamma));
  });
}

function useTilt() {
  const [tilt, setTilt] = useState(0);
  useEffect(() => {
    _tiltListeners.push(setTilt);
    return () => { _tiltListeners = _tiltListeners.filter(fn => fn !== setTilt); };
  }, []);
  return tilt;
}

// Animated water fill with wave surface
function WaterFill({ pct }) {
  const [animPct, setAnimPct] = useState(0);
  const tilt = useTilt();

  useEffect(() => {
    const t = setTimeout(() => setAnimPct(pct), 80);
    return () => clearTimeout(t);
  }, [pct]);

  if (pct === 0) return null;

  // Subtle tilt: shift height by up to ±3% based on device lean
  const tiltOffset = (tilt / 20) * 3;
  const displayPct = Math.max(0, Math.min(100, animPct + tiltOffset));

  return (
    <div
      className="absolute left-0 right-0 bottom-0 overflow-hidden"
      style={{
        height: `${displayPct}%`,
        transition: 'height 1.6s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      {/* Water body — fills the full height, waves sit on top */}
      <div className="absolute left-0 right-0 bottom-0 top-0" style={{ backgroundColor: '#EDF3F8' }} />

      {/* Wave surface — pinned to the very top of the fill */}
      <div className="absolute top-0 left-0 right-0" style={{ height: 14, marginTop: -13, overflow: 'visible' }}>
        {/* Wave 1 — slower */}
        <svg
          viewBox="0 0 800 14"
          preserveAspectRatio="none"
          style={{
            position: 'absolute',
            top: 0,
            width: '200%',
            height: 14,
            animation: 'waveScroll1 16s linear infinite',
          }}
        >
          <path
            d="M0,7 C50,0 100,14 150,7 C200,0 250,14 300,7 C350,0 400,14 450,7 C500,0 550,14 600,7 C650,0 700,14 750,7 C800,0 800,7 800,7 L800,14 L0,14 Z"
            fill="#EDF3F8"
          />
        </svg>
        {/* Wave 2 — faster, offset */}
        <svg
          viewBox="0 0 800 14"
          preserveAspectRatio="none"
          style={{
            position: 'absolute',
            top: 1,
            width: '200%',
            height: 14,
            opacity: 0.5,
            animation: 'waveScroll2 11s linear infinite reverse',
          }}
        >
          <path
            d="M0,9 C60,2 120,14 180,7 C240,0 300,14 360,7 C420,0 480,14 540,7 C600,0 660,14 720,7 C780,0 800,9 800,9 L800,14 L0,14 Z"
            fill="#EDF3F8"
          />
        </svg>
      </div>
    </div>
  );
}

export default function DeckCard({ deck, cardCount, coverUrl, stats, masteryPct = 0, savedHoursLeft, onEdit, onDelete, onDuplicate, onShare, onSetCover }) {
  const avgScore = stats && stats.highScore !== null && stats.lowScore !== null
    ? Math.round((stats.highScore + stats.lowScore) / 2)
    : null;

  const waterPct = masteryPct;
  const navigate = useNavigate();

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

      <div className="group bg-card border border-border rounded-md overflow-hidden flex flex-col hover:shadow-md transition-all duration-200">
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
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => navigate(`/deck/${deck.id}`)}>
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



            {/* Saved session badge */}
            {savedHoursLeft !== null && (
              <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-md px-2 py-1">
                <PlayCircle className="w-3 h-3 shrink-0" />
                <span>Session saved · {savedHoursLeft}h left to resume</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between mt-auto">
              <p className="text-xs text-muted-foreground">
                {cardCount} {cardCount === 1 ? 'card' : 'cards'}
                {stats && avgScore !== null
                  ? <span style={{ color: avgScore >= 80 ? '#16a34a' : avgScore >= 50 ? '#d97706' : '#dc2626' }}> · {avgScore}% avg score</span>
                  : <span className="italic"> · ready to start</span>
                }
              </p>
              <Link to={`/study/${deck.id}`} className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors">
                <GalleryVerticalEnd className="w-4 h-4" /> Study
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}