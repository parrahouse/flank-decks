import { cn } from '@/lib/utils';

function Toggle({ label, description, value, onChange }) {
  return (
    <div className="flex items-center justify-between px-1 pt-1">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer ml-4',
          value ? 'bg-primary' : 'bg-muted'
        )}
      >
        <span className={cn(
          'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform',
          value ? 'translate-x-5' : 'translate-x-0'
        )} />
      </button>
    </div>
  );
}

export default function CollectionStudySettings({
  soundEnabled, onSoundChange,
  autoAdvance, onAutoAdvanceChange,
  secondGuessAllowed, onSecondGuessChange,
  hintsAllowed, onHintsChange,
  eliminateAllowed, onEliminateChange,
  gameMode, onGameModeChange,
  gameModeAvailable,
}) {
  return (
    <div className="w-full max-w-sm mx-auto flex flex-col gap-3">
      <div className="border-t border-border pt-2">
        <p className="text-xs font-semibold text-muted-foreground mb-2">Helpers</p>
      </div>
      <Toggle label="Allow 2nd guesses" description="Let a wrong first pick be retried once" value={secondGuessAllowed} onChange={onSecondGuessChange} />
      <Toggle label="Allow notes" description="Show the clue toggle on each card" value={hintsAllowed} onChange={onHintsChange} />
      <Toggle label="Allow eliminate one" description="Let the sparkle button remove a wrong answer choice" value={eliminateAllowed} onChange={onEliminateChange} />

      <div className="border-t border-border pt-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-2">UI Settings</p>
      </div>
      <Toggle label="Sound" description="Play level-start and feedback sounds" value={soundEnabled} onChange={onSoundChange} />
      <Toggle label="Auto-advance" description="Move to next card automatically after a correct answer" value={autoAdvance} onChange={onAutoAdvanceChange} />
      {gameModeAvailable && (
        <Toggle label="Game Mode" description="Three hearts on the line (20+ cards)" value={gameMode} onChange={onGameModeChange} />
      )}
    </div>
  );
}