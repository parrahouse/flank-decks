import { base44 } from '@/api/base44Client';

/**
 * Derives a single dominant, brandable accent color from a cover image via the
 * vision-capable LLM (server-side, so no canvas/CORS issues). Returns a hex
 * string like "#3B5BA9", or null if it could not be determined.
 */
export async function deriveCoverAccentColor(imageUrl) {
  if (!imageUrl) return null;
  try {
    const result = await base44.integrations.Core.InvokeLLM({
      prompt:
        "Look at this image and pick the single most dominant, brandable accent color that represents it. Return it as a hex color code (e.g. '#3B5BA9'). Choose a rich, saturated color (avoid pure white, black, or gray) that works well as a UI accent background. Respond only with the JSON object.",
      file_urls: [imageUrl],
      response_json_schema: {
        type: "object",
        properties: {
          hex: { type: "string", description: "Hex color code, e.g. #3B5BA9" }
        },
        required: ["hex"]
      }
    });
    const hex = result?.hex;
    if (typeof hex === 'string') {
      const clean = hex.trim().startsWith('#') ? hex.trim() : '#' + hex.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(clean)) return clean;
    }
    return null;
  } catch {
    return null;
  }
}

/** Converts a #RRGGBB hex string to an rgba() string with the given alpha. */
export function hexToRgba(hex, alpha) {
  if (!hex) return null;
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}