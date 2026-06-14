import { useEffect, useRef } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

/**
 * Renders a string that may contain LaTeX math delimiters.
 * Inline math: $...$ — Block math: $$...$$
 * Plain text with no delimiters is rendered as-is.
 */
export default function MathRenderer({ text = '', className = '', style }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Split text into segments: delimited math ($$...$$, $...$), bare fractions (a/b), and plain text
    const segments = [];
    // Two separate passes: first handle explicit $ delimiters, then bare fractions within plain text segments
    const delimPattern = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;
    let last = 0;
    let match;
    const rawSegments = [];

    while ((match = delimPattern.exec(text)) !== null) {
      if (match.index > last) rawSegments.push({ type: 'text', value: text.slice(last, match.index) });
      const raw = match[0];
      if (raw.startsWith('$$')) {
        rawSegments.push({ type: 'math', value: raw.slice(2, -2), block: true });
      } else {
        rawSegments.push({ type: 'math', value: raw.slice(1, -1), block: false });
      }
      last = match.index + raw.length;
    }
    if (last < text.length) rawSegments.push({ type: 'text', value: text.slice(last) });

    // Now expand bare fractions within text segments
    const fracPattern = /(?<![/\w])(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)(?![/\w])/g;
    for (const seg of rawSegments) {
      if (seg.type !== 'text') { segments.push(seg); continue; }
      let flast = 0;
      let fm;
      fracPattern.lastIndex = 0;
      while ((fm = fracPattern.exec(seg.value)) !== null) {
        if (fm.index > flast) segments.push({ type: 'text', value: seg.value.slice(flast, fm.index) });
        segments.push({ type: 'math', value: `\\frac{${fm[1]}}{${fm[2]}}`, block: false });
        flast = fm.index + fm[0].length;
      }
      if (flast < seg.value.length) segments.push({ type: 'text', value: seg.value.slice(flast) });
    }

    // Build HTML
    const html = segments.map(seg => {
      if (seg.type === 'text') {
        return `<span>${seg.value.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>`;
      }
      try {
        return katex.renderToString(seg.value, {
          throwOnError: false,
          displayMode: seg.block,
        });
      } catch {
        return `<span>${seg.value}</span>`;
      }
    }).join('');

    containerRef.current.innerHTML = html;
  }, [text]);

  return <span ref={containerRef} className={className} style={style} />;
}