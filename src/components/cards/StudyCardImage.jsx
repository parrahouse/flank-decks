import { Image as ImageIcon } from 'lucide-react';

const FADE = 'opacity 0.35s ease';
const PLACEHOLDER_LABEL = 'Image appears after you answer';

/**
 * StudyCardImage — the card image inside a study card's image slot.
 * Shared by StudyCard and StudyCardHorizontal so the two cannot drift apart.
 *
 * image_display !== 'after_answer': renders the plain <img>, exactly as before.
 *
 * image_display === 'after_answer': the slot keeps its size (no reflow). Until
 * `revealed` is true it shows a quiet CSS-only placeholder; then the image
 * fades in. The <img> stays mounted at opacity 0 so it is already loaded when
 * it appears.
 *
 * Pure prop consumer: no state, no effects.
 */
export default function StudyCardImage({ card, revealed = true }) {
  const imgStyle = {
    width: '100%',
    height: '100%',
    objectFit: card.image_fit || 'cover',
    objectPosition: (card.image_fit !== 'contain' && card.image_focal_point)
      ? `${card.image_focal_point.x}% ${card.image_focal_point.y}%`
      : 'center',
  };

  if (card.image_display !== 'after_answer') {
    return <img src={card.image_url} alt="card" style={imgStyle} />;
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', alignSelf: 'stretch' }}>
      <img
        src={card.image_url}
        alt={revealed ? 'card' : ''}
        aria-hidden={!revealed}
        draggable={false}
        style={{ ...imgStyle, display: 'block', opacity: revealed ? 1 : 0, transition: FADE }}
      />
      <div
        role="img"
        aria-label={PLACEHOLDER_LABEL}
        aria-hidden={revealed}
        title={revealed ? undefined : PLACEHOLDER_LABEL}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'hsl(var(--study-image-bg))',
          backgroundImage: 'radial-gradient(hsl(var(--study-pane-text) / 0.09) 1px, transparent 1.5px)',
          backgroundSize: '14px 14px',
          backgroundPosition: 'center',
          opacity: revealed ? 0 : 1,
          transition: FADE,
          pointerEvents: revealed ? 'none' : 'auto',
        }}
      >
        <ImageIcon
          aria-hidden
          strokeWidth={1.5}
          style={{ width: 'clamp(28px, 9%, 52px)', height: 'auto', color: 'hsl(var(--study-pane-text) / 0.2)' }}
        />
      </div>
    </div>
  );
}