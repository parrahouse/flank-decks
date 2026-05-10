export default function StreakBar({ cardIndex, total, done }) {
  const pct = total > 0 ? ((cardIndex + (done ? 1 : 0)) / total) * 100 : 0;

  return (
    <div className="space-y-1.5 mb-6">
      <div className="w-full bg-muted rounded-full h-2">
        <div
          className="h-2 rounded-full transition-all duration-300 bg-primary"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-xs text-muted-foreground">
        {done ? 'Complete!' : `Card ${cardIndex + 1} of ${total}`}
      </div>
    </div>
  );
}