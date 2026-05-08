import { useState, useCallback, useRef } from 'react';
import Cropper from 'react-easy-crop';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Plus, Minus, Type, X, Check } from 'lucide-react';

async function getCroppedImg(imageSrc, pixelCrop, textOverlays) {
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

  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y,
    pixelCrop.width, pixelCrop.height,
    0, 0,
    pixelCrop.width, pixelCrop.height
  );

  // Draw text overlays
  textOverlays.forEach(({ text, x, y, fontSize, color }) => {
    ctx.font = `bold ${fontSize}px Inter, sans-serif`;
    ctx.fillStyle = color || '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = fontSize / 8;
    const px = (x / 100) * pixelCrop.width;
    const py = (y / 100) * pixelCrop.height;
    ctx.strokeText(text, px, py);
    ctx.fillText(text, px, py);
  });

  return canvas.toDataURL('image/jpeg', 0.92);
}

export default function ImageEditor({ open, imageUrl, onSave, onClose }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  // Text overlays
  const [textOverlays, setTextOverlays] = useState([]);
  const [newText, setNewText] = useState('');
  const [newFontSize, setNewFontSize] = useState(40);
  const [newColor, setNewColor] = useState('#ffffff');
  const [dragging, setDragging] = useState(null); // index of dragged text
  const containerRef = useRef(null);

  const onCropComplete = useCallback((_, areaPixels) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const addText = () => {
    if (!newText.trim()) return;
    setTextOverlays(prev => [...prev, { text: newText, x: 50, y: 50, fontSize: newFontSize, color: newColor }]);
    setNewText('');
  };

  const removeText = (i) => setTextOverlays(prev => prev.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (!croppedAreaPixels) return;
    const dataUrl = await getCroppedImg(imageUrl, croppedAreaPixels, textOverlays);
    onSave(dataUrl);
  };

  // Drag text overlays on the preview
  const handleMouseDown = (e, i) => {
    e.preventDefault();
    setDragging(i);
  };

  const handleMouseMove = useCallback((e) => {
    if (dragging === null || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setTextOverlays(prev => prev.map((t, i) => i === dragging ? { ...t, x, y } : t));
  }, [dragging]);

  const handleMouseUp = useCallback(() => setDragging(null), []);

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
              <Slider
                value={[zoom]}
                min={1} max={3} step={0.05}
                onValueChange={([v]) => setZoom(v)}
                className="flex-1"
              />
              <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
            </div>
          </div>

          {/* Text overlays */}
          <div>
            <Label className="mb-2 block flex items-center gap-1.5"><Type className="w-4 h-4" /> Add Text</Label>
            <div className="flex gap-2 flex-wrap">
              <Input
                value={newText}
                onChange={e => setNewText(e.target.value)}
                placeholder="Type text…"
                className="flex-1 min-w-0"
                onKeyDown={e => e.key === 'Enter' && addText()}
              />
              <input
                type="color"
                value={newColor}
                onChange={e => setNewColor(e.target.value)}
                className="h-9 w-10 rounded border border-input cursor-pointer p-0.5"
                title="Text color"
              />
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Size</span>
                <Input
                  type="number"
                  value={newFontSize}
                  onChange={e => setNewFontSize(Number(e.target.value))}
                  className="w-16 text-xs"
                  min={12} max={120}
                />
              </div>
              <Button type="button" onClick={addText} size="sm" className="gap-1">
                <Plus className="w-3.5 h-3.5" /> Add
              </Button>
            </div>

            {/* Text preview overlay */}
            {textOverlays.length > 0 && (
              <div
                ref={containerRef}
                className="relative mt-3 rounded-xl overflow-hidden bg-black select-none"
                style={{ aspectRatio: '4/3' }}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <img src={imageUrl} alt="" className="w-full h-full object-cover opacity-70" />
                {textOverlays.map((t, i) => (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      left: `${t.x}%`,
                      top: `${t.y}%`,
                      transform: 'translate(-50%, -50%)',
                      fontSize: `${t.fontSize * 0.4}px`,
                      color: t.color,
                      textShadow: '0 1px 4px rgba(0,0,0,0.8)',
                      cursor: 'grab',
                      fontWeight: 'bold',
                      whiteSpace: 'nowrap',
                      userSelect: 'none',
                    }}
                    onMouseDown={e => handleMouseDown(e, i)}
                  >
                    {t.text}
                    <button
                      onClick={() => removeText(i)}
                      className="ml-1.5 text-white/70 hover:text-white align-middle"
                      onMouseDown={e => e.stopPropagation()}
                    >
                      <X className="w-3 h-3 inline" />
                    </button>
                  </div>
                ))}
              </div>
            )}
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