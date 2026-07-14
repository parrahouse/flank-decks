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
  // Stage 2C: preserve source format
  const src = String(imageSrc);
  const isPng = /\.png(\?|$)/i.test(src) || src.startsWith('data:image/png');
  const isWebp = /\.webp(\?|$)/i.test(src) || src.startsWith('data:image/webp');
  const mime = isPng ? 'image/png' : isWebp ? 'image/webp' : 'image/jpeg';
  return canvas.toDataURL(mime, 0.92);
}

// Stage 1D + 2A: crop-only dialog with aspect presets, dirty gate
export default function ImageEditor({ open, imageUrl, onSave, onClose }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  // Stage 2A
  const [aspect, setAspect] = useState(4 / 3);
  const [dirty, setDirty] = useState(false);

  const onCropComplete = useCallback((_, areaPixels) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  // Stage 2B: dirty gate — only bake if user interacted
  const handleSave = async () => {
    if (dirty && croppedAreaPixels) {
      const dataUrl = await getCroppedImg(imageUrl, croppedAreaPixels);
      onSave(dataUrl);
    } else {
      onSave(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crop Image</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Crop area with aspect presets */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Crop</Label>
              <div className="flex gap-1.5">
                {[{ label: '4:3', value: 4 / 3 }, { label: '1:1', value: 1 }, { label: '16:9', value: 16 / 9 }].map(({ label, value }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => { setAspect(value); setDirty(true); }}
                    className={`px-2.5 py-1 rounded-md border text-xs transition-colors ${
                      aspect === value
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-border hover:border-primary/50 text-muted-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative w-full bg-black rounded-xl overflow-hidden" style={{ height: 320 }}>
              <Cropper
                image={imageUrl}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                onInteractionStart={() => setDirty(true)}
              />
            </div>
            <div className="flex items-center gap-3 mt-3">
              <Minus className="w-4 h-4 text-muted-foreground shrink-0" />
              <Slider
                value={[zoom]}
                min={1}
                max={3}
                step={0.05}
                onValueChange={([v]) => { setZoom(v); setDirty(true); }}
                className="flex-1"
              />
              <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1 border-t border-border">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} className="gap-1.5"><Check className="w-4 h-4" /> Apply</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}