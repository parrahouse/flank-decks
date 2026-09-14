import { useState, useEffect } from 'react';

const SAMPLE = 48;        // canvas size — needs to be big enough for a stable histogram
const LEVELS = 8;         // quantization steps per channel (8 → 512 buckets)
const STEP = 256 / LEVELS;

/** Reject pixels too dark, too light, or too grey to characterize the image. */
const isUsable = (r, g, b) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 28) return false;          // near-black
  if (min > 232) return false;         // near-white
  if (max - min < 18) return false;    // near-grey
  return true;
};

export default function useDominantColor(imageUrl) {
  const [color, setColor] = useState(null);

  useEffect(() => {
    if (!imageUrl) { setColor(null); return; }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        canvas.width = SAMPLE;
        canvas.height = SAMPLE;
        ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);
        const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);

        // ── Histogram of quantized buckets ──
        const buckets = new Map();
        let usableCount = 0;

        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 125) continue;            // skip transparent
          const r = data[i], g = data[i + 1], b = data[i + 2];
          if (!isUsable(r, g, b)) continue;
          usableCount++;

          const key =
            (Math.floor(r / STEP) << 6) |
            (Math.floor(g / STEP) << 8) |
            Math.floor(b / STEP);

          let bucket = buckets.get(key);
          if (!bucket) {
            bucket = { n: 0, r: 0, g: 0, b: 0 };
            buckets.set(key, bucket);
          }
          bucket.n++;
          bucket.r += r;
          bucket.g += g;
          bucket.b += b;
        }

        // ── Fall back to a plain mean if filtering left too little to work with ──
        if (usableCount < 40 || buckets.size === 0) {
          let r = 0, g = 0, b = 0, n = 0;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 125) continue;
            r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
          }
          if (n === 0) { setColor(null); return; }
          setColor(`${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)}`);
          return;
        }

        // ── Winning bucket, averaged over only its own members ──
        let best = null;
        for (const bucket of buckets.values()) {
          if (!best || bucket.n > best.n) best = bucket;
        }

        setColor(
          `${Math.round(best.r / best.n)}, ${Math.round(best.g / best.n)}, ${Math.round(best.b / best.n)}`
        );
      } catch {
        setColor(null);   // canvas tainted by CORS
      }
    };

    img.onerror = () => { if (!cancelled) setColor(null); };
    img.src = imageUrl;

    return () => { cancelled = true; };
  }, [imageUrl]);

  return color; // "R, G, B" or null
}