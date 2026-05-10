import { Info } from 'lucide-react';

export default function InfoTooltip({ text }) {
  return (
    <div className="relative inline-block group">
      <button type="button" className="text-muted-foreground hover:text-foreground transition-colors align-middle">
        <Info className="w-3.5 h-3.5" />
      </button>
      <div className="absolute bottom-full left-0 mb-1.5 w-max max-w-xs bg-popover text-popover-foreground border border-border rounded-lg px-3 py-1.5 text-xs shadow-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
        {text}
      </div>
    </div>
  );
}