import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function JoinGroupDialog({ open, onClose }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [code, setCode] = useState('');

  const reset = () => setCode('');

  const join = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('joinGroup', { invite_code: code });
      return res.data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries(['my-groups']);
      if (data.already_member) {
        toast.success(`You're already in ${data.name}`);
      } else {
        toast.success(`Joined ${data.name}!`);
      }
      reset();
      onClose();
      navigate(`/groups/${data.group_id}`);
    },
    onError: (e) => {
      toast.error(e?.response?.data?.error || e.message || 'Could not join group');
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Join a group</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <p className="text-sm text-muted-foreground">Enter the 8-character invite code your group owner shared with you.</p>
          <Input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter' && code.trim().length === 8) join.mutate(); }}
            placeholder="XXXXXXXX"
            maxLength={8}
            className="tracking-[0.3em] font-mono text-center uppercase text-lg h-12"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button onClick={() => join.mutate()} disabled={code.trim().length !== 8 || join.isPending}>
            {join.isPending ? 'Joining…' : 'Join'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}