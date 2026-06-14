import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function toLatex(input) {
  let s = input.trim();
  s = s.replace(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/, '\\frac{$1}{$2}');
  s = s.replace(/sqrt\(([^)]+)\)/g, '\\sqrt{$1}');
  return s;
}

const QUICK = [
  { label: '½', value: '1/2' },
  { label: '¾', value: '3/4' },
  { label: '⅓', value: '1/3' },
  { label: 'x²', value: 'x^2' },
  { label: '√x', value: 'sqrt(x)' },
  { label: 'π', value: '\\pi' },
];

export default function MathButton({ onInsert }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const btnRef = useRef(null);
  const inputRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const popoverWidth = 288; // w-72
      const left = Math.min(r.left, window.innerWidth - popoverWidth - 12);
      setPos({ top: r.bottom + 6, left: Math.max(8, left) });
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  // Close on outside click
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

  const insert = (latex) => { onInsert(`$${latex}$`); setOpen(false); setValue(''); };

  const handleInsert = () => {
    if (!value.trim()) return;
    insert(toLatex(value));
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
          className="fixed z-[9999] w-72 bg-card border border-border rounded-lg shadow-xl p-3 space-y-3"
          style={{ top: pos.top, left: pos.left }}
        >
          <p className="text-xs font-semibold text-foreground">Insert Math</p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK.map(q => (
              <button key={q.label} type="button" onClick={() => insert(toLatex(q.value))}
                className="px-2 py-1 text-sm border border-border rounded hover:bg-accent transition-colors">
                {q.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleInsert(); if (e.key === 'Escape') setOpen(false); }}
              placeholder="e.g. 3/4 or x^2"
              className="text-sm h-8"
            />
            <Button type="button" size="sm" onClick={handleInsert} className="h-8 px-3">Insert</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            <code className="bg-muted px-1 rounded">3/4</code> → fraction &nbsp;
            <code className="bg-muted px-1 rounded">x^2</code> → exponent &nbsp;
            <code className="bg-muted px-1 rounded">sqrt(x)</code> → root
          </p>
        </div>,
        document.body
      )}
    </>
  );
}