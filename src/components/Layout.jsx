import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { LayoutGrid, Trophy, Puzzle, UserCircle, FolderOpen, Users, Compass, Images, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';

export default function Layout() {
  const location = useLocation();
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav = [
    { label: 'My Decks', path: '/', icon: LayoutGrid },
    { label: 'Discover', path: '/discover', icon: Compass },
    { label: 'Image Pool', path: '/pool', icon: Images },
    { label: 'Collections', path: '/collections', icon: FolderOpen },
    { label: 'Groups', path: '/groups', icon: Users },
    { label: 'QuizMaster', path: '/quiz', icon: Trophy },
    ...(user?.role === 'admin' ? [{ label: 'Extras', path: '/admin/extras', icon: Puzzle }] : []),
    { label: 'Profile', path: '/profile', icon: UserCircle },
  ];

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="text-lg font-semibold tracking-tight text-foreground">
            Swabbie
          </Link>
          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {nav.map(({ label, path, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  location.pathname === path
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}
          </nav>
          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileOpen(v => !v)}
            className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
        {/* Mobile menu panel */}
        {mobileOpen && (
          <nav className="md:hidden border-t border-border bg-card">
            <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col gap-1">
              {nav.map(({ label, path, icon: Icon }) => (
                <Link
                  key={path}
                  to={path}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    location.pathname === path
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              ))}
            </div>
          </nav>
        )}
      </header>
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}