import { Dialog, DialogContent } from '@/components/ui/dialog';
import StudyCard from './StudyCard';

export default function CardPreviewModal({ card, deck, open, onClose }) {
  if (!card) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl p-4 max-h-[95dvh] flex flex-col overflow-hidden">
        <p className="text-xs text-muted-foreground mb-2 text-center shrink-0">Preview — answers are not scored</p>
        <div className="overflow-y-auto flex-1 min-h-0">
          <StudyCard
            card={card}
            deck={deck}
            onNext={onClose}
            onPrev={onClose}
            isFirst={true}
            isLast={true}
            onScore={null}
            soundEnabled={false}
            autoAdvance={false}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}