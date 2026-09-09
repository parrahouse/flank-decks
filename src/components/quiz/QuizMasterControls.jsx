import { useState } from 'react';
import { Zap, Timer, Skull, Swords, ToggleLeft, ChevronDown, Info, Trophy, LayoutGrid, Hash } from 'lucide-react';
import { cn } from '@/lib/utils';

const GAME_MODES = [
  { id: 'rapid_fire', label: 'Rapid-Fire', icon: Zap, command: 'Start a rapid-fire quiz' },
  { id: 'true_false', label: 'True / False', icon: ToggleLeft, command: 'Start a True or False game' },
  { id: 'speed_round', label: 'Speed Round', icon: Timer, command: 'Start a Speed Round' },
  { id: 'sudden_death', label: 'Sudden Death', icon: Skull, command: 'Start Sudden Death' },
  { id: 'trivia_battle', label: 'Trivia Battle', icon: Swords, command: 'Start a Trivia Battle' },
];

const QUICK_COMMANDS = ['Show scoreboard', 'New game', 'Switch deck'];

export default function QuizMasterControls({ decks, onSendCommand, disabled }) {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedDeckIds, setSelectedDeckIds] = useState(new Set());

  const toggleDeck = (id) => {
    setSelectedDeckIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedDeckIds(new Set());

  const buildCommand = (base) => {
    if (selectedDeckIds.size === 0) return `${base} from all my decks`;
    const selected = decks.filter(d => selectedDeckIds.has(d.id));
    const names = selected.map(d => `"${d.title}"`).join(', ');
    return `${base} from decks: ${names}`;
  };

  const handleMode = (mode) => {
    if (disabled) return;
    onSendCommand(buildCommand(mode.command));
  };

  const handleQuick = (cmd) => {
    if (disabled) return;
    onSendCommand(cmd);
  };

  const allSelected = selectedDeckIds.size === 0;

  return (
    <div className="shrink-0 border-b border-border bg-background">
      <div className="px-4 py-2.5">
        {/* Header row */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-2 w-full text-left"
        >
          <Info className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="text-xs font-semibold text-foreground">How to play</span>
          <span className="text-xs text-muted-foreground hidden sm:inline">Pick a mode, choose decks, or type below</span>
          <ChevronDown className={cn('w-4 h-4 ml-auto text-muted-foreground transition-transform', collapsed ? '' : 'rotate-180')} />
        </button>

        {/* Expanded content */}
        {!collapsed && (
          <div className="mt-3 space-y-3">
            {/* Game modes */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                <Trophy className="w-3 h-3" /> Game modes
              </p>
              <div className="flex flex-wrap gap-1.5">
                {GAME_MODES.map(mode => {
                  const Icon = mode.icon;
                  return (
                    <button
                      key={mode.id}
                      onClick={() => handleMode(mode)}
                      disabled={disabled}
                      className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:border-amber-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {mode.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Deck selector */}
            {decks.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                  <LayoutGrid className="w-3 h-3" /> Decks
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={selectAll}
                    disabled={disabled}
                    className={cn(
                      'text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                      allSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-muted-foreground hover:bg-accent'
                    )}
                  >
                    All decks
                  </button>
                  {decks.map(deck => {
                    const selected = selectedDeckIds.has(deck.id);
                    return (
                      <button
                        key={deck.id}
                        onClick={() => toggleDeck(deck.id)}
                        disabled={disabled}
                        className={cn(
                          'text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed max-w-[200px] truncate',
                          selected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-card text-muted-foreground hover:bg-accent'
                        )}
                      >
                        {deck.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick commands */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                <Hash className="w-3 h-3" /> Quick commands
              </p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_COMMANDS.map(cmd => (
                  <button
                    key={cmd}
                    onClick={() => handleQuick(cmd)}
                    disabled={disabled}
                    className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {cmd}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}