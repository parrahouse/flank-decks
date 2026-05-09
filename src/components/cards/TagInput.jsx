import { useState, useRef, useEffect } from 'react';
import { X, Tag } from 'lucide-react';

export default function TagInput({ tags = [], onChange, suggestions = [] }) {
  const [inputVal, setInputVal] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const containerRef = useRef(null);

  const filteredSuggestions = suggestions.filter(
    s => s.toLowerCase().includes(inputVal.toLowerCase()) && !tags.includes(s)
  );

  const addTag = (raw) => {
    const tag = raw.trim().toLowerCase();
    if (!tag || tags.includes(tag)) return;
    onChange([...tags, tag]);
    setInputVal('');
    setShowSuggestions(false);
    setHighlightedIdx(-1);
  };

  const removeTag = (tag) => onChange(tags.filter(t => t !== tag));

  const handleKeyDown = (e) => {
    if (showSuggestions && filteredSuggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedIdx(i => Math.min(i + 1, filteredSuggestions.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedIdx(i => Math.max(i - 1, -1)); return; }
      if (e.key === 'Enter' && highlightedIdx >= 0) { e.preventDefault(); addTag(filteredSuggestions[highlightedIdx]); return; }
      if (e.key === 'Escape') { setShowSuggestions(false); return; }
    }
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputVal);
    } else if (e.key === 'Backspace' && !inputVal && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) setShowSuggestions(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex flex-wrap gap-1.5 items-center border border-input rounded-md px-2 py-1.5 min-h-[2.25rem] bg-transparent focus-within:ring-1 focus-within:ring-ring">
        <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        {tags.map(tag => (
          <span key={tag} className="inline-flex items-center gap-1 bg-accent text-accent-foreground text-xs px-2 py-0.5 rounded-full">
            {tag}
            <button type="button" onClick={() => removeTag(tag)} className="hover:text-destructive">
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
        <input
          value={inputVal}
          onChange={e => { setInputVal(e.target.value); setShowSuggestions(true); setHighlightedIdx(-1); }}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => {
            // Delay so click on suggestion registers first
            setTimeout(() => {
              if (inputVal.trim()) { addTag(inputVal); }
              setShowSuggestions(false);
            }, 150);
          }}
          placeholder={tags.length === 0 ? 'Add tags (press Enter or comma)…' : ''}
          className="flex-1 min-w-[120px] text-sm bg-transparent outline-none placeholder:text-muted-foreground"
        />
      </div>

      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 mt-1 w-full bg-popover border border-border rounded-md shadow-md overflow-hidden">
          {filteredSuggestions.map((s, idx) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); addTag(s); }}
              className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${idx === highlightedIdx ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}