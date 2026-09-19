import { useRef, useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, Check, Loader2, X, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';
import ImageEditor from '@/components/cards/ImageEditor';
import ImagePoolGallery from '@/components/deck/ImagePoolGallery';
import { toast } from 'sonner';
import useDominantColor from '@/hooks/useDominantColor';
import useBandLuminance from '@/hooks/useBandLuminance';
import { TONE_LIGHT, TONE_DARK, buildScrim, buildScrimGradient } from '@/lib/heroAppearance';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function CoverImagePicker({ mode = 'cover', open, onClose, cards, currentUrl, currentFocalPoint, currentOriginalUrl, inheritedUrl, inheritedFocalPoint, currentTextTone, currentScrimDisabled, onSave, deckTitle, deckDescription }) {
  const isHero = mode === 'hero';
  const qc = useQueryClient();
  const [selected, setSelected] = useState(currentUrl || null);
  const [originalUrl, setOriginalUrl] = useState(currentOriginalUrl || null);
  const [focalPoint, setFocalPoint] = useState(currentFocalPoint || { x: 50, y: 50 });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draggingPreview, setDraggingPreview] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [addToPool, setAddToPool] = useState(false);
  const [poolTags, setPoolTags] = useState('');
  const [textTone, setTextTone] = useState(currentTextTone || 'light');
  const [scrimDisabled, setScrimDisabled] = useState(!!currentScrimDisabled);
  // Remembers the author's scrim choice under light tone, so a round-trip
  // through dark tone does not silently discard it.
  const lightScrimPrefRef = useRef(!!currentScrimDisabled);
  const fileRef = useRef();

  const parseTags = (str) => str.split(',').map((t) => t.trim()).filter(Boolean);
  const previewRef = useRef();
  const previewImgRef = useRef();
  const focalDragRef = useRef();

  // Dark text over a darkened image is the one always-wrong combination, so the
  // tone owns the scrim. The switch is disabled, not merely overridden, so that
  // state is never reachable by clicking.
  const changeTextTone = (next) => {
    if (next === 'dark') {
      lightScrimPrefRef.current = scrimDisabled;
      setScrimDisabled(true);
    } else {
      setScrimDisabled(lightScrimPrefRef.current);
    }
    setTextTone(next);
  };

  // In hero mode the header falls back to the cover when no hero is set, so the
  // preview must show that fallback. It is display-only: the focal point and
  // crop of an inherited cover belong to the cover picker, not this dialog.
  const previewUrl = selected || (isHero ? inheritedUrl || null : null);
  const isInherited = !selected && !!previewUrl;
  const inheritedFp = inheritedFocalPoint || { x: 50, y: 50 };
  const previewObjectPosition = isInherited
    ? `${inheritedFp.x}% ${inheritedFp.y}%`
    : `${focalPoint.x}% ${focalPoint.y}%`;

  // Live scrim preview. Same extraction hooks and same gradient builder as the
  // header, so what is previewed is what renders.
  const PREVIEW_FADE_RATIO = 0.62; // fraction of the pane the fade covers
  const previewColor = useDominantColor(isHero ? previewUrl : null);
  const previewBandL = useBandLuminance(isHero ? previewUrl : null, 0.55, 1);
  const previewScrim = buildScrim(previewColor, previewBandL);
  const previewTone = textTone === 'dark' ? TONE_DARK : TONE_LIGHT;
  const previewGradient = buildScrimGradient(previewScrim, Math.round(176 * PREVIEW_FADE_RATIO)); // h-44 = 176px

  // All state above initializes from props on FIRST MOUNT only, and this dialog
  // stays mounted between opens. Without this, cancelling and reopening shows
  // the abandoned edit rather than what is saved. Pre-existing for the image
  // fields; fixed here rather than reproduced for the two new ones.
  useEffect(() => {
    if (!open) return;
    setSelected(currentUrl || null);
    setOriginalUrl(currentOriginalUrl || null);
    setFocalPoint(currentFocalPoint || { x: 50, y: 50 });
    setTextTone(currentTextTone || 'light');
    setScrimDisabled(!!currentScrimDisabled);
    lightScrimPrefRef.current = !!currentScrimDisabled;
  }, [open]);

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
    if (addToPool) {
      try {
        await base44.entities.ImagePool.create({ image_url: file_url, tags: parseTags(poolTags) });
        qc.invalidateQueries(['image-pool']);
        toast.success('Image added to pool');
      } catch (e) {
        toast.error('Could not add image to pool');
      }
    }
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isHero ? 'Deck Hero Image' : 'Deck Cover Image'}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">
            {isHero
              ? 'Background of the deck header and study settings screen. Leave empty to use the cover image.'
              : 'Thumbnail shown on deck cards and in collections.'}
          </p>

          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {/* Preview with drag-to-reposition focal point. In hero mode this
                also renders the inherited cover when no hero is set, so the
                appearance controls always have something to preview. */}
            {previewUrl && (
              <div className="space-y-2">
                <div
                  ref={previewRef}
                  className={cn('relative rounded-xl overflow-hidden bg-muted select-none', isHero ? 'h-44' : 'h-36')}
                  style={{
                    touchAction: 'none',
                    cursor: isInherited ? 'default' : draggingPreview ? 'grabbing' : 'grab',
                  }}
                  onPointerDown={(e) => { if (isInherited) return; e.preventDefault(); beginFocalDrag(e); }}
                  onPointerMove={moveFocalDrag}
                  onPointerUp={endFocalDrag}
                  onPointerCancel={endFocalDrag}
                >
                  <img
                    ref={previewImgRef}
                    src={previewUrl}
                    alt={isHero ? 'hero preview' : 'cover preview'}
                    className="w-full h-full object-cover pointer-events-none"
                    style={{ objectPosition: previewObjectPosition }}
                    draggable={false}
                  />

                  {/* Scrim + sample text, hero mode only */}
                  {isHero && !scrimDisabled && (
                    <div className="absolute inset-0 pointer-events-none" style={{ background: previewGradient }} />
                  )}
                  {isHero && (
                    <div className="absolute bottom-0 left-0 right-0 px-3 pb-2 pointer-events-none">
                      <p className={cn("font-bold text-lg [font-family:'new-spirit',_serif] truncate", previewTone.title)}>
                        {deckTitle || 'Deck title'}
                      </p>
                      {deckDescription && (
                        <p className={cn("text-xs truncate", previewTone.desc)}>{deckDescription}</p>
                      )}
                    </div>
                  )}

                  {/* Editing affordances — only for an image this dialog owns */}
                  {!isInherited && (
                    <>
                      <div
                        className="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ left: `${focalPoint.x}%`, top: `${focalPoint.y}%` }}
                      >
                        <div className="w-full h-full rounded-full border-2 border-white shadow-md bg-primary/60" />
                      </div>
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
                    </>
                  )}

                  {!isInherited && !draggingPreview && (
                    <div className={cn(
                      "absolute bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full pointer-events-none",
                      isHero ? "top-2 left-10" : "bottom-2 left-2"
                    )}>
                      Drag to reposition
                    </div>
                  )}
                  {isInherited && (
                    <div className="absolute top-2 left-2 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full pointer-events-none">
                      Using cover image
                    </div>
                  )}
                </div>

                {isInherited ? (
                  <p className="text-xs text-muted-foreground">
                    No hero set — the header uses the cover image. Upload or pick one below to override it. Appearance settings below apply either way.
                  </p>
                ) : (
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
                )}
              </div>
            )}

            {isHero && previewUrl && (
              <div className="rounded-xl border bg-muted/30 p-3 space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Header appearance</p>

                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm">Text color</p>
                    <p className="text-xs text-muted-foreground">How the deck title and toolbar render over this image.</p>
                  </div>
                  <Select value={textTone} onValueChange={changeTextTone}>
                    <SelectTrigger className="h-9 text-sm w-28 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className={cn("text-sm", textTone === 'dark' && "text-muted-foreground")}>Darkening scrim</p>
                    <p className="text-xs text-muted-foreground">
                      {textTone === 'dark'
                        ? 'Off with dark text — dark text over a darkened image is unreadable.'
                        : 'Fades the bottom of the image so white text stays legible.'}
                    </p>
                  </div>
                  <Switch
                    checked={!scrimDisabled}
                    disabled={textTone === 'dark'}
                    onCheckedChange={(v) => setScrimDisabled(!v)}
                  />
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

              {/* Add to image pool */}
              <div className="mt-2 space-y-1.5">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={addToPool}
                    onChange={(e) => setAddToPool(e.target.checked)}
                    className="accent-primary w-3.5 h-3.5"
                  />
                  Add this image to the reusable image pool
                </label>
                {addToPool && (
                  <input
                    value={poolTags}
                    onChange={(e) => setPoolTags(e.target.value)}
                    placeholder="Tags (comma-separated, e.g. biology, cell, plant)"
                    className="w-full text-xs border border-border rounded-md px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                )}
              </div>
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

            {/* Image pool (reuse + AI suggestion) */}
            <ImagePoolGallery
              deckTitle={deckTitle}
              deckDescription={deckDescription}
              selected={selected}
              onSelect={(url) => { setSelected(url); setOriginalUrl(null); setFocalPoint({ x: 50, y: 50 }); }}
            />

            {cardImages.length === 0 && !selected && (
              <p className="text-sm text-muted-foreground text-center py-2">No card images yet. Upload a custom cover above.</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || (!selected && !(isHero && currentUrl))}>
              {saving ? 'Saving…' : isHero ? 'Save Hero' : 'Save Cover'}
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