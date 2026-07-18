import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';
import { User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export default function Profile() {
  const { data: currentUser, refetch } = useQuery({
    queryKey: ['me'],
    queryFn: () => base44.auth.me(),
  });

  const [layoutMode, setLayoutMode] = useState(() => currentUser?.default_layout_mode || 'auto');
  const [handedness, setHandedness] = useState(() => currentUser?.default_handedness || 'left');
  const [saving, setSaving] = useState(false);
  const [username, setUsernameState] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);

  useEffect(() => {
    setUsernameState(currentUser?.username || '');
  }, [currentUser?.username]);

  const handleSaveUsername = async () => {
    const clean = username.trim();
    if (!clean) { toast.error('Username is required'); return; }
    setSavingUsername(true);
    try {
      await base44.functions.invoke('setUsername', { username: clean });
      await refetch();
      toast.success('Username saved');
    } catch (e) {
      toast.error(e?.response?.data?.error || e?.message || 'Could not save username');
    } finally {
      setSavingUsername(false);
    }
  };

  // Sync state once user data loads
  const defaultLayoutMode = currentUser?.default_layout_mode || 'auto';
  const defaultHandedness = currentUser?.default_handedness || 'left';

  const handleSave = async () => {
    setSaving(true);
    await base44.auth.updateMe({ default_layout_mode: layoutMode, default_handedness: handedness });
    await refetch();
    setSaving(false);
    toast.success('Preferences saved');
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
          <User className="w-5 h-5 text-accent-foreground" />
        </div>
        <div>
          <h1 className="font-semibold text-lg">{currentUser?.full_name || 'Profile'}</h1>
          <p className="text-xs text-muted-foreground">{currentUser?.email}</p>
        </div>
      </div>

      <div className="border border-border rounded-lg divide-y divide-border">
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold mb-1">Username</h2>
          <p className="text-xs text-muted-foreground mb-3">A unique name others can search to share decks with you.</p>
          <div className="flex gap-2">
            <Input
              value={username}
              onChange={(e) => setUsernameState(e.target.value)}
              placeholder="Choose a username"
              className="flex-1"
            />
            <Button size="sm" onClick={handleSaveUsername} disabled={savingUsername}>
              {savingUsername ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold mb-1">Study Session Defaults</h2>
          <p className="text-xs text-muted-foreground mb-5">These are used as starting values each time you begin a new session. You can still override them per-session.</p>

          {/* Layout mode */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-medium">Card layout</p>
              <p className="text-xs text-muted-foreground">How cards are displayed during study</p>
            </div>
            <div className="flex gap-1">
              {['auto', 'vertical', 'horizontal'].map((mode) => (
                <button
                  key={mode}
                  onClick={() => setLayoutMode(mode)}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs font-medium border transition-colors',
                    layoutMode === mode
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  )}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Handedness */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Image position</p>
              <p className="text-xs text-muted-foreground">Which side the image appears (horizontal layout only)</p>
            </div>
            <div className="flex gap-1">
              {[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setHandedness(value)}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs font-medium border transition-colors',
                    handedness === value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-3 flex justify-end bg-muted/30">
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Defaults'}
          </Button>
        </div>
      </div>
    </div>
  );
}