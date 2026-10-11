import { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Database, UploadCloud, Table2, BarChart3, LayoutPanelTop,
  Sparkles, FileText, Settings, PanelLeftClose, PanelLeftOpen, Search, Sun, Moon, LogOut, Menu, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { cn } from '../lib/utils.js';
import { api } from '../services/api.js';

export const NAV = [
  { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/app/datasets', label: 'My Datasets', icon: Database },
  { to: '/app/upload', label: 'Upload Data', icon: UploadCloud },
  { to: '/app/explorer', label: 'Data Explorer', icon: Table2 },
  { to: '/app/charts', label: 'Charts & Visualization', icon: BarChart3 },
  { to: '/app/dashboards', label: 'Dashboard Builder', icon: LayoutPanelTop },
  { to: '/app/insights', label: 'AI Insights', icon: Sparkles },
  { to: '/app/reports', label: 'Saved Reports', icon: FileText },
  { to: '/app/settings', label: 'Settings', icon: Settings },
];

function Brand({ collapsed }) {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-indigo-600 text-white shadow-sm">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>
      </div>
      {!collapsed && <span className="truncate text-base font-semibold tracking-tight">DataPulse</span>}
    </div>
  );
}

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('datapulse.collapsed') === '1');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => localStorage.setItem('datapulse.collapsed', collapsed ? '1' : '0'), [collapsed]);
  useEffect(() => setMobileOpen(false), [location.pathname]);

  // Global search across the user's datasets and dashboards (server-side ownership enforced)
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) return setResults([]);
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const [ds, db] = await Promise.all([api.listDatasets(1, 100), api.listDashboards()]);
        if (cancelled) return;
        const hits = [
          ...ds.items.filter((d) => d.name.toLowerCase().includes(q)).map((d) => ({ label: d.name, sub: 'Dataset', to: `/app/explorer/${d.id}` })),
          ...db.items.filter((d) => d.name.toLowerCase().includes(q)).map((d) => ({ label: d.name, sub: 'Dashboard', to: `/app/dashboards/${d.id}` })),
        ].slice(0, 8);
        setResults(hits);
      } catch {
        setResults([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-3" aria-label="Main navigation">
      <div className="mb-4 flex items-center justify-between px-1 pt-1">
        <Brand collapsed={collapsed} />
        <button onClick={() => setMobileOpen(false)} className="rounded-md p-1 text-slate-500 lg:hidden" aria-label="Close menu">
          <X className="h-5 w-5" />
        </button>
      </div>
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          title={collapsed ? label : undefined}
          className={({ isActive }) =>
            cn(
              'group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/70',
              collapsed && 'justify-center px-2'
            )
          }
        >
          <Icon className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && <span className="truncate">{label}</span>}
        </NavLink>
      ))}
      <div className="mt-auto hidden lg:block">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden shrink-0 border-r border-slate-200 bg-white transition-[width] duration-200 dark:border-slate-800 dark:bg-slate-900 lg:block',
          collapsed ? 'w-[72px]' : 'w-64'
        )}
      >
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 animate-slide-in bg-white shadow-xl dark:bg-slate-900">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80 sm:px-6">
          <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search datasets and dashboards..."
              aria-label="Search"
              className="input h-10 w-full pl-9"
            />
            {results.length > 0 && (
              <div className="absolute left-0 right-0 top-12 z-30 overflow-hidden rounded-xl border bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
                {results.map((r) => (
                  <button
                    key={r.to}
                    onClick={() => {
                      setQuery('');
                      navigate(r.to);
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <span className="truncate">{r.label}</span>
                    <span className="ml-3 text-xs text-slate-400">{r.sub}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={toggle} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" aria-label="Toggle theme">
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <div className="relative">
              <button onClick={() => setMenuOpen((o) => !o)} className="flex items-center gap-2 rounded-xl p-1.5 pr-3 hover:bg-slate-100 dark:hover:bg-slate-800" aria-haspopup="menu" aria-expanded={menuOpen}>
                <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                  {(user?.name || '?').charAt(0).toUpperCase()}
                </span>
                <span className="hidden max-w-[140px] truncate text-sm font-medium sm:block">{user?.name}</span>
              </button>
              {menuOpen && (
                <div role="menu" className="absolute right-0 top-12 z-30 w-56 animate-fade-in rounded-xl border bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                  <div className="px-3 py-2">
                    <p className="truncate text-sm font-medium">{user?.name}</p>
                    <p className="truncate text-xs text-slate-500">{user?.email}</p>
                  </div>
                  <button role="menuitem" onClick={() => { setMenuOpen(false); navigate('/app/settings'); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
                    <Settings className="h-4 w-4" /> Settings
                  </button>
                  <button role="menuitem" onClick={() => { logout(); navigate('/login'); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40">
                    <LogOut className="h-4 w-4" /> Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto max-w-[1400px] animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
