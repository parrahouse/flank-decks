import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Users, Plus, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import GroupFormDialog from '@/components/groups/GroupFormDialog';
import JoinGroupDialog from '@/components/groups/JoinGroupDialog';
import { toast } from 'sonner';

export default function Groups() {
  const [formOpen, setFormOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['my-groups'],
    queryFn: async () => {
      const res = await base44.functions.invoke('getMyGroups', {});
      return res.data;
    },
  });
  const groups = data?.groups || [];

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Groups</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Study together and keep each other accountable.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-1.5 rounded-[20px]" onClick={() => setJoinOpen(true)}>
            <LogIn className="w-4 h-4" /> Join Group
          </Button>
          <Button className="gap-1.5 rounded-[20px]" onClick={() => setFormOpen(true)}>
            <Plus className="w-4 h-4" /> New Group
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center">
            <Users className="w-8 h-8 text-accent-foreground" />
          </div>
          <h2 className="font-semibold text-lg">No groups yet</h2>
          <p className="text-muted-foreground text-sm max-w-xs">Create a study group to study together and track progress, or join one with an invite code.</p>
          <div className="flex items-center gap-2 mt-2">
            <Button className="gap-1.5" onClick={() => setFormOpen(true)}><Plus className="w-4 h-4" /> New Group</Button>
            <Button variant="outline" className="gap-1.5" onClick={() => setJoinOpen(true)}><LogIn className="w-4 h-4" /> Join Group</Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((g) => (
            <Link
              key={g.group_id}
              to={`/groups/${g.group_id}`}
              className="group bg-card border border-border rounded-md overflow-hidden flex flex-col hover:shadow-md transition-all"
            >
              <div className="h-1.5" style={{ backgroundColor: g.accent_color || '#64748b' }} />
              <div className="flex flex-col gap-2 p-4 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-foreground truncate flex-1">{g.name}</h3>
                  <span className="w-3 h-3 rounded-full shrink-0 mt-1" style={{ backgroundColor: g.accent_color || '#64748b' }} />
                </div>
                {g.description && <p className="text-xs text-muted-foreground line-clamp-2">{g.description}</p>}
                <p className="text-xs text-muted-foreground mt-1">{g.member_count} {g.member_count === 1 ? 'member' : 'members'}</p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                    {g.group_type === 'classroom' ? 'Classroom' : 'Peer group'}
                  </span>
                  {g.role === 'owner' && (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
                      Owner
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <GroupFormDialog open={formOpen} onClose={() => setFormOpen(false)} />
      <JoinGroupDialog open={joinOpen} onClose={() => setJoinOpen(false)} />
    </div>
  );
}