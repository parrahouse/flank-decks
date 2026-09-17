/** Shared helpers for deck hero headers (cover image scrim + accent color). */

/** sRGB channel → linear, for luminance math. */
const srgbToLinear = (c) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

/** WCAG relative luminance from 0–1 sRGB channels. */
const relLuminance = (r, g, b) =>
  0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);

/**
 * Build a scrim from an "R, G, B" dominant color.
 * Hue and saturation come from the cover; lightness is clamped dark.
 * Alpha is derived from the cover's luminance so the composite lands
 * dark enough for white text regardless of how light the cover is.
 * Returns { h, s, l, aTop, aMid, aBottom } or null.
 */
export const buildScrim = (rgb, lightness = 15) => {
  if (!rgb) return null;
  const [r, g, b] = rgb.split(',').map(c => Number(c.trim()) / 255);

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const TARGET = 0.18;
  const SCRIM_L = 0.02;
  const L = relLuminance(r, g, b);
  const raw = L <= TARGET ? 0 : (L - TARGET) / Math.max(L - SCRIM_L, 0.01);
  const aBottom = Math.min(0.88, Math.max(0.42, raw));

  return {
    h: Math.round(h),
    s: Math.min(100, Math.round(s * 140)),
    l: lightness,
    aTop: Number((aBottom * 0.28).toFixed(3)),
    aMid: Number((aBottom * 0.72).toFixed(3)),
    aBottom: Number(aBottom.toFixed(3)),
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
    parseInt(m.slice(4, 6), 16),
  ].join(', ');
};

/** Build the CSS gradient string for a scrim, with a dark fallback. */
export const buildScrimGradient = (scrim) =>
  scrim
    ? `linear-gradient(to bottom,
        hsla(${scrim.h}, ${scrim.s}%, ${scrim.l}%, ${scrim.aTop}) 0%,
        hsla(${scrim.h}, ${scrim.s}%, ${scrim.l}%, ${scrim.aMid}) 40%,
        hsla(${scrim.h}, ${scrim.s}%, ${scrim.l}%, ${scrim.aBottom}) 72%,
        hsla(${scrim.h}, ${scrim.s}%, ${scrim.l}%, ${scrim.aBottom}) 100%)`
    : `linear-gradient(to bottom,
        rgba(0,0,0,0.20) 0%,
        rgba(0,0,0,0.52) 40%,
        rgba(0,0,0,0.72) 72%,
        rgba(0,0,0,0.72) 100%)`;