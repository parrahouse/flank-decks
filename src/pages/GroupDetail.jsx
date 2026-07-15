import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, Pencil, Trash2, Copy, RefreshCw, Users, AlertTriangle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import GroupFormDialog from '@/components/groups/GroupFormDialog';
import AssignDeckDialog from '@/components/groups/AssignDeckDialog';
import { toast } from 'sonner';

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function GroupDetail() {
  const { groupId } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  const { data: group, isLoading, isError, error } = useQuery({
    queryKey: ['group', groupId],
    queryFn: async () => {
      const res = await base44.functions.invoke('getGroupDetail', { group_id: groupId });
      const status = res?.status ?? 200;
      if (status >= 400) {
        const err = new Error(res?.data?.error || 'Group not found');
        err.status = status;
        throw err;
      }
      return res.data;
    },
    retry: false,
    enabled: !!groupId,
  });

  const isOwner = group?.role === 'owner';
  const accent = group?.accent_color || '#64748b';

  const deleteMut = useMutation({
    mutationFn: () => base44.entities.StudyGroup.delete(groupId),
    onSuccess: () => {
      qc.invalidateQueries(['my-groups']);
      toast.success('Group deleted');
      navigate('/groups');
    },
    onError: (e) => toast.error(e.message || 'Could not delete group'),
  });

  const regenMut = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('regenerateInviteCode', { group_id: groupId });
      return res.data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries(['group', groupId]);
      setRegenOpen(false);
      toast.success('Invite code regenerated');
    },
    onError: (e) => toast.error(e?.response?.data?.error || e.message || 'Could not regenerate code'),
  });

  const copyCode = () => {
    if (!group?.invite_code) return;
    navigator.clipboard?.writeText(group.invite_code);
    toast.success('Code copied');
  };

  const unassignMut = useMutation({
    mutationFn: (deck_id) =>
      base44.functions.invoke('unassignDeckFromGroup', { group_id: groupId, deck_id }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['group', groupId]);
      toast.success('Deck removed from group');
    },
    onError: (e) => toast.error(e?.response?.data?.error || e.message || 'Could not remove deck'),
  });

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-10">
        <div className="h-40 rounded-xl bg-muted animate-pulse" />
      </div>
    );
  }

  if (isError || !group) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-10">
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center">
            <Users className="w-8 h-8 text-accent-foreground" />
          </div>
          <h2 className="font-semibold text-lg">Group not found</h2>
          <p className="text-muted-foreground text-sm max-w-xs">This group may have been deleted, or you don't have access to it.</p>
          <Button asChild variant="outline" className="mt-2">
            <Link to="/groups"><ArrowLeft className="w-4 h-4" /> Back to groups</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link to="/groups" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> All groups
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-8">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-4 h-4 rounded-full mt-1 shrink-0" style={{ backgroundColor: accent }} />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight truncate" style={{ color: accent }}>{group.name}</h1>
            <span className="inline-block mt-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
              {group.group_type === 'classroom' ? 'Classroom' : 'Peer group'}
            </span>
            {group.description && <p className="text-muted-foreground text-sm mt-2">{group.description}</p>}
          </div>
        </div>
        {isOwner && (
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="icon" title="Edit group" onClick={() => setEditOpen(true)}>
              <Pencil className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" title="Delete group" className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Invite panel — owner only */}
      {isOwner && group.invite_code && (
        <div className="rounded-md border border-border bg-card p-5 mb-8">
          <h2 className="text-sm font-semibold text-foreground mb-1">Invite code</h2>
          <p className="text-xs text-muted-foreground mb-4">Share this code so people can join your group.</p>
          <div className="flex items-center gap-3">
            <code className="flex-1 font-mono tracking-[0.3em] text-2xl text-center bg-secondary rounded-md py-3 select-all">
              {group.invite_code}
            </code>
            <Button variant="outline" size="icon" title="Copy code" onClick={copyCode}>
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <div className="mt-3">
            <Button variant="ghost" className="gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => setRegenOpen(true)}>
              <RefreshCw className="w-3.5 h-3.5" /> Regenerate code
            </Button>
          </div>
        </div>
      )}

      {/* Members */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Members ({group.roster.length})</h2>
        <div className="rounded-md border border-border bg-card divide-y divide-border">
          {group.roster.map((m, i) => (
            <div key={i} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground truncate">
                    {m.display_name}{m.is_self ? ' (you)' : ''}
                  </span>
                  {(m.role === 'owner') && (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary text-primary-foreground shrink-0">
                      {group.group_type === 'classroom' ? 'Teacher' : 'Owner'}
                    </span>
                  )}
                </div>
                {isOwner && m.user_email && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{m.user_email}</p>
                )}
              </div>
              <span className="text-xs text-muted-foreground shrink-0">Joined {formatDate(m.joined)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Shared decks */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">Shared decks ({(group.assignments || []).length})</h2>
          {isOwner && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAssignOpen(true)}>
              <Plus className="w-4 h-4" /> Assign deck
            </Button>
          )}
        </div>
        {(!group.assignments || group.assignments.length === 0) ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No decks shared with this group yet.
          </div>
        ) : (
          <div className="rounded-md border border-border bg-card divide-y divide-border">
            {group.assignments.map((a) => (
              <div key={a.deck_id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground truncate">{a.deck_title}</span>
                    {a.in_library && <span className="text-[10px] font-medium uppercase tracking-wide bg-accent text-accent-foreground px-1.5 py-0.5 rounded">In library</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{a.deck_card_count} cards{a.due_date ? ` · due ${formatDate(a.due_date)}` : ''}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/study/${a.deck_id}`}>Study</Link>
                  </Button>
                  {isOwner && (
                    <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" title="Remove from group" onClick={() => unassignMut.mutate(a.deck_id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent activity */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-foreground mb-3">Recent activity</h2>
        {(!group.activity || group.activity.length === 0) ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No activity yet. Study a shared deck to get started.
          </div>
        ) : (
          <div className="rounded-md border border-border bg-card divide-y divide-border">
            {group.activity.map((act, i) => (
              <div key={i} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0 text-sm">
                  <span className="font-medium text-foreground">{act.display_name}{act.is_self ? ' (you)' : ''}</span>
                  <span className="text-muted-foreground"> studied </span>
                  <span className="font-medium text-foreground truncate">{act.deck_title}</span>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{Math.round(act.score_pct)}% · {act.card_count} cards</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assign deck dialog */}
      <AssignDeckDialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        groupId={groupId}
        assignedDeckIds={(group.assignments || []).map((a) => a.deck_id)}
      />

      {/* Edit dialog */}
      <GroupFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        group={{ group_id: group.group_id, name: group.name, description: group.description, accent_color: group.accent_color, group_type: group.group_type }}
      />

      {/* Delete dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={(o) => { if (!o) setDeleteOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{group.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the group. Members will lose access immediately. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMut.mutate()}
            >
              Delete group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Regenerate dialog */}
      <AlertDialog open={regenOpen} onOpenChange={(o) => { if (!o) setRegenOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate invite code?</AlertDialogTitle>
            <AlertDialogDescription>
              The current code will stop working immediately. Anyone you've already shared it with will need the new code.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => regenMut.mutate()} disabled={regenMut.isPending}>
              {regenMut.isPending ? 'Regenerating…' : 'Regenerate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}