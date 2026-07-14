import { useRef, useState } from 'react';
import { Upload, Check, Loader2, X, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';
import ImageEditor from '@/components/cards/ImageEditor';

export default function CoverImagePicker({ open, onClose, cards, currentUrl, currentFocalPoint, currentOriginalUrl, onSave }) {
  const [selected, setSelected] = useState(currentUrl || null);
  const [originalUrl, setOriginalUrl] = useState(currentOriginalUrl || null);
  const [focalPoint, setFocalPoint] = useState(currentFocalPoint || { x: 50, y: 50 });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draggingPreview, setDraggingPreview] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const fileRef = useRef();
  const previewRef = useRef();
  const previewImgRef = useRef();
  const focalDragRef = useRef();

  const cardImages = cards.filter(c => c.image_url);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setSelected(file_url);
    setOriginalUrl(null);
    setFocalPoint({ x: 50, y: 50 });
    setUploading(false);
  };

  const handlePickCard = (imageUrl) => {
    setSelected(imageUrl);
    setOriginalUrl(null);
    setFocalPoint({ x: 50, y: 50 });
  };

  // Drag-to-reposition (mirrors CardEditor)
  const beginFocalDrag = (e) => {
    if (!selected) return;
    const wrap = e.currentTarget;
    const img = previewImgRef.current;
    if (!img || !img.naturalWidth) return;
    const cW = wrap.clientWidth, cH = wrap.clientHeight;
    const scale = Math.max(cW / img.naturalWidth, cH / img.naturalHeight);
    const ovX = img.naturalWidth * scale - cW;
    const ovY = img.naturalHeight * scale - cH;
    focalDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startFocal: { ...(focalPoint || { x: 50, y: 50 }) },
      ovX,
      ovY,
    };
    setDraggingPreview(true);
    wrap.setPointerCapture(e.pointerId);
  };

  const moveFocalDrag = (e) => {
    const d = focalDragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
    setFocalPoint({
      x: d.ovX > 0.5 ? clamp(d.startFocal.x - (dx / d.ovX) * 100) : d.startFocal.x,
      y: d.ovY > 0.5 ? clamp(d.startFocal.y - (dy / d.ovY) * 100) : d.startFocal.y,
    });
  };

  const endFocalDrag = () => {
    focalDragRef.current = null;
    setDraggingPreview(false);
  };

  const handleCropSave = (dataUrl) => {
    setShowEditor(false);
    if (dataUrl) {
      // Capture original on first crop
      if (!originalUrl && selected && !selected.startsWith('data:')) {
        setOriginalUrl(selected);
      }
      setSelected(dataUrl);
      setFocalPoint({ x: 50, y: 50 });
    }
  };

  const handleSave = async () => {
    let finalUrl = selected;
    if (selected && selected.startsWith('data:')) {
      setSaving(true);
      const blob = await (await fetch(selected)).blob();
      const mime = selected.slice(5, selected.indexOf(';')) || 'image/jpeg';
      const ext = mime.split('/')[1] || 'jpg';
      const file = new File([blob], `cover.${ext}`, { type: mime });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      finalUrl = file_url;
      setSaving(false);
    }
    onSave(finalUrl, focalPoint, originalUrl);
    onClose();
  };

  return (
    <>
      <Dialog open={open && !showEditor} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Deck Cover Image</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Preview with drag-to-reposition focal point */}
            {selected && (
              <div className="space-y-2">
                <div
                  ref={previewRef}
                  className="relative rounded-xl overflow-hidden h-36 bg-muted select-none"
                  style={{
                    touchAction: 'none',
                    cursor: draggingPreview ? 'grabbing' : 'grab',
                  }}
                  onPointerDown={(e) => { e.preventDefault(); beginFocalDrag(e); }}
                  onPointerMove={moveFocalDrag}
                  onPointerUp={endFocalDrag}
                  onPointerCancel={endFocalDrag}
                >
                  <img
                    ref={previewImgRef}
                    src={selected}
                    alt="cover preview"
                    className="w-full h-full object-cover pointer-events-none"
                    style={{ objectPosition: `${focalPoint.x}% ${focalPoint.y}%` }}
                    draggable={false}
                  />
                  {/* Focal point indicator */}
                  <div
                    className="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ left: `${focalPoint.x}%`, top: `${focalPoint.y}%` }}
                  >
                    <div className="w-full h-full rounded-full border-2 border-white shadow-md bg-primary/60" />
                  </div>
                  {!draggingPreview && (
                    <div className="absolute bottom-2 left-2 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full pointer-events-none">
                      Drag to reposition
                    </div>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelected(null); setOriginalUrl(null); setFocalPoint({ x: 50, y: 50 }); }}
                    className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowEditor(true); }}
                    className="absolute top-2 left-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Focal point: {focalPoint.x}%, {focalPoint.y}%
                  </p>
                  {originalUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(originalUrl);
                        setOriginalUrl(null);
                        setFocalPoint({ x: 50, y: 50 });
                      }}
                      className="text-xs text-muted-foreground hover:underline"
                    >
                      Revert to original (undo crop)
                    </button>
                  )}
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
            <Button onClick={handleSave} disabled={saving || !selected}>
              {saving ? 'Saving…' : 'Save Cover'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {showEditor && selected && (
        <ImageEditor
          open={showEditor}
          imageUrl={originalUrl || selected}
          onClose={() => setShowEditor(false)}
          onSave={handleCropSave}
        />
      )}
    </>
  );
}