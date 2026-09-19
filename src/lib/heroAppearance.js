/**
 * Header text treatments. One is selected per render and its class strings are
 * spread across the title, description and toolbar.
 *
 * Every value is a literal string so Tailwind's scanner emits the CSS. Do not
 * build these by concatenation or interpolation.
 *
 * LIGHT and DARK both sit on cover art, so their colors are hardcoded rather
 * than themed — they must not follow dark mode. PLAIN is the no-cover header,
 * which sits on the app surface and does follow it.
 */
export const TONE_LIGHT = {
  title: 'text-white',
  titleIcon: 'text-white/70',
  desc: 'text-white/80 group-hover:text-white',
  descPlaceholder: 'text-white/50 group-hover:text-white/80',
  descIcon: 'text-white/40 group-hover:text-white/70',
  count: 'text-white/70',
  btnPrimary: 'text-white hover:!bg-white/10 hover:!text-white',
  btnSecondary: 'text-white/80 hover:!bg-white/10 hover:!text-white'
};

export const TONE_DARK = {
  title: 'text-slate-900',
  titleIcon: 'text-slate-900/70',
  desc: 'text-slate-900/80 group-hover:text-slate-900',
  descPlaceholder: 'text-slate-900/50 group-hover:text-slate-900/80',
  descIcon: 'text-slate-900/40 group-hover:text-slate-900/70',
  count: 'text-slate-900/70',
  btnPrimary: 'text-slate-900 hover:!bg-black/10 hover:!text-slate-900',
  btnSecondary: 'text-slate-900/80 hover:!bg-black/10 hover:!text-slate-900'
};

export const TONE_PLAIN = {
  title: '',
  titleIcon: 'text-muted-foreground',
  desc: 'text-muted-foreground group-hover:text-foreground',
  descPlaceholder: 'text-muted-foreground/50 group-hover:text-muted-foreground',
  descIcon: 'text-muted-foreground/40 group-hover:text-muted-foreground',
  count: 'text-muted-foreground',
  btnPrimary: '',
  btnSecondary: 'text-muted-foreground hover:text-foreground'
};

/** sRGB channel → linear, for luminance math. */
const srgbToLinear = (c) =>
c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

/** WCAG relative luminance from 0–1 sRGB channels. */
const relLuminance = (r, g, b) =>
0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);

/** Chroma the scrim may carry before the coverage taper is applied. */
const SCRIM_SAT_CEILING = 45;

/**
 * Build a scrim from an "R, G, B" dominant color.
 *
 * Hue comes from the cover. Saturation is capped and then falls as coverage
 * rises: the scrim keeps the cover's hue while it is decorative, and goes
 * near-neutral once it is doing contrast work. A saturated tint at high alpha
 * collapses every hue in the artwork onto one hue, which is what made graphic
 * covers read as muddy — photos escaped it only because their dominant color
 * is near-grey to begin with.
 *
 * Alpha is derived from `bandLuminance`, the luminance of the strip the text
 * actually sits on. Falls back to whole-image luminance when that is null.
 *
 * Returns { h, s, l, aMid, aBottom } or null. There is no longer an aTop —
 * the gradient now terminates at full transparency above the text zone.
 */
export const buildScrim = (rgb, bandLuminance = null, lightness = 15) => {
  if (!rgb) return null;
  const [r, g, b] = rgb.split(',').map((c) => Number(c.trim()) / 255);

  // ── Hue + saturation ──
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = (g - b) / d % 6;else
    if (max === g) h = (b - r) / d + 2;else
    h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  // ── Alpha needed to bring the composite to a readable luminance ──
  // Solving  TARGET = L(1 - a) + SCRIM_L(a)  for a.
  const TARGET = 0.18; // composite luminance ≈ 4.5:1 against white
  const SCRIM_L = 0.02; // the scrim's own luminance at l≈13%
  const L = bandLuminance !== null && bandLuminance !== undefined ?
  bandLuminance :
  relLuminance(r, g, b);
  const raw = L <= TARGET ? 0 : (L - TARGET) / Math.max(L - SCRIM_L, 0.01);
  const aBottom = Math.min(0.88, Math.max(0.42, raw));

  // ── Chroma taper: more coverage, less hue ──
  const sPct = Math.min(100, Math.round(s * 100));
  const chroma = Math.round(Math.min(SCRIM_SAT_CEILING, sPct) * (1 - aBottom));

  return {
    h: Math.round(h),
    s: chroma,
    l: lightness,
    aMid: Number((aBottom * 0.55).toFixed(3)),
    aBottom: Number(aBottom.toFixed(3))
  };
};

/** "#4A7C2F" → "74, 124, 47". Returns null on anything malformed. */
export const hexToRgbString = (hex) => {
  if (typeof hex !== 'string') return null;
  const m = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
  return [
  parseInt(m.slice(0, 2), 16),
  parseInt(m.slice(2, 4), 16),
  parseInt(m.slice(4, 6), 16)].
  join(', ');
};

/**
 * Assemble the header scrim gradient.
 *
 * `fadeTop` is the height in px, measured up from the bottom of the element the
 * gradient fills, at which the scrim reaches full transparency. The header
 * derives it from the measured text stack; the picker preview derives it from
 * its own pane height. Both call this so the two cannot drift.
 *
 * Pass a null scrim to get the neutral black fallback used when no dominant
 * color could be extracted.
 */
export function buildScrimGradient(scrim, fadeTop) {
  const hold = Math.round(fadeTop * 0.30);
  const mid = Math.round(fadeTop * 0.62);
  return scrim ?
  `linear-gradient(to top,
        hsla(${scrim.h}, ${scrim.s}%, ${scrim.l}%, ${scrim.aBottom}) 0px,
        hsla(${scrim.h}, ${scrim.s}%, ${scrim.l}%, ${scrim.aBottom}) ${hold}px,
        hsla(${scrim.h}, ${scrim.s}%, ${scrim.l}%, ${scrim.aMid}) ${mid}px,
        hsla(${scrim.h}, ${scrim.s}%, ${scrim.l}%, 0) ${fadeTop}px)` :
  `linear-gradient(to top,
        rgba(0,0,0,0.72) 0px,
        rgba(0,0,0,0.72) ${hold}px,
        rgba(0,0,0,0.40) ${mid}px,
        rgba(0,0,0,0) ${fadeTop}px)`;
}