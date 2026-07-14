import { useRef, useState } from 'react';
import { Image as ImageIcon, Upload, Check, Loader2, X, Crosshair } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';

export default function CoverImagePicker({ open, onClose, cards, currentUrl, currentFocalPoint, onSave }) {
  const [selected, setSelected] = useState(currentUrl || null);
  const [focalPoint, setFocalPoint] = useState(currentFocalPoint || { x: 50, y: 50 });
  const [settingFocal, setSettingFocal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();
  const previewRef = useRef();

  const cardImages = cards.filter(c => c.image_url);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setSelected(file_url);
    setFocalPoint({ x: 50, y: 50 });
    setUploading(false);
  };

  const handlePickCard = (imageUrl) => {
    setSelected(imageUrl);
    setFocalPoint({ x: 50, y: 50 });
  };

  const handlePreviewClick = (e) => {
    if (!settingFocal || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    setFocalPoint({ x, y });
    setSettingFocal(false);
  };

  const handleSave = () => {
    onSave(selected, focalPoint);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Deck Cover Image</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Preview with focal point */}
          {selected && (
            <div className="space-y-2">
              <div
                ref={previewRef}
                onClick={handlePreviewClick}
                className={cn(
                  'relative rounded-xl overflow-hidden h-36 bg-muted',
                  settingFocal ? 'cursor-crosshair' : 'cursor-default'
                )}
              >
                <img
                  src={selected}
                  alt="cover preview"
                  className="w-full h-full object-cover"
                  style={{ objectPosition: `${focalPoint.x}% ${focalPoint.y}%` }}
                />
                {/* Focal point indicator */}
                <div
                  className="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ left: `${focalPoint.x}%`, top: `${focalPoint.y}%` }}
                >
                  <div className="w-full h-full rounded-full border-2 border-white shadow-md bg-primary/60" />
                </div>
                {settingFocal && (
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                    <p className="text-white text-xs font-medium bg-black/50 px-3 py-1.5 rounded-full">Click to set focal point</p>
                  </div>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); setSelected(null); setSettingFocal(false); }}
                  className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Focal point: {focalPoint.x}%, {focalPoint.y}%
                </p>
                <button
                  onClick={() => setSettingFocal((v) => !v)}
                  className={cn(
                    'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border transition-colors',
                    settingFocal
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  {settingFocal ? 'Click image…' : 'Set focal point'}
                </button>
              </div>
            </div>
          )}

          {/* Upload custom */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Upload image</p>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 w-full border-2 border-dashed border-border rounded-xl px-4 py-3 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? 'Uploading…' : 'Click to upload a custom cover'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          </div>

          {/* Pick from cards */}
          {cardImages.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Pick from cards</p>
              <div className="grid grid-cols-4 gap-2">
                {cardImages.map(card => (
                  <button
                    key={card.id}
                    onClick={() => handlePickCard(card.image_url)}
                    className={cn(
                      'relative rounded-lg overflow-hidden h-16 border-2 transition-all',
                      selected === card.image_url ? 'border-primary' : 'border-transparent hover:border-primary/40'
                    )}
                  >
                    <img src={card.image_url} alt={card.correct_answer} className="w-full h-full object-cover" />
                    {selected === card.image_url && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <Check className="w-4 h-4 text-primary" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {cardImages.length === 0 && !selected && (
            <p className="text-sm text-muted-foreground text-center py-2">No card images yet. Upload a custom cover above.</p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save Cover</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}