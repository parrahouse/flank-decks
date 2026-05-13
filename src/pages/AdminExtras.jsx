import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, Pencil, Trash2, Puzzle, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const EMPTY_FORM = {
  name: '',
  type: 'study_buddy',
  description: '',
  sprite_url: '',
  preview_image_url: '',
  status: 'active',
  unlock_condition: 'always',
  unlock_threshold: 0,
  unlock_message: '',
  sort_order: 0,
  tags: [],
  config: {},
};

function ExtraForm({ extra, onSave, onClose }) {
  const [form, setForm] = useState(extra ? {
    ...extra,
    config: extra.config ?? {},
    tags: extra.tags ?? [],
  } : { ...EMPTY_FORM });
  const [configStr, setConfigStr] = useState(JSON.stringify(extra?.config ?? {}, null, 2));
  const [configError, setConfigError] = useState('');

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSave = () => {
    let parsedConfig = {};
    if (configStr.trim()) {
      try {
        parsedConfig = JSON.parse(configStr);
        setConfigError('');
      } catch {
        setConfigError('Invalid JSON in Config field');
        return;
      }
    }
    onSave({ ...form, config: parsedConfig });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Pixel Panda" />
        </div>
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={form.type} onValueChange={v => set('type', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="study_buddy">Study Buddy</SelectItem>
              <SelectItem value="minigame">Minigame</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Sprite URL</Label>
          <Input value={form.sprite_url} onChange={e => set('sprite_url', e.target.value)} placeholder="https://..." />
        </div>
        <div className="space-y-1.5">
          <Label>Preview Image URL</Label>
          <Input value={form.preview_image_url} onChange={e => set('preview_image_url', e.target.value)} placeholder="https://..." />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={v => set('status', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Sort Order</Label>
          <Input type="number" value={form.sort_order} onChange={e => set('sort_order', Number(e.target.value))} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Unlock Condition</Label>
          <Select value={form.unlock_condition} onValueChange={v => set('unlock_condition', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="always">Always Unlocked</SelectItem>
              <SelectItem value="decks_completed">Decks Completed</SelectItem>
              <SelectItem value="cards_mastered">Cards Mastered</SelectItem>
              <SelectItem value="sessions_completed">Sessions Completed</SelectItem>
              <SelectItem value="streak_days">Streak Days</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {form.unlock_condition !== 'always' && (
          <div className="space-y-1.5">
            <Label>Unlock Threshold</Label>
            <Input type="number" value={form.unlock_threshold} onChange={e => set('unlock_threshold', Number(e.target.value))} />
          </div>
        )}
      </div>

      {form.unlock_condition !== 'always' && (
        <div className="space-y-1.5">
          <Label>Locked Message</Label>
          <Input value={form.unlock_message} onChange={e => set('unlock_message', e.target.value)} placeholder="e.g. Complete 5 decks to unlock!" />
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Config (JSON)</Label>
        <Textarea
          value={configStr}
          onChange={e => { setConfigStr(e.target.value); setConfigError(''); }}
          rows={4}
          className="font-mono text-xs"
          placeholder='{"frames": 8, "speed": 0.15}'
        />
        {configError && <p className="text-xs text-destructive">{configError}</p>}
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave}>Save</Button>
      </div>
    </div>
  );
}

export default function AdminExtras() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState(null); // null | { mode: 'create'|'edit', extra?: object }

  const { data: extras = [], isLoading } = useQuery({
    queryKey: ['extras'],
    queryFn: () => base44.entities.Extra.list('sort_order'),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => dialog?.extra
      ? base44.entities.Extra.update(dialog.extra.id, data)
      : base44.entities.Extra.create(data),
    onSuccess: () => {
      qc.invalidateQueries(['extras']);
      setDialog(null);
      toast.success(dialog?.extra ? 'Extra updated' : 'Extra created');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Extra.delete(id),
    onSuccess: () => { qc.invalidateQueries(['extras']); toast.success('Extra deleted'); },
  });

  const buddies = extras.filter(e => e.type === 'study_buddy');
  const minigames = extras.filter(e => e.type === 'minigame');

  const ExtraCard = ({ extra }) => (
    <div className="flex items-center gap-3 bg-card border border-border rounded-xl p-3">
      {extra.preview_image_url
        ? <img src={extra.preview_image_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
        : <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0 text-muted-foreground text-lg">?</div>
      }
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{extra.name}</p>
        <p className="text-xs text-muted-foreground truncate">{extra.description || '—'}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${extra.status === 'active' ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
            {extra.status}
          </span>
          {extra.unlock_condition !== 'always' && (
            <span className="text-xs text-muted-foreground">
              🔒 {extra.unlock_condition.replace(/_/g, ' ')} ≥ {extra.unlock_threshold}
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDialog({ mode: 'edit', extra })}>
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(extra.id)}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Extras</h1>
        <Button onClick={() => setDialog({ mode: 'create' })} className="gap-1.5">
          <Plus className="w-4 h-4" /> Add Extra
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : (
        <>
          {/* Study Buddies */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-semibold">Study Buddies</h2>
              <span className="text-xs text-muted-foreground">({buddies.length})</span>
            </div>
            {buddies.length === 0
              ? <p className="text-sm text-muted-foreground">No study buddies yet.</p>
              : <div className="space-y-2">{buddies.map(e => <ExtraCard key={e.id} extra={e} />)}</div>
            }
          </section>

          {/* Minigames */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Puzzle className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-semibold">Minigames</h2>
              <span className="text-xs text-muted-foreground">({minigames.length})</span>
            </div>
            {minigames.length === 0
              ? <p className="text-sm text-muted-foreground">No minigames yet.</p>
              : <div className="space-y-2">{minigames.map(e => <ExtraCard key={e.id} extra={e} />)}</div>
            }
          </section>
        </>
      )}

      <Dialog open={!!dialog} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog?.extra ? 'Edit Extra' : 'Add Extra'}</DialogTitle>
          </DialogHeader>
          {dialog && (
            <ExtraForm
              extra={dialog.extra}
              onSave={(data) => saveMutation.mutate(data)}
              onClose={() => setDialog(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}