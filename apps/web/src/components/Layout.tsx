import { NavLink, Outlet } from 'react-router-dom';
import { Settings, BarChart3 } from 'lucide-react';
import { t } from '../i18n/fr.js';
import { cn } from '../lib/utils.js';

const link = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium',
    isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-200',
  );

export function Layout() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div>
            <h1 className="text-lg font-bold leading-tight">{t.app.title}</h1>
            <p className="text-xs text-slate-500">{t.app.subtitle}</p>
          </div>
          <nav className="flex gap-1" aria-label="Navigation principale">
            <NavLink to="/" end className={link}>
              <BarChart3 className="h-4 w-4" aria-hidden /> {t.app.nav.home}
            </NavLink>
            <NavLink to="/settings" className={link}>
              <Settings className="h-4 w-4" aria-hidden /> {t.app.nav.settings}
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
