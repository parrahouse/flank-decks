import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, Loader2, Trash2, X, Images, Search } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const parseTags = (str) => str.split(',').map((t) => t.trim()).filter(Boolean);

export default function ImagePool() {
  const qc = useQueryClient();
  const fileRef = useRef();
  const [uploading, setUploading] = useState(false);
  const [pendingTags, setPendingTags] = useState('');
  const [tagQuery, setTagQuery] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  const { data: pool = [], isLoading } = useQuery({
    queryKey: ['image-pool'],
    queryFn: () => base44.entities.ImagePool.list('-created_date', 200),
  });

  const filtered = (() => {
    const q = tagQuery.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter((p) => (p.tags || []).some((t) => t.toLowerCase().includes(q)));
  })();

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size < 10 * 1024) { toast.error('Image is too small (min 10 KB).'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('Image is too large (max 10 MB).'); return; }
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.ImagePool.create({ image_url: file_url, tags: parseTags(pendingTags) });
      qc.invalidateQueries(['image-pool']);
      setPendingTags('');
      toast.success('Added to image pool');
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    try {
      await base44.entities.ImagePool.delete(id);
      qc.invalidateQueries(['image-pool']);
      toast.success('Removed from pool');
    } catch {
      toast.error('Could not remove image');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center gap-2 mb-1">
        <Images className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Image Pool</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Reusable images shared across all your decks. Add images here, then pick them as deck covers or card images anywhere.
      </p>

      {/* Upload row */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <Input
          value={pendingTags}
          onChange={(e) => setPendingTags(e.target.value)}
          placeholder="Tags for the next upload (comma-separated)"
          className="sm:max-w-xs"
        />
        <Button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="gap-1.5"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? 'Uploading…' : 'Upload to pool'}
        </Button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={tagQuery}
          onChange={(e) => setTagQuery(e.target.value)}
          placeholder="Filter by tag…"
          className="pl-8"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Images className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">{pool.length === 0 ? 'Your pool is empty. Upload an image to get started.' : 'No images match your tag filter.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filtered.map((p) => (
            <div key={p.id} className="group relative rounded-lg overflow-hidden border border-border bg-muted" style={{ aspectRatio: '4 / 3' }}>
              <img src={p.image_url} alt={p.tags?.[0] || 'pool image'} className="w-full h-full object-cover" />
              {(p.tags || []).length > 0 && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2 flex flex-wrap gap-1">
                  {p.tags.map((t) => (
                    <span key={t} className="text-[10px] bg-white/20 text-white px-1.5 py-0.5 rounded">{t}</span>
                  ))}
                </div>
              )}
              <button
                onClick={() => handleDelete(p.id)}
                disabled={deletingId === p.id}
                className={cn(
                  'absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5 hover:bg-destructive transition-colors',
                  'opacity-0 group-hover:opacity-100'
                )}
              >
                {deletingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}