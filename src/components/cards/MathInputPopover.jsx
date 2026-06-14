import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Convert human-readable math shortcuts to LaTeX
function toLatex(input) {
  let s = input.trim();
  // fraction: 3/4 → \frac{3}{4}
  s = s.replace(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/, '\\frac{$1}{$2}');
  // exponent: x^2 or x^{n} — leave as-is for KaTeX
  // square root: sqrt(x) → \sqrt{x}
  s = s.replace(/sqrt\(([^)]+)\)/g, '\\sqrt{$1}');
  // pi, theta, etc. — leave as-is (KaTeX handles \pi)
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

export default function MathInputPopover({ onInsert, onClose }) {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleInsert = () => {
    if (!value.trim()) return;
    const latex = toLatex(value);
    onInsert(`$${latex}$`);
    onClose();
  };

  return (
    <div className="absolute z-50 top-full left-0 mt-1 w-72 bg-card border border-border rounded-lg shadow-lg p-3 space-y-3">
      <p className="text-xs font-semibold text-foreground">Insert Math</p>

      {/* Quick picks */}
      <div className="flex flex-wrap gap-1.5">
        {QUICK.map(q => (
          <button
            key={q.label}
            type="button"
            onClick={() => { onInsert(`$${toLatex(q.value)}$`); onClose(); }}
            className="px-2 py-1 text-sm border border-border rounded hover:bg-accent transition-colors"
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* Custom input */}
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleInsert(); if (e.key === 'Escape') onClose(); }}
          placeholder='e.g. 3/4 or x^2 or \pi'
          className="text-sm h-8"
        />
        <Button type="button" size="sm" onClick={handleInsert} className="h-8 px-3">Insert</Button>
      </div>
      <p className="text-xs text-muted-foreground">Type <code className="bg-muted px-1 rounded">3/4</code> for fractions, <code className="bg-muted px-1 rounded">x^2</code> for exponents, <code className="bg-muted px-1 rounded">sqrt(x)</code> for roots</p>
    </div>
  );
}