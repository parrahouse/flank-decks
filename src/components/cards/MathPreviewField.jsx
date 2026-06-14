import { useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import MathRenderer from '@/components/ui/MathRenderer';

/**
 * A text input/textarea that shows a rendered math preview below it when the value contains $...$.
 * The raw LaTeX is always stored/passed to onChange.
 */
export default function MathPreviewField({
  value = '',
  onChange,
  placeholder,
  maxLength,
  rows,
  singleLine = false,
  className,
  readOnly,
}) {
  const hasMath = /\$/.test(value);

  const sharedClass = cn(
    'w-full rounded-none border border-input bg-transparent px-3 py-1.5 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
    readOnly && 'bg-muted cursor-default',
    className
  );

  return (
    <div className="space-y-1">
      {singleLine ? (
        <input
          type="text"
          value={value}
          onChange={e => onChange?.(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          readOnly={readOnly}
          className={sharedClass}
        />
      ) : (
        <textarea
          value={value}
          onChange={e => onChange?.(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={rows || 2}
          readOnly={readOnly}
          className={cn(sharedClass, 'resize-none')}
        />
      )}

      {hasMath && (
        <div className="px-3 py-1.5 rounded bg-muted/50 border border-border text-sm">
          <MathRenderer text={value} />
        </div>
      )}
    </div>
  );
}