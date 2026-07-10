import { cn } from '@/lib/utils';

// Single overview tile. `sub` is the basis note (e.g. "across 12 of 30 sessions").
export default function StatTile({ label, value, sub, valueClass, icon }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1">
      {icon && <div className="text-muted-foreground flex items-center gap-1.5 text-xs">{icon}{label}</div>}
      {!icon && <div className="text-muted-foreground text-xs">{label}</div>}
      <div className={cn('text-2xl font-bold leading-tight', valueClass)}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground/80 leading-snug">{sub}</div>}
    </div>
  );
}