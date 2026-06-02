import { Dialog, DialogContent } from '@/components/ui/dialog';
import StudyCard from './StudyCard';

export default function CardPreviewModal({ card, deck, open, onClose }) {
  if (!card) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl p-4">
        <p className="text-xs text-muted-foreground mb-3 text-center">Preview — answers are not scored</p>
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
      </DialogContent>
    </Dialog>
  );
}