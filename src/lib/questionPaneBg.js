/**
 * Shared helper for the study card question/clue pane background.
 *
 * Supports two deck-level appearance options:
 *  - deck.question_bg_color: custom hex color for the block (falls back to the
 *    theme's light-blue study pane color).
 *  - deck.question_bg_image: when true and the card has an image, render that
 *    image as the pane background with the block color overlaid using screen
 *    blend mode.
 *
 * Returns { paneBg, imageLayer, overlayLayer }. When the image background is
 * inactive, imageLayer/overlayLayer are null and the consumer just sets
 * backgroundColor = paneBg. When active, the consumer renders the two layer
 * divs (absolute, zIndex 0) as the first children of the pane and keeps the
 * pane content positioned (relative) so it stacks above them.
 */
export function getQuestionBgLayers({ deck, card, hintVisible }) {
  const customColor = deck?.question_bg_color;
  const useImageBg = !!deck?.question_bg_image && !!card?.image_url;

  const blockColor = hintVisible
    ? 'hsl(var(--study-hint-bg))'
    : (customColor || 'hsl(var(--study-pane))');

  if (!useImageBg) {
    return { paneBg: blockColor, imageLayer: null, overlayLayer: null };
  }

  const fit = card.image_fit === 'contain' ? 'contain' : 'cover';
  const focal = card.image_focal_point && card.image_fit !== 'contain'
    ? `${card.image_focal_point.x}% ${card.image_focal_point.y}%`
    : 'center';

  const imageLayer = {
    position: 'absolute',
    inset: 0,
    zIndex: 0,
    backgroundImage: `url("${card.image_url}")`,
    backgroundSize: fit,
    backgroundPosition: focal,
    backgroundRepeat: 'no-repeat',
    pointerEvents: 'none',
  };

  const overlayLayer = {
    position: 'absolute',
    inset: 0,
    zIndex: 0,
    backgroundColor: blockColor,
    mixBlendMode: 'screen',
    pointerEvents: 'none',
  };

  return { paneBg: blockColor, imageLayer, overlayLayer };
}