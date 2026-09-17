import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import useDominantColor from '@/hooks/useDominantColor';
import { buildScrim, buildScrimGradient, hexToRgbString } from '@/lib/deckHero';

/**
 * Static (non-collapsing) deck hero header with the cover image as a
 * background, a chromatic scrim, a back arrow, the deck title, and a
 * subtitle. Falls back to a compact plain header when there is no cover.
 *
 * Intended for secondary deck pages (settings, stats) — smaller than the
 * DeckBuilder's collapsing hero.
 */
export default function DeckHeroHeader({
  deck,
  backTo,
  backLabel = 'Back',
  onBack,
  subtitle,
  actions,
  titleExtra,
  height = 150,
}) {
  const hasCover = !!deck?.cover_image_url;
  const extractedColor = useDominantColor(deck?.cover_image_url);
  const scrimSourceColor = hexToRgbString(deck?.accent_color) || extractedColor;
  const scrim = buildScrim(scrimSourceColor);
  const scrimGradient = buildScrimGradient(scrim);
  const fp = deck?.cover_focal_point;
  const coverObjectPosition = fp ? `${fp.x}% ${fp.y}%` : '50% 50%';

  const BackButton = ({ className }) =>
    onBack ? (
      <button
        type="button"
        onClick={onBack}
        className={className}
        aria-label={backLabel}
      >
        <ArrowLeft className="w-5 h-5" />
      </button>
    ) : (
      <Link to={backTo} className={className} aria-label={backLabel}>
        <ArrowLeft className="w-5 h-5" />
      </Link>
    );

  if (!hasCover) {
    return (
      <div className="flex items-center gap-3 mb-4 -mx-4 -mt-6 px-4 pt-6 pb-4 bg-card border-b border-border/60">
        <BackButton className="text-muted-foreground hover:text-foreground transition-colors" />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold flex items-center gap-1.5">
            <span>{deck?.title}</span>
            {titleExtra}
          </h1>
          {subtitle && (
            <div className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">{subtitle}</div>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    );
  }

  return (
    <div
      className="-mx-4 -mt-6 mb-4 relative overflow-hidden"
      style={{
        height: `${height}px`,
        width: '100vw',
        marginLeft: 'calc(50% - 50vw)',
        marginRight: 'calc(50% - 50vw)',
      }}
    >
      <img
        src={deck.cover_image_url}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        style={{ objectPosition: coverObjectPosition }}
      />
      <div className="absolute inset-0" style={{ background: scrimGradient }} />

      <div className="absolute top-0 left-0 right-0 z-20">
        <div className="max-w-7xl mx-auto px-4 pt-3 flex items-center justify-between">
          <BackButton className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-black/30 hover:bg-black/50 text-white transition-colors" />
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      </div>

      <div className="relative z-10 h-full max-w-7xl mx-auto px-4 flex flex-col justify-end pb-4">
        <h1 className="text-xl font-bold text-white flex items-center gap-1.5">
          <span>{deck?.title}</span>
          {titleExtra}
        </h1>
        {subtitle && (
          <div className="text-sm text-white/80 flex items-center gap-1.5 mt-0.5">{subtitle}</div>
        )}
      </div>
    </div>
  );
}