import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ACCENTS } from '@/components/collections/CollectionFormDialog';

const GROUP_TYPES = [
  { value: 'peer', label: 'Peer study group', desc: 'Everyone studies together and shares progress' },
  { value: 'classroom', label: 'Classroom', desc: 'You assign study and track student progress' },
];

export default function GroupFormDialog({ open, onClose, group = null }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [groupType, setGroupType] = useState('peer');
  const [accent, setAccent] = useState(ACCENTS[0]);

  const isEdit = !!group;

  useEffect(() => {
    if (open) {
      setName(group?.name || '');
      setDescription(group?.description || '');
      setGroupType(group?.group_type || 'peer');
      setAccent(group?.accent_color || ACCENTS[0]);
    }
  }, [open, group]);

  const save = useMutation({
    mutationFn: async () => {
      const trimmedName = name.trim();
      const trimmedDesc = description.trim();
      if (isEdit) {
        // Owner has RLS update rights — no function needed for edits.
        return base44.entities.StudyGroup.update(group.group_id, {
          name: trimmedName,
          description: trimmedDesc || undefined,
          accent_color: accent,
        });
      }
      // Create goes through the createGroup backend function (admin-gated create).
      const res = await base44.functions.invoke('createGroup', {
        name: trimmedName,
        description: trimmedDesc || undefined,
        group_type: groupType,
        accent_color: accent,
      });
      return res.data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries(['my-groups']);
      if (isEdit) {
        qc.invalidateQueries(['group', group.group_id]);
        toast.success('Group updated');
        onClose();
      } else {
        toast.success('Group created');
        onClose();
        navigate(`/groups/${data.group_id}`);
      }
    },
    onError: (e) => toast.error(e?.response?.data?.error || e.message || 'Could not save group'),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Group' : 'New Group'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Name <span className="text-destructive">*</span></Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. AP Bio Study Squad" />
          </div>
          <div className="space-y-1.5">
            <Label>Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this group about?" rows={2} />
          </div>
          {!isEdit && (
            <div className="space-y-1.5">
              <Label>Group type</Label>
              <div className="grid gap-2">
                {GROUP_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setGroupType(t.value)}
                    className={`text-left rounded-md border p-3 transition-colors ${groupType === t.value ? 'border-primary bg-accent' : 'border-border hover:bg-secondary'}`}
                  >
                    <div className="text-sm font-medium text-foreground">{t.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Accent color</Label>
            <div className="flex flex-wrap gap-2">
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAccent(c)}
                  className="w-7 h-7 rounded-full border-2 transition-transform"
                  style={{
                    backgroundColor: c,
                    borderColor: accent === c ? 'hsl(var(--foreground))' : 'transparent',
                    transform: accent === c ? 'scale(1.15)' : 'scale(1)',
                  }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>
            {isEdit ? 'Save Changes' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}