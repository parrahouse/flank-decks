import { Volume2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function NarrationButton({
  text,
  getStatus,
  onSpeak,
  size = 16,
  color,
  style,
  className,
}) {
  const status = getStatus(text);
  const Icon = status === 'loading' ? Loader2 : Volume2;
  const title =
    status === 'playing' ? 'Reading…'
    : status === 'loading' ? 'Loading…'
    : status === 'queued' ? 'Queued'
    : 'Read aloud';

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onSpeak(text); }}
      title={title}
      aria-label={title}
      className={cn('inline-flex items-center justify-center rounded transition-opacity hover:opacity-80', className)}
      style={{
        color: color || 'hsl(var(--muted-foreground))',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 4,
        lineHeight: 0,
        opacity: status === 'queued' ? 0.5 : 1,
        ...style,
      }}
    >
      <Icon
        className={cn(status === 'loading' && 'animate-spin', status === 'playing' && 'animate-pulse')}
        style={{ width: size, height: size }}
      />
    </button>
  );
}