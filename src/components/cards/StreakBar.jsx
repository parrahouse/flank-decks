import { Milestone } from 'lucide-react';

export default function StreakBar({ cardIndex, total, done }) {
  const pct = total > 0 ? (cardIndex + (done ? 1 : 0)) / total * 100 : 0;
  const showWaypoints = total >= 12;

  return (
    <div className="space-y-1.5 mb-6">
      <div className="relative w-full bg-muted rounded-full h-2">
        <div
          className="h-2 rounded-full transition-all duration-300 bg-primary"
          style={{ width: `${pct}%` }} />
        
        {showWaypoints && [25, 50, 75].map((mark) =>
        <div
          key={mark}
          className="absolute -top-4 -translate-x-1/2"
          style={{ left: `${mark}%` }}>
          
            <Milestone className="w-3.5 h-3.5 text-muted-foreground opacity-30" fill="currentColor" />
          </div>
        )}
      </div>
      <div className="text-xs text-muted-foreground">
        {done ? 'Complete!' : `Card ${cardIndex + 1} of ${total}`}
      </div>
    </div>);

}