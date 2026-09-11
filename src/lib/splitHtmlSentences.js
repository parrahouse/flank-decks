/**
 * Split rich HTML (from the Quill editor) into sentence-level chunks,
 * preserving inline and block markup. Each returned item is an HTML string
 * representing one sentence (or block). Used to paginate explanations in the
 * Swabbie speech bubble: a single chunk -> one step; 2+ chunks -> "Next..." steps.
 */
const BLOCK_TAGS = new Set([
  'P', 'DIV', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'BLOCKQUOTE', 'PRE', 'TABLE', 'TR', 'THEAD', 'TBODY', 'SECTION', 'ARTICLE',
]);

function attrsOf(el) {
  const attrs = {};
  for (const a of el.attributes) attrs[a.name] = a.value;
  return { tag: el.tagName.toLowerCase(), attrs };
}

// Split a text node into sentences on punctuation followed by whitespace.
// Uses a lookahead (widely supported) so decimals like "3.14" and abbreviations
// without trailing spaces don't split.
function splitText(text) {
  if (!text) return [];
  const parts = [];
  const re = /[.!?]+['"\u2019\u201d)\]]?(?=\s)/g;
  let m;
  let lastIndex = 0;
  while ((m = re.exec(text)) !== null) {
    const end = m.index + m[0].length;
    parts.push(text.slice(lastIndex, end));
    const ws = text.slice(end).match(/^\s+/);
    lastIndex = end + (ws ? ws[0].length : 0);
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.filter((s) => s.length > 0);
}

export function splitHtmlSentences(html) {
  if (!html || !html.trim()) return [];
  const root = document.createElement('div');
  root.innerHTML = html;

  const chunks = [];
  let container = document.createElement('div');
  let curParent = container;
  const ancestors = []; // open path below the container, reopened after each flush
  let hasContent = false;

  const flush = () => {
    if (hasContent) chunks.push(container.innerHTML);
    container = document.createElement('div');
    curParent = container;
    hasContent = false;
    for (const a of ancestors) {
      const el = document.createElement(a.tag);
      for (const [k, v] of Object.entries(a.attrs || {})) el.setAttribute(k, v);
      curParent.appendChild(el);
      curParent = el;
    }
  };

  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const parts = splitText(node.textContent);
      parts.forEach((part, i) => {
        if (i > 0) flush();
        curParent.appendChild(document.createTextNode(part));
        hasContent = true;
      });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    if (node.tagName === 'BR') {
      curParent.appendChild(document.createElement('br'));
      hasContent = true;
      return;
    }

    const isBlock = BLOCK_TAGS.has(node.tagName);
    if (isBlock && hasContent) flush();

    const clone = node.cloneNode(false);
    curParent.appendChild(clone);
    curParent = clone;
    ancestors.push(attrsOf(node));
    for (const child of Array.from(node.childNodes)) walk(child);
    ancestors.pop();
    curParent = curParent.parentNode;

    if (isBlock) flush();
  };

  for (const child of Array.from(root.childNodes)) walk(child);
  flush();
  return chunks;
}