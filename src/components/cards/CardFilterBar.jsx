import { Search, X, SlidersHorizontal, Tag } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export default function CardFilterBar({ search, onSearch, sortBy, onSort, masteryFilter, onMasteryFilter, allTags, tagFilters, onTagFilters }) {
  const hasActiveFilter = masteryFilter !== 'all' || sortBy !== 'order' || search.trim() || tagFilters.length > 0;

  const toggleTag = (tag) => {
    if (tagFilters.includes(tag)) {
      onTagFilters(tagFilters.filter(t => t !== tag));
    } else {
      onTagFilters([...tagFilters, tag]);
    }
  };

  return (
    <div className="flex flex-col gap-2 mb-5">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder="Search cards…"
            className="pl-8 h-8 text-sm"
          />
          {search && (
            <button onClick={() => onSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Mastery filter */}
        <Select value={masteryFilter} onValueChange={onMasteryFilter}>
          <SelectTrigger className={cn('h-8 text-xs w-36', masteryFilter !== 'all' && 'border-primary text-primary')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All cards</SelectItem>
            <SelectItem value="unmastered">Unmastered only</SelectItem>
            <SelectItem value="mastered">Mastered only</SelectItem>
          </SelectContent>
        </Select>

        {/* Sort */}
        <div className="flex items-center gap-1.5">
          <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <Select value={sortBy} onValueChange={onSort}>
            <SelectTrigger className="h-8 text-xs w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="order">Default order</SelectItem>
              <SelectItem value="created_date">Date created</SelectItem>
              <SelectItem value="updated_date">Last modified</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Clear all */}
        {hasActiveFilter && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={() => { onSearch(''); onSort('order'); onMasteryFilter('all'); onTagFilters([]); }}
          >
            <X className="w-3 h-3 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Tag pills */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <Tag className="w-3 h-3 text-muted-foreground shrink-0" />
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={cn(
                'text-xs px-2.5 py-1 rounded-full border transition-colors',
                tagFilters.includes(tag)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-transparent text-muted-foreground border-border hover:border-primary hover:text-foreground'
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}