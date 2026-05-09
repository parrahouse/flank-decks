import { useState } from 'react';
import { X, Tag } from 'lucide-react';
import { Input } from '@/components/ui/input';

export default function TagInput({ tags = [], onChange }) {
  const [inputVal, setInputVal] = useState('');

  const addTag = (raw) => {
    const tag = raw.trim().toLowerCase();
    if (!tag || tags.includes(tag)) return;
    onChange([...tags, tag]);
  };

  const removeTag = (tag) => onChange(tags.filter(t => t !== tag));

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputVal);
      setInputVal('');
    } else if (e.key === 'Backspace' && !inputVal && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
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
        onChange={e => setInputVal(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (inputVal.trim()) { addTag(inputVal); setInputVal(''); } }}
        placeholder={tags.length === 0 ? 'Add tags (press Enter or comma)…' : ''}
        className="flex-1 min-w-[120px] text-sm bg-transparent outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}