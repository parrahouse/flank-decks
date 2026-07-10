import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
} 


export const isIframe = window.self !== window.top;

/**
 * Display label for a card. Cards have no title field; the label is the
 * answer text, derived from authoritative fields in priority order.
 * Works on both Card entities and card_results entries.
 */
export function cardLabel(cardish) {
  if (!cardish) return 'Untitled';
  const fromPlural = (cardish.correct_answers || '').split('|')[0]?.trim();
  return fromPlural
    || (cardish.canonical_answer || '').trim()
    || (cardish.correct_answer || '').trim()   // legacy denormalized field
    || 'Untitled';
}