import { Link, Outlet, useLocation } from 'react-router-dom';
import { LayoutGrid, Trophy, Puzzle, UserCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';

export default function Layout() {
  const location = useLocation();
  const { user } = useAuth();

  const nav = [
    { label: 'My Decks', path: '/', icon: LayoutGrid },
    { label: 'QuizMaster', path: '/quiz', icon: Trophy },
    ...(user?.role === 'admin' ? [{ label: 'Extras', path: '/admin/extras', icon: Puzzle }] : []),
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="text-lg font-semibold tracking-tight text-foreground">
            Swabbie
          </Link>
          <nav className="flex items-center gap-1">
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
            <Link
              to="/profile"
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                location.pathname === '/profile'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              )}
            >
              <UserCircle className="w-4 h-4" />
              Profile
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}