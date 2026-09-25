import { useMemo, useRef } from 'react';
import { splitWords, isWhitespace, wordWeight } from '@/lib/narrationWords';

/**
 * Plain-text renderer that wraps each word in a narration span (see the span
 * contract in narrationWords.js). Renders identically to `{text}` inside `Tag`.
 */
export default function NarratedText({ text = '', as: Tag = 'span', style, className }) {
  const containerRef = useRef(null);
  const parts = useMemo(() => splitWords(text), [text]);

  return (
    <Tag ref={containerRef} style={style} className={className}>
      {parts.map((part, i) =>
        isWhitespace(part)
          ? part
          : <span key={i} className="nw" data-w="" data-wt={wordWeight(part)}>{part}</span>
      )}
    </Tag>
  );
}