import { useState, useEffect } from 'react';

const W = 64;
const H = 64;

const srgbToLinear = (c) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

/**
 * 75th-percentile relative luminance of a horizontal band of an image.
 *
 * Percentile rather than mean: a band that is mostly dark with one bright
 * quadrant still fails white text in that quadrant, so the bright end has to
 * drive the scrim. `top` and `bottom` are 0-1 fractions of image height.
 *
 * Returns a number 0-1, or null if the image is unavailable or the canvas is
 * CORS-tainted. Callers should fall back to whole-image luminance on null.
 */
export default function useBandLuminance(imageUrl, top = 0, bottom = 1) {
  const [luminance, setLuminance] = useState(null);

  useEffect(() => {
    if (!imageUrl) { setLuminance(null); return; }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        canvas.width = W;
        canvas.height = H;

        const sy = Math.round(img.naturalHeight * top);
        const sh = Math.max(1, Math.round(img.naturalHeight * (bottom - top)));
        ctx.drawImage(img, 0, sy, img.naturalWidth, sh, 0, 0, W, H);

        const { data } = ctx.getImageData(0, 0, W, H);
        const values = [];
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 125) continue;
          values.push(
            0.2126 * srgbToLinear(data[i] / 255) +
            0.7152 * srgbToLinear(data[i + 1] / 255) +
            0.0722 * srgbToLinear(data[i + 2] / 255)
          );
        }
        if (!values.length) { setLuminance(null); return; }

        values.sort((a, b) => a - b);
        const idx = Math.min(values.length - 1, Math.floor(values.length * 0.75));
        setLuminance(values[idx]);
      } catch {
        setLuminance(null);   // canvas tainted by CORS
      }
    };

    img.onerror = () => { if (!cancelled) setLuminance(null); };
    img.src = imageUrl;

    return () => { cancelled = true; };
  }, [imageUrl, top, bottom]);

  return luminance;
}