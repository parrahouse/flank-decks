import React, { useState } from 'react';
import { Info } from 'lucide-react';

/**
 * DeckInfoTooltip — info icon beside the deck title in the study header.
 * On hover/focus, reveals the full deck description, total card count, and
 * mastery status (mastered / total).
 */
export default function DeckInfoTooltip({ deck, totalCards, masteredCount }) {
  const [open, setOpen] = useState(false);

  const description = deck?.description?.trim();
  const masteryText = totalCards > 0
    ? `${masteredCount} of ${totalCards} cards mastered`
    : 'No cards yet';

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="p-0.5 rounded focus:outline-none"
        aria-label="Deck info"
      >
        <Info className="w-4 h-4 text-muted-foreground/70" />
      </button>
      {open && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-64 rounded-lg bg-foreground text-background text-xs px-3 py-2 z-30 text-left shadow-lg pointer-events-none">
          {description ? (
            <p className="leading-snug mb-1.5">{description}</p>
          ) : (
            <p className="leading-snug mb-1.5 italic opacity-70">No description</p>
          )}
          <p className="leading-snug opacity-90">{totalCards} cards total</p>
          <p className="leading-snug opacity-90">{masteryText}</p>
        </span>
      )}
    </span>
  );
}