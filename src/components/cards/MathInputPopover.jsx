import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';

// Groups of symbol buttons — each appends its `value` to the equation input
const SYMBOL_GROUPS = [
  {
    label: 'Arithmetic',
    symbols: [
      { label: '+',   value: '+' },
      { label: '−',   value: '-' },
      { label: '×',   value: '\\times' },
      { label: '÷',   value: '\\div' },
      { label: '=',   value: '=' },
      { label: '≠',   value: '\\neq' },
      { label: '±',   value: '\\pm' },
    ],
  },
  {
    label: 'Fractions & Roots',
    symbols: [
      { label: 'a/b',  value: '\\frac{a}{b}' },
      { label: '√',    value: '\\sqrt{x}' },
      { label: '∛',    value: '\\sqrt[3]{x}' },
    ],
  },
  {
    label: 'Powers & Indices',
    symbols: [
      { label: 'x²',  value: 'x^{2}' },
      { label: 'xⁿ',  value: 'x^{n}' },
      { label: 'xₙ',  value: 'x_{n}' },
    ],
  },
  {
    label: 'Comparison',
    symbols: [
      { label: '<',   value: '<' },
      { label: '>',   value: '>' },
      { label: '≤',   value: '\\leq' },
      { label: '≥',   value: '\\geq' },
    ],
  },
  {
    label: 'Constants',
    symbols: [
      { label: 'π',   value: '\\pi' },
      { label: '∞',   value: '\\infty' },
      { label: 'θ',   value: '\\theta' },
      { label: 'α',   value: '\\alpha' },
      { label: 'β',   value: '\\beta' },
    ],
  },
  {
    label: 'Long Division',
    symbols: [
      { label: '⟌', value: '\\begin{array}{r} \\text{quotient} \\\\ \\text{divisor}\\overline{)\\,\\text{dividend}} \\end{array}', title: 'Long division template' },
    ],
  },
];

export default function MathButton({ onInsert }) {
  const [open, setOpen] = useState(false);
  const [equation, setEquation] = useState('');
  const btnRef = useRef(null);
  const inputRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const popoverWidth = 320;
      const left = Math.min(r.left, window.innerWidth - popoverWidth - 12);
      const top = r.bottom + 6;
      setPos({ top, left: Math.max(8, left) });
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (!e.target.closest('[data-math-popover]') && !e.target.closest('[data-math-btn]')) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const appendSymbol = (value) => {
    setEquation(prev => prev + value);
    inputRef.current?.focus();
  };

  const handleInsert = () => {
    if (!equation.trim()) return;
    onInsert(`$${equation}$`);
    setOpen(false);
    setEquation('');
  };

  return (
    <>
      <button
        ref={btnRef}
        data-math-btn
        type="button"
        onClick={() => setOpen(v => !v)}
        className="text-xs text-primary border border-primary/30 rounded px-1.5 py-0.5 hover:bg-primary/10 transition-colors"
      >
        ∑ Math
      </button>

      {open && createPortal(
        <div
          data-math-popover
          className="fixed z-[9999] w-80 bg-card border border-border rounded-lg shadow-xl p-3 space-y-3"
          style={{ top: pos.top, left: pos.left }}
        >
          <p className="text-xs font-semibold text-foreground">Build Equation</p>

          {/* Symbol groups */}
          <div className="space-y-2">
            {SYMBOL_GROUPS.map(group => (
              <div key={group.label}>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{group.label}</p>
                <div className="flex flex-wrap gap-1">
                  {group.symbols.map(sym => (
                    <button
                      key={sym.label}
                      type="button"
                      title={sym.title || sym.value}
                      onClick={() => appendSymbol(sym.value)}
                      className="px-2 py-1 text-sm border border-border rounded hover:bg-accent transition-colors min-w-[2rem] text-center"
                    >
                      {sym.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Equation input */}
          <div className="space-y-1.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Equation</p>
            <textarea
              ref={inputRef}
              value={equation}
              onChange={e => setEquation(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
              placeholder="Type or tap symbols above…"
              rows={2}
              className="w-full text-sm rounded border border-input bg-transparent px-3 py-1.5 resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={() => { setOpen(false); setEquation(''); }}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleInsert} disabled={!equation.trim()}>
              Insert
            </Button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}