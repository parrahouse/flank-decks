import { Loader2, Tags } from 'lucide-react';
import { Label } from '@/components/ui/label';
import InfoTooltip from '../InfoTooltip';
import TagInput from '../TagInput';
import ConceptsTab from '../ConceptsTab';

/**
 * ConceptsTabContent — single-pane body for the "Concepts" tab.
 * Tag input + concept map. No live preview.
 */
export default function ConceptsTabContent({ state, allTags }) {
  const s = state;
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">
        {/* Tags */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5">Tags <InfoTooltip text="Optional — add tags to filter and group cards" /></Label>
            <button
              type="button"
              onClick={s.suggestTags}
              disabled={s.suggestingTags}
              className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
            >
              {s.suggestingTags ? <Loader2 className="w-3 h-3 animate-spin" /> : <Tags className="w-3 h-3" />}
              Suggest tags
            </button>
          </div>
          <TagInput tags={s.tags} onChange={s.setTags} suggestions={allTags} />
        </div>

        {/* Concept map */}
        <div className="border-t border-border pt-5">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            <Tags className="w-3.5 h-3.5" /> Concept Map
          </div>
          <ConceptsTab card={s.card} />
        </div>
      </div>
    </div>
  );
}