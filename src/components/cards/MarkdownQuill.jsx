/**
 * MarkdownQuill — ReactQuill wrapper with markdown-style keyboard shortcuts.
 *
 * Typing these prefixes at the start of a line converts the line on the fly:
 *   #   → H1          ##  → H2        ### → H3
 *   -   → bullet      *   → bullet    1.  → ordered list
 *   >   → blockquote  ``` → code block
 *
 * The toolbar still offers the same formats visually.
 */
import { useEffect, useRef } from 'react';
import ReactQuill from 'react-quill';

// Order matters: longer hashes first so "###" isn't caught by "#".
const PATTERNS = [
  { regex: /^###\s/, format: { header: 3 } },
  { regex: /^##\s/,  format: { header: 2 } },
  { regex: /^#\s/,   format: { header: 1 } },
  { regex: /^[-*]\s/, format: { list: 'bullet' } },
  { regex: /^1\.\s/,  format: { list: 'ordered' } },
  { regex: /^>\s/,    format: { blockquote: true } },
  { regex: /^```\s/,  format: { 'code-block': true } },
];

const DEFAULT_MODULES = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['blockquote', 'code-block'],
    ['link'],
    ['clean'],
  ],
};

export default function MarkdownQuill({
  value,
  onChange,
  placeholder,
  style,
  modules = DEFAULT_MODULES,
}) {
  const quillRef = useRef(null);

  useEffect(() => {
    const quill = quillRef.current?.getEditor?.();
    if (!quill) return;

    const handler = (delta, oldDelta, source) => {
      if (source !== 'user') return;
      const sel = quill.getSelection();
      if (!sel) return;
      const [line, offset] = quill.getLine(sel.index);
      if (!line) return;
      const text = line.domNode.textContent || '';

      for (const p of PATTERNS) {
        const match = text.match(p.regex);
        if (match) {
          const prefixLen = match[0].length;
          const lineStart = sel.index - offset;
          // Run as 'api' so this handler ignores the resulting events.
          quill.deleteText(lineStart, prefixLen, 'api');
          quill.formatLine(lineStart, 1, p.format, 'api');
          quill.setSelection(lineStart, 0, 'api');
          break;
        }
      }
    };

    quill.on('text-change', handler);
    return () => quill.off('text-change', handler);
  }, []);

  return (
    <ReactQuill
      ref={quillRef}
      theme="snow"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      modules={modules}
      style={style}
    />
  );
}