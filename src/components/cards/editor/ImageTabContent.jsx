import {
  Upload, Search, Sparkles, Loader2, Pencil, X, Image as ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import InfoTooltip from '../InfoTooltip';
import ImageEditor from '../ImageEditor';
import ImageSearchPanel from '../ImageSearchPanel';
import ImagePoolPicker from '../ImagePoolPicker';
import PreviewPane from './PreviewPane';
import { cn } from '@/lib/utils';

/**
 * ImageTabContent — two-column body for the "Image" tab.
 * Left: image sources + focal-point drag box + fit/revert. Right: live preview.
 */
export default function ImageTabContent({ state, previewLayout, setPreviewLayout }) {
  const s = state;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(420px,520px)_1fr] flex-1 min-h-0 overflow-y-auto md:overflow-hidden">
      {/* ── Left: image tools ─────────────────────────────────────────────── */}
      <div className="px-6 py-5 space-y-4 min-h-0 md:overflow-y-auto">
        <div className="space-y-2">
          <label className="text-sm font-medium">Image</label>
          <div
            onClick={() => s.fileRef.current?.click()}
            className="relative border-2 border-dashed border-border rounded-xl overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
            style={{ aspectRatio: '16 / 9' }}
          >
            {s.imageUrl ? (
              <div
                className="relative w-full h-full overflow-hidden select-none"
                style={{
                  backgroundColor: '#f3f4f6',
                  touchAction: s.imageFit === 'cover' ? 'none' : 'auto',
                  cursor: s.imageFit === 'cover' ? (s.draggingPreview ? 'grabbing' : 'grab') : 'default',
                }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => { e.preventDefault(); s.beginFocalDrag(e); }}
                onPointerMove={s.moveFocalDrag}
                onPointerUp={s.endFocalDrag}
                onPointerCancel={s.endFocalDrag}
              >
                <img
                  ref={s.previewImgRef}
                  src={s.imageUrl}
                  alt="card"
                  className="w-full h-full pointer-events-none"
                  style={{
                    objectFit: s.imageFit,
                    objectPosition: s.imageFit === 'cover' && s.focalPoint ? `${s.focalPoint.x}% ${s.focalPoint.y}%` : 'center',
                  }}
                  draggable={false}
                />
                {s.imageFit === 'cover' && !s.draggingPreview && (
                  <div className="absolute bottom-2 left-2 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full pointer-events-none">
                    Drag to reposition
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                {s.uploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <ImageIcon className="w-8 h-8" />}
                <span className="text-sm">{s.uploading ? 'Uploading…' : 'Click to upload image'}</span>
              </div>
            )}
            {s.imageUrl && (
              <>
                <button onClick={(e) => { e.stopPropagation(); s.setImageUrl(''); s.setOriginalImageUrl(null); s.dismissPoolPrompt(); }} className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80">
                  <X className="w-3.5 h-3.5" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); s.setShowImageEditor(true); }} className="absolute top-2 left-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
          <input ref={s.fileRef} type="file" accept="image/*" className="hidden" onChange={s.handleImageUpload} />

          {/* Offer to add a freshly uploaded image to the pool */}
          {s.poolPromptUrl && s.poolPromptUrl === s.imageUrl && (
            <div className="flex items-center gap-2 mt-1">
              <input
                value={s.poolTags}
                onChange={(e) => s.setPoolTags(e.target.value)}
                placeholder="Tags (comma-separated)"
                className="flex-1 min-w-0 text-xs border border-border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                onClick={s.addToPool}
                disabled={s.addingToPool}
                className="text-xs font-medium bg-primary text-primary-foreground rounded-md px-3 py-1.5 hover:bg-primary/90 disabled:opacity-50 shrink-0"
              >
                {s.addingToPool ? 'Adding…' : 'Add to pool'}
              </button>
              <button
                type="button"
                onClick={s.dismissPoolPrompt}
                className="text-muted-foreground hover:text-foreground shrink-0"
                title="Don't add to pool"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Fit toggle */}
          {s.imageUrl && (
            <div className="flex gap-2">
              {[{ value: 'cover', label: 'Fill frame' }, { value: 'contain', label: 'Fit whole image' }].map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => s.setImageFit(value)}
                  className={cn(
                    'px-3 py-1 rounded-md border text-xs transition-colors',
                    s.imageFit === value
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border hover:border-primary/50 text-muted-foreground'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Revert to original */}
          {s.originalImageUrl && (
            <button
              type="button"
              onClick={() => {
                s.setImageUrl(s.originalImageUrl);
                s.setOriginalImageUrl(null);
                s.setFocalPoint({ x: 50, y: 50 });
              }}
              className="text-xs text-muted-foreground hover:underline"
            >
              Revert to original (undo crop)
            </button>
          )}

          <div className="flex items-center justify-between">
            <InfoTooltip text="Accepted: JPG, PNG, GIF, WebP · Min 10 KB · Max 10 MB" />
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => { s.setShowImagePicker(v => !v); s.setShowImageSearch(false); s.setShowAiImageGen(false); }} className="flex items-center gap-1 text-xs text-primary hover:underline">
                <ImageIcon className="w-3 h-3" /> Image pool
              </button>
              <button type="button" onClick={() => { s.setShowImageSearch(v => !v); s.setShowImagePicker(false); s.setShowAiImageGen(false); }} className="flex items-center gap-1 text-xs text-primary hover:underline">
                <Search className="w-3 h-3" /> Search Wikimedia
              </button>
              <button type="button" onClick={s.openAiImageGen} className="flex items-center gap-1 text-xs text-primary hover:underline">
                <Sparkles className="w-3 h-3" /> AI Generate
              </button>
            </div>
          </div>
        </div>

        {/* AI image generation panel */}
        {s.showAiImageGen && (
          <div className="border border-border rounded-lg p-3 space-y-3 bg-accent/20">
            <p className="text-xs font-medium text-foreground">Generate an image with AI</p>
            <Textarea
              value={s.aiImagePrompt}
              onChange={e => s.setAiImagePrompt(e.target.value)}
              placeholder="Describe what the image should show…"
              rows={2}
              className="resize-none text-sm"
            />
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Style</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(s.STYLE_PRESETS).map(([key, { label, emoji }]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => s.setAiImageStyle(key)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors text-left',
                      s.aiImageStyle === key
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-border hover:border-primary/50 text-muted-foreground'
                    )}
                  >
                    <span>{emoji}</span> {label}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                onClick={() => s.setAiImageHumor(v => !v)}
                className={cn(
                  'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer',
                  s.aiImageHumor ? 'bg-primary' : 'bg-muted'
                )}
              >
                <span className={cn('pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform', s.aiImageHumor ? 'translate-x-4' : 'translate-x-0')} />
              </div>
              <span className="text-xs text-muted-foreground">😄 Add a subtle humorous element</span>
            </label>
            <Button type="button" size="sm" onClick={s.handleGenerateAiImage} disabled={s.generatingImage} className="w-full gap-1.5">
              {s.generatingImage ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</> : <><Sparkles className="w-3.5 h-3.5" /> Generate Image</>}
            </Button>
          </div>
        )}

        {/* Pick from image pool */}
        {s.showImagePicker && (
          <ImagePoolPicker
            onSelect={(url) => { s.setImageUrl(url); s.setOriginalImageUrl(null); s.setFocalPoint({ x: 50, y: 50 }); s.setShowImagePicker(false); s.dismissPoolPrompt(); }}
            onClose={() => s.setShowImagePicker(false)}
          />
        )}

        {/* Wikimedia search */}
        {s.showImageSearch && (
          <ImageSearchPanel
            defaultQuery={s.imageSeed}
            onSelect={(url) => { s.setImageUrl(url); s.setOriginalImageUrl(null); s.setFocalPoint({ x: 50, y: 50 }); s.setShowImageSearch(false); }}
            onClose={() => s.setShowImageSearch(false)}
          />
        )}
      </div>

      {/* ── Right: live preview ───────────────────────────────────────────── */}
      <div className="relative px-6 py-5 md:border-l border-border bg-muted/20 min-h-0 md:overflow-y-auto">
        <PreviewPane state={s} previewLayout={previewLayout} setPreviewLayout={setPreviewLayout} />
      </div>

      {/* Image editor (crop) modal */}
      {s.showImageEditor && s.imageUrl && (
        <ImageEditor
          open={s.showImageEditor}
          imageUrl={s.originalImageUrl || s.imageUrl}
          onClose={() => s.setShowImageEditor(false)}
          onSave={(dataUrl) => {
            s.setShowImageEditor(false);
            if (dataUrl) {
              if (!s.originalImageUrl && s.imageUrl && !s.imageUrl.startsWith('data:')) {
                s.setOriginalImageUrl(s.imageUrl);
              }
              s.setImageUrl(dataUrl);
            }
          }}
        />
      )}
    </div>
  );
}