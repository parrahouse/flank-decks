import { useState, useEffect } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';

const DELAY_MS = 4500;

/**
 * "Learn More" explanation dialog.
 * - No X close button; dismissed via a "Got it" button in the lower-right.
 * - Not dismissible (click-outside, escape, or button) for the first 3 seconds.
 * - Soft green overlay with a subtle dot pattern.
 */
export default function LearnMoreDialog({ open, onOpenChange, title, explanation }) {
  const [canDismiss, setCanDismiss] = useState(false);

  useEffect(() => {
    if (!open) {
      setCanDismiss(false);
      return;
    }
    const t = setTimeout(() => setCanDismiss(true), DELAY_MS);
    return () => clearTimeout(t);
  }, [open]);

  const handleOpenChange = (next) => {
    if (!next && !canDismiss) return; // block close during delay
    if (!next) onOpenChange(false);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        {/* Soft green overlay with subtle dot pattern */}
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          style={{
            backgroundColor: 'rgb(167, 201, 177)',
            backgroundImage:
              'radial-gradient(circle, rgba(255,255,255,0.14) 1px, transparent 1.5px)',
            backgroundSize: '14px 14px',
          }}
        />
        <DialogPrimitive.Content
          className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-emerald-200 bg-white p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center shrink-0">
              <GraduationCap className="w-4 h-4 text-accent-foreground" />
            </div>
            <h3 className="font-semibold text-lg">{title}</h3>
          </div>
          <div
            className="prose max-w-none text-foreground min-h-[60px]"
            dangerouslySetInnerHTML={{ __html: explanation }}
          />
          {/* Got it button — lower right */}
          <div className="flex justify-end pt-2">
            <button
              onClick={() => onOpenChange(false)}
              disabled={!canDismiss}
              className={cn(
                'rounded-md px-6 py-2 text-sm font-semibold transition-all',
                canDismiss
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer'
                  : 'bg-emerald-200 text-emerald-700/60 cursor-not-allowed',
              )}
            >
              {canDismiss ? 'Got it' : 'Got it…'}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}