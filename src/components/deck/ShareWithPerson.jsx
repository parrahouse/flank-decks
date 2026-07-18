import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Search, UserPlus, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function ShareWithPerson({ deck }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [sharing, setSharing] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);

  const runSearch = async () => {
    const q = query.trim();
    if (!q) { setResults([]); setHasSearched(false); return; }
    setSearching(true);
    setHasSearched(true);
    try {
      const res = await base44.functions.invoke('searchUsers', { query: q });
      setResults(res.data?.users || []);
    } catch (e) {
      toast.error(e?.response?.data?.error || e?.message || 'Search failed');
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleShare = async (u) => {
    setSharing(u.email);
    try {
      const res = await base44.functions.invoke('directShareDeck', {
        deck_id: deck.id,
        recipient_email: u.email,
      });
      const data = res.data || {};
      const label = u.username ? `@${u.username}` : (u.full_name || u.email);
      if (data.subscribed) toast.success(`Added to ${label}'s library`);
      else toast(`${label} already has this deck`);
    } catch (e) {
      toast.error(e?.response?.data?.error || e?.message || 'Could not share');
    } finally {
      setSharing(null);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Share with a person</p>
        <p className="text-xs text-muted-foreground">
          Search registered users by email or username — the deck is added straight to their library.
        </p>
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="Email or username"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
        />
        <Button variant="outline" size="icon" onClick={runSearch} disabled={searching}>
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </Button>
      </div>
      {hasSearched && !searching && results.length === 0 && (
        <p className="text-xs text-muted-foreground">No matching users found.</p>
      )}
      {results.length > 0 && (
        <div className="border border-border rounded-md divide-y divide-border max-h-52 overflow-y-auto">
          {results.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {u.username ? `@${u.username}` : (u.full_name || u.email)}
                </p>
                <p className="text-xs text-muted-foreground truncate">{u.email}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleShare(u)}
                disabled={sharing === u.email}
                className="shrink-0"
              >
                {sharing === u.email ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                <span className="ml-1.5">Send</span>
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}