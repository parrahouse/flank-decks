import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Plus, Minus, Check } from 'lucide-react';

async function getCroppedImg(imageSrc, pixelCrop) {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = imageSrc;
  });
  const canvas = document.createElement('canvas');
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height);
  return canvas.toDataURL('image/jpeg', 0.92);
}

export default function ImageEditor({ open, imageUrl, initialFocalPoint, initialImageFit, onSave, onClose }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const [imageFit, setImageFit] = useState(initialImageFit || 'cover');
  const [focalPoint, setFocalPoint] = useState(initialFocalPoint || { x: 50, y: 50 });
  const [draggingFocal, setDraggingFocal] = useState(false);

  const onCropComplete = useCallback((_, areaPixels) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleSave = async () => {
    if (croppedAreaPixels) {
      const dataUrl = await getCroppedImg(imageUrl, croppedAreaPixels);
      onSave(dataUrl, focalPoint, imageFit);
    } else {
      onSave(null, focalPoint, imageFit);
    }
  };

  const handleFocalMove = (e, rect) => {
    const x = Math.round(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)));
    const y = Math.round(Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)));
    setFocalPoint({ x, y });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Image</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Crop area */}
          <div>
            <Label className="mb-2 block">Crop (4:3)</Label>
            <div className="relative w-full bg-black rounded-xl overflow-hidden" style={{ height: 320 }}>
              <Cropper
                image={imageUrl}
                crop={crop}
                zoom={zoom}
                aspect={4 / 3}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <div className="flex items-center gap-3 mt-3">
              <Minus className="w-4 h-4 text-muted-foreground shrink-0" />
              <Slider value={[zoom]} min={1} max={3} step={0.05} onValueChange={([v]) => setZoom(v)} className="flex-1" />
              <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
            </div>
          </div>

          {/* Image Fit */}
          <div>
            <Label className="mb-2 block">Display Mode</Label>
            <div className="flex gap-2">
              {[{ value: 'cover', label: '🔲 Fill frame (crop)' }, { value: 'contain', label: '⬜ Fit to frame (no crop)' }].map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setImageFit(value)}
                  className={`flex-1 px-3 py-2 rounded-md border text-sm transition-colors ${
                    imageFit === value
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border hover:border-primary/50 text-muted-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Focal Point — only relevant for cover mode */}
          {imageFit === 'cover' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Focal Point</Label>
                <button type="button" onClick={() => setFocalPoint({ x: 50, y: 50 })} className="text-xs text-muted-foreground hover:underline">Reset to center</button>
              </div>
              <p className="text-xs text-muted-foreground mb-2">Drag the dot to set the focus point used when the image is cropped to fill its frame.</p>
              <div
                className="relative w-full rounded-xl overflow-hidden select-none bg-muted"
                style={{ aspectRatio: '4/3', cursor: draggingFocal ? 'grabbing' : 'crosshair' }}
                onMouseDown={(e) => { e.preventDefault(); setDraggingFocal(true); handleFocalMove(e, e.currentTarget.getBoundingClientRect()); }}
                onMouseMove={(e) => { if (!draggingFocal) return; handleFocalMove(e, e.currentTarget.getBoundingClientRect()); }}
                onMouseUp={() => setDraggingFocal(false)}
                onMouseLeave={() => setDraggingFocal(false)}
                onTouchStart={(e) => { setDraggingFocal(true); const t = e.touches[0]; handleFocalMove(t, e.currentTarget.getBoundingClientRect()); }}
                onTouchMove={(e) => { e.preventDefault(); const t = e.touches[0]; handleFocalMove(t, e.currentTarget.getBoundingClientRect()); }}
                onTouchEnd={() => setDraggingFocal(false)}
              >
                <img src={imageUrl} alt="" className="w-full h-full pointer-events-none" style={{ objectFit: 'cover', objectPosition: `${focalPoint.x}% ${focalPoint.y}%` }} />
                <div
                  className="absolute w-6 h-6 rounded-full border-2 border-white bg-primary/80 -translate-x-1/2 -translate-y-1/2 pointer-events-none shadow-lg"
                  style={{ left: `${focalPoint.x}%`, top: `${focalPoint.y}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1 border-t border-border">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} className="gap-1.5"><Check className="w-4 h-4" /> Apply</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}