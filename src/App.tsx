/**
 * EvidenceFit (Log-First Circuit Edition): standalone Vite build.
 * Data is stored only in this browser (localStorage). Download a backup from Settings.
 *
 * App shell only: persistence, tabs, navigation, toast. Features live in src/features/*.
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Activity, BarChart3, Bot, Dumbbell, Settings, User } from 'lucide-react';
import ErrorBoundary from './components/ErrorBoundary';
import Welcome from './components/Welcome';
import BackupReminder from './features/today/BackupReminder';
import TodayTab from './features/today/TodayTab';
import { useToast } from './hooks/useToast';
import { DriveSyncContext, useDriveSync } from './sync/useDriveSync';
import { createFreshState, loadState, normalizeState, STORAGE_KEY } from './lib/storage';
import type { AppState, Profile, UpdateProfile } from './types';

// Loaded on first open so the first screen is small (Progress carries Recharts, the biggest dependency).
const loadProgress = () => import('./features/progress/ProgressTab');
const loadCoach = () => import('./features/coach/CoachTab');
const loadSettings = () => import('./features/settings/SettingsTab');
const ProgressTab = lazy(loadProgress);
const CoachTab = lazy(loadCoach);
const SettingsTab = lazy(loadSettings);
/**
 * Fetch the other tabs shortly after start-up, once the first screen is shown. That way they open instantly,
 * and the service worker has them cached even if the phone goes offline before they were ever opened.
 */
const warmTabs = () => { void loadProgress().catch(() => {}); void loadCoach().catch(() => {}); void loadSettings().catch(() => {}); };
const TabLoading = () => <p className="py-10 text-center text-base text-slate-600" role="status">Loading…</p>;

type Tab = 'today' | 'progress' | 'coach' | 'settings';

const NAV = [
  { id: 'today' as const, label: 'Today', Icon: Dumbbell },
  { id: 'progress' as const, label: 'Progress', Icon: BarChart3 },
  { id: 'coach' as const, label: 'Coach', Icon: Bot },
  { id: 'settings' as const, label: 'Settings', Icon: Settings },
];

function EvidenceFitApp() {
  const [state, setState] = useState<AppState | null>(loadState);
  const [tab, setTab] = useState<Tab>('today');
  const { toast, showToast } = useToast();
  const drive = useDriveSync(state, setState);

  useEffect(() => {
    const t = setTimeout(warmTabs, 2500);
    return () => clearTimeout(t);
  }, []);

  // Persist on every change; surface (once) if the browser refuses to save.
  const saveFailedRef = useRef(false);
  useEffect(() => {
    if (!state) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      saveFailedRef.current = false;
    } catch {
      if (!saveFailedRef.current) {
        saveFailedRef.current = true;
        showToast('⚠ Could not save — storage is full or blocked. Download a backup now (Settings).');
      }
    }
  }, [state, showToast]);

  // Another open tab saved: adopt its data instead of overwriting it on our next save.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const next = normalizeState(JSON.parse(e.newValue));
        if (next) setState(next);
      } catch { /* ignore malformed */ }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const updateProfile: UpdateProfile = useCallback((fn: (p: Profile) => Partial<Profile>) => {
    setState((prev) => {
      if (!prev) return prev;
      return { ...prev, profiles: prev.profiles.map((p) => (p.id === prev.activeProfileId ? { ...p, ...fn(p) } : p)) };
    });
  }, []);

  const profile = state ? state.profiles.find((p) => p.id === state.activeProfileId) ?? state.profiles[0] : null;

  if (!state || !profile) {
    return <Welcome onStart={(name, age, kg) => setState(createFreshState(name, age, kg))} />;
  }

  return (
    <DriveSyncContext.Provider value={drive}>
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col md:flex-row">
      <aside className="hidden md:flex md:flex-col md:w-56 bg-white border-r border-slate-200 shrink-0 sticky top-0 h-screen">
        <div className="p-5 flex items-center gap-2 font-extrabold text-lg"><Activity className="w-6 h-6 text-emerald-700" /> EvidenceFit</div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(({ id, label, Icon }) => (
            <button key={id} type="button" onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}
              className={`w-full flex items-center gap-3 px-3 min-h-[44px] rounded-xl text-sm font-semibold ${tab === id ? 'bg-emerald-50 text-emerald-900' : 'text-slate-700 hover:bg-slate-50'}`}>
              <Icon className="w-5 h-5" /> {label}
            </button>
          ))}
        </nav>
        <p className="p-4 text-xs text-slate-500">Log-first · Private on this device</p>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col pb-24 md:pb-0">
        <header className="sticky top-0 z-30 bg-white/95 border-b border-slate-200 px-4 py-3 flex items-center justify-between md:justify-end">
          <span className="md:hidden flex items-center gap-2 font-extrabold"><Activity className="w-5 h-5 text-emerald-700" /> EvidenceFit</span>
          <button type="button" onClick={() => setTab('settings')} className="flex items-center gap-1.5 text-sm font-semibold"><User className="w-4 h-4 text-emerald-700" /> {profile.name} ({profile.weightKg} kg)</button>
        </header>

        <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-5">
          {/* Today stays mounted so typed text, an active mic and session details survive tab switches. */}
          <div hidden={tab !== 'today'} className="space-y-5">
            <BackupReminder state={state} setState={setState} showToast={showToast} />
            <TodayTab profile={profile} aiCoach={state.aiCoach} updateProfile={updateProfile} showToast={showToast} />
          </div>
          <Suspense fallback={<TabLoading />}>
            {tab === 'progress' && <div className="space-y-5"><ProgressTab profile={profile} updateProfile={updateProfile} /></div>}
            {tab === 'coach' && <div className="space-y-5"><CoachTab profile={profile} aiCoach={state.aiCoach} updateProfile={updateProfile} showToast={showToast} /></div>}
            {tab === 'settings' && (
              <div className="space-y-5">
                <SettingsTab state={state} setState={setState} profile={profile} updateProfile={updateProfile} showToast={showToast} />
              </div>
            )}
          </Suspense>
        </main>
      </div>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 grid grid-cols-4 pb-[env(safe-area-inset-bottom)]">
        {NAV.map(({ id, label, Icon }) => (
          <button key={id} type="button" onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}
            className={`flex flex-col items-center justify-center min-h-[60px] text-xs font-semibold ${tab === id ? 'text-emerald-800 bg-emerald-50' : 'text-slate-600'}`}>
            <Icon className="w-5 h-5" />{label}
          </button>
        ))}
      </nav>

      {toast && (
        <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-24 md:bottom-6 inset-x-3 md:left-auto md:right-6 md:w-[28rem] z-50">
          <div className="px-4 py-3.5 rounded-xl text-base sm:text-lg leading-snug font-semibold text-white bg-slate-900 shadow-2xl ring-2 ring-emerald-400">{toast}</div>
        </div>
      )}
    </div>
    </DriveSyncContext.Provider>
  );
}

// StrictMode is applied once, in main.tsx.
export default function App() {
  return (
    <ErrorBoundary>
      <EvidenceFitApp />
    </ErrorBoundary>
  );
}
