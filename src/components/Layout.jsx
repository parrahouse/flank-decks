import { useEffect, useState, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { LayoutGrid, Trophy, Puzzle, UserCircle, FolderOpen, Users, Compass, Images, Menu, X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';

export default function Layout() {
  const location = useLocation();
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isStudyMode = location.pathname.startsWith('/study/');
  const [navRevealed, setNavRevealed] = useState(false);
  const hideTimerRef = useRef(null);

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
  useEffect(() => { if (!isStudyMode) setNavRevealed(false); }, [isStudyMode]);
  useEffect(() => () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); }, []);

  const revealNav = () => {
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
    setNavRevealed(true);
  };
  const scheduleHideNav = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setNavRevealed(false), 250);
  };

  const headerInner = (
    <>
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
    </>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {isStudyMode && (
        <>
          {/* Desktop hover trigger strip — invisible zone at the very top */}
          <div
            className="fixed top-0 left-0 right-0 h-2.5 z-30 hidden md:block"
            onMouseEnter={revealNav}
          />
          {/* Mobile tap toggle */}
          <button
            type="button"
            onClick={() => setNavRevealed(v => !v)}
            className="md:hidden fixed top-1.5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 rounded-full bg-card border border-border shadow-sm px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            aria-label={navRevealed ? 'Hide navigation' : 'Show navigation'}
          >
            <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', navRevealed && 'rotate-180')} />
          </button>
        </>
      )}
      <header
        onMouseEnter={isStudyMode ? revealNav : undefined}
        onMouseLeave={isStudyMode ? scheduleHideNav : undefined}
        className={cn(
          'border-b border-border bg-card',
          isStudyMode
            ? cn('fixed top-0 left-0 right-0 z-40 transition-all duration-300 ease-out',
                navRevealed ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none')
            : 'sticky top-0 z-40'
        )}
      >
        {headerInner}
      </header>
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}