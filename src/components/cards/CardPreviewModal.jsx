import { Dialog, DialogContent } from '@/components/ui/dialog';
import CardThumbnail from './CardThumbnail';

export default function CardPreviewModal({ card, deck, open, onClose }) {
  if (!card) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md p-4">
        <p className="text-xs text-muted-foreground mb-3 text-center">Preview</p>
        <CardThumbnail card={card} />
      </DialogContent>
    </Dialog>
  );
}