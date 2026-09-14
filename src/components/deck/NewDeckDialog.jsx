import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, X, FileText, AlertCircle, CheckCircle2, Loader2, Download, ImagePlus, Images } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { base44 } from '@/api/base44Client';
import ImagePoolGallery from '@/components/deck/ImagePoolGallery';
import { parseCSV, rowToCard, SAMPLE_CSV } from '@/components/cards/CsvUploadModal';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

function makeToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function NewDeckDialog({ open, onClose }) {
  const qc = useQueryClient();
  const coverRef = useRef();
  const csvRef = useRef();

  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [uploadingCover, setUploadingCover] = useState(false);
  const [showPool, setShowPool] = useState(false);

  const [csvName, setCsvName] = useState('');
  const [preview, setPreview] = useState(null); // { cards, errors }
  const [dragging, setDragging] = useState(false);
  const [creating, setCreating] = useState(false);

  const reset = () => {
    setTitle('');
    setDesc('');
    setCoverUrl('');
    setShowPool(false);
    setCsvName('');
    setPreview(null);
  };

  const handleCoverFile = async (file) => {
    if (!file) return;
    if (file.size < 10 * 1024) { toast.error('Image is too small (min 10 KB).'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('Image is too large (max 10 MB).'); return; }
    setUploadingCover(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setCoverUrl(file_url);
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploadingCover(false);
    }
  };

  const handleCsvFile = (file) => {
    if (!file) return;
    setCsvName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const { rows, error } = parseCSV(e.target.result);
      if (error) { setPreview({ cards: [], errors: [error] }); return; }
      const errors = [];
      const cards = [];
      rows.forEach((row, i) => {
        const card = rowToCard(row, '', i);
        if (!card) errors.push(`Row ${i + 2}: missing correct_answers, or missing decoy choices.`);
        else cards.push(card);
      });
      setPreview({ cards, errors });
    };
    reader.readAsText(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith('.csv')) handleCsvFile(file);
    else toast.error('Please drop a .csv file');
  };

  const downloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'flashdeck_sample.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleCreate = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const deck = await base44.entities.Deck.create({
        title,
        description: desc,
        is_public: false,
        share_token: makeToken(),
        ...(coverUrl && { cover_image_url: coverUrl, cover_focal_point: { x: 50, y: 50 } }),
      });

      if (preview?.cards?.length) {
        const cards = preview.cards.map((c, i) => ({ ...c, deck_id: deck.id, order: i }));
        await base44.entities.Card.bulkCreate(cards);
      }

      qc.invalidateQueries(['owned-decks']);
      qc.invalidateQueries(['cards-library']);
      const cardCount = preview?.cards?.length || 0;
      toast.success(cardCount ? `Deck created with ${cardCount} cards` : 'Deck created');
      reset();
      onClose();
    } catch {
      toast.error('Could not create deck');
    } finally {
      setCreating(false);
    }
  };

  const close = (v) => { if (!v) { reset(); onClose(); } };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Deck</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Title */}
          <div className="space-y-1.5">
            <Label>Title <span className="text-destructive">*</span></Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Animals in Spanish" />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What is this deck about?" rows={2} />
          </div>

          {/* Cover image */}
          <div className="space-y-1.5">
            <Label>Cover Image <span className="text-muted-foreground text-xs">(optional)</span></Label>
            {coverUrl ? (
              <div className="relative w-full overflow-hidden rounded-lg border border-border" style={{ aspectRatio: '16 / 9' }}>
                <img src={coverUrl} alt="cover" className="w-full h-full object-cover" />
                <button
                  onClick={() => setCoverUrl('')}
                  className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div
                onClick={() => coverRef.current?.click()}
                className="border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/50 transition-colors"
                style={{ aspectRatio: '16 / 9' }}
              >
                {uploadingCover
                  ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  : <ImagePlus className="w-6 h-6 text-muted-foreground" />}
                <span className="text-sm text-muted-foreground">
                  {uploadingCover ? 'Uploading…' : 'Click to upload cover'}
                </span>
              </div>
            )}
            <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleCoverFile(e.target.files[0])} />
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setShowPool((v) => !v)} className="flex items-center gap-1 text-xs text-primary hover:underline">
                <Images className="w-3 h-3" /> Pick from pool
              </button>
            </div>
            {showPool && (
              <ImagePoolGallery
                deckTitle={title}
                deckDescription={desc}
                selected={coverUrl}
                onSelect={(url) => setCoverUrl(url)}
              />
            )}
          </div>

          {/* CSV import */}
          <div className="space-y-1.5">
            <Label>Import Cards from CSV <span className="text-muted-foreground text-xs">(optional)</span></Label>
            {!preview ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => csvRef.current?.click()}
                className={cn(
                  'border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-1.5 py-6 cursor-pointer transition-colors',
                  dragging ? 'border-primary bg-accent/40' : 'border-border hover:border-primary/50'
                )}
              >
                <Upload className="w-5 h-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Drop a CSV here or click to browse</p>
                <p className="text-xs text-muted-foreground/70">.csv files only</p>
              </div>
            ) : (
              <div className="space-y-2">
                {preview.errors.length > 0 && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-2.5 space-y-1">
                    <p className="text-xs font-semibold text-destructive flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> {preview.errors.length} row(s) skipped
                    </p>
                    {preview.errors.slice(0, 3).map((e, i) => <p key={i} className="text-xs text-destructive/80">{e}</p>)}
                  </div>
                )}
                {preview.cards.length > 0 ? (
                  <div className="bg-success/10 border border-success/20 rounded-lg p-2.5 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                    <p className="text-sm text-success font-medium">
                      {preview.cards.length} card{preview.cards.length !== 1 ? 's' : ''} ready · {csvName}
                    </p>
                  </div>
                ) : (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-2.5">
                    <p className="text-sm text-destructive">No valid cards found.</p>
                  </div>
                )}
                <button
                  onClick={() => { setPreview(null); setCsvName(''); }}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <FileText className="w-3.5 h-3.5" /> Choose a different file
                </button>
              </div>
            )}
            <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={(e) => handleCsvFile(e.target.files[0])} />
            <button onClick={downloadSample} className="text-xs text-muted-foreground hover:underline flex items-center gap-1">
              <Download className="w-3.5 h-3.5" /> Download sample CSV
            </button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!title.trim() || creating || uploadingCover} className="gap-1.5">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Create Deck{preview?.cards?.length ? ` (${preview.cards.length})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}