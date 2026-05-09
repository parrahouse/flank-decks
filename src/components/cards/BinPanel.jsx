import { Trash2, RotateCcw, Image as ImageIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function BinPanel({ open, onClose, deletedCards, onRestore, onPermanentDelete }) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-muted-foreground" />
            Bin {deletedCards.length > 0 && `(${deletedCards.length})`}
          </DialogTitle>
        </DialogHeader>

        {deletedCards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-center text-muted-foreground">
            <Trash2 className="w-10 h-10 opacity-20" />
            <p className="text-sm font-medium">The bin is empty</p>
            <p className="text-xs">Deleted cards will appear here</p>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-1">
              {deletedCards.map((card) => (
                <div key={card.id} className="relative bg-card border border-border rounded-xl overflow-hidden">
                  <div className="bg-muted h-24 flex items-center justify-center">
                    {card.image_url
                      ? <img src={card.image_url} alt="" className="w-full h-full object-cover" />
                      : <ImageIcon className="w-6 h-6 text-muted-foreground" />}
                  </div>
                  <div className="p-2.5">
                    <p className="text-sm font-medium text-foreground truncate">{card.correct_answer}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{card.choices.length} choices</p>
                  </div>
                  <div className="flex gap-1 px-2.5 pb-2.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-7 text-xs gap-1 text-success border-success/40 hover:bg-success/10"
                      onClick={() => onRestore(card)}
                    >
                      <RotateCcw className="w-3 h-3" /> Restore
                    </Button>
                    <button
                      onClick={() => onPermanentDelete(card)}
                      className="bg-transparent hover:bg-destructive/10 rounded-lg p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                      title="Delete permanently"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}