/**
 * Hero image resolution for the deck editing header and study settings screen.
 *
 * The hero is a separate asset from the thumbnail cover. When no hero is set,
 * the thumbnail stands in. The focal point always travels with its own image —
 * a fallback thumbnail uses cover_focal_point, never hero_focal_point.
 */
export function resolveHero(deck) {
  const hero = deck?.hero_image_url || null;
  const url = hero || deck?.cover_image_url || null;
  const fp = hero ? deck?.hero_focal_point : deck?.cover_focal_point;
  return {
    url,
    focalPoint: fp || null,
    objectPosition: fp ? `${fp.x}% ${fp.y}%` : '50% 50%',
    isFallback: !hero && !!url,
    scrimDisabled: !!deck?.hero_scrim_disabled,
  };
}