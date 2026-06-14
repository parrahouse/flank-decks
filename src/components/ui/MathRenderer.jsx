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

    // Split text into segments: math ($$...$$, $...$) and plain text
    const segments = [];
    const pattern = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;
    let last = 0;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > last) segments.push({ type: 'text', value: text.slice(last, match.index) });
      const raw = match[0];
      const isBlock = raw.startsWith('$$');
      const inner = isBlock ? raw.slice(2, -2) : raw.slice(1, -1);
      segments.push({ type: 'math', value: inner, block: isBlock });
      last = match.index + raw.length;
    }
    if (last < text.length) segments.push({ type: 'text', value: text.slice(last) });

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