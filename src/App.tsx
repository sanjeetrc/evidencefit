import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, BarChart3, Bot, Calendar, Dumbbell, Settings, ShieldAlert, User } from 'lucide-react';
import { runAudit } from './domain/engine';
import { formatDateISO } from './domain/dates';
import { proteinCsv, workoutsCsv } from './domain/csv';
import {
  STORAGE_KEY, createBlankProfile, createDemoState, createFreshState, keepLocalKey, parseState, toBackup,
} from './domain/state';
import { AiCoachSettings, AppState, Profile } from './domain/types';
import { ConfirmModal, ModalState, downloadFile } from './ui/common';
import { Draft, TodayTab } from './ui/TodayTab';
import { ProgramTab } from './ui/ProgramTab';
import { TrendsTab } from './ui/TrendsTab';
import { CoachTab } from './ui/CoachTab';
import { SettingsTab } from './ui/SettingsTab';

const DRAFT_KEY = 'evidencefit_drafts_v1';
type Tab = 'today' | 'program' | 'trends' | 'coach' | 'settings';

const safeRead = (key: string): unknown => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

function loadInitial(): { state: AppState | null; corrupt: boolean } {
  const raw = safeRead(STORAGE_KEY);
  if (raw === null) {
    // Distinguish "nothing saved" from "saved but unreadable".
    let present = false;
    try { present = localStorage.getItem(STORAGE_KEY) !== null; } catch { /* storage blocked */ }
    return { state: null, corrupt: present };
  }
  const r = parseState(raw);
  return r.ok ? { state: r.state, corrupt: false } : { state: null, corrupt: true };
}

export default function App() {
  const initial = useMemo(loadInitial, []);
  const [state, setState] = useState<AppState | null>(initial.state);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => (safeRead(DRAFT_KEY) as Record<string, Draft>) ?? {});
  const [tab, setTab] = useState<Tab>('today');
  const [toast, setToast] = useState<{ message: string; tone: 'emerald' | 'amber' } | null>(null);
  const [modal, setModal] = useState<ModalState>({ open: false });
  const [prefillSwap, setPrefillSwap] = useState<{ exercise: string; pain: number; site?: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [storageInfo, setStorageInfo] = useState('Stored on this device');
  const toastTimer = useRef<number>();

  const showToast = useCallback((message: string, tone: 'emerald' | 'amber' = 'emerald') => {
    window.clearTimeout(toastTimer.current);
    setToast({ message, tone });
    toastTimer.current = window.setTimeout(() => setToast(null), 3500);
  }, []);
  const closeModal = useCallback(() => setModal({ open: false }), []);
  const confirm = useCallback((o: Omit<ModalState, 'open'>) => setModal({ open: true, ...o }), []);

  // Persist. A failed write is surfaced, never swallowed: silent loss is the worst outcome here.
  useEffect(() => {
    if (!state) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setSaveError(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Storage unavailable');
    }
  }, [state]);
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts)); } catch { /* drafts are a convenience */ }
  }, [drafts]);

  // Ask the browser not to evict our data under storage pressure.
  useEffect(() => {
    (async () => {
      try {
        const persisted = (await navigator.storage?.persisted?.()) || (await navigator.storage?.persist?.());
        setStorageInfo(persisted ? 'Stored on this device (protected from automatic clean-up)' : 'Stored on this device. Install to the home screen to protect it from automatic clean-up.');
      } catch { /* unsupported */ }
    })();
  }, []);

  const profile: Profile | null = state ? state.profiles.find((p) => p.id === state.activeProfileId) ?? state.profiles[0] : null;
  const audit = useMemo(() => (profile ? runAudit(profile) : null), [profile]);

  const updateProfileById = useCallback((id: string, fn: (p: Profile) => Partial<Profile>) => {
    setState((prev) => prev && { ...prev, profiles: prev.profiles.map((p) => (p.id === id ? { ...p, ...fn(p) } : p)) });
  }, []);
  const updateProfile = useCallback((fn: (p: Profile) => Partial<Profile>) => profile && updateProfileById(profile.id, fn), [profile, updateProfileById]);
  const setDraft = useCallback((d: Draft) => profile && setDrafts((prev) => ({ ...prev, [profile.id]: d })), [profile]);

  // ---------------------------------------------------------------- first run
  if (!state || !profile || !audit) {
    return <Welcome corrupt={initial.corrupt} onStart={(name, age, kg) => setState(createFreshState(name, age, kg))} onDemo={() => setState(createDemoState())} />;
  }

  const backupDue = profile.workouts.length >= 3 && (!state.lastBackupAt || Date.now() - Date.parse(state.lastBackupAt) > 14 * 86_400_000);

  const exportJSON = () => {
    downloadFile(JSON.stringify(toBackup(state), null, 2), `evidencefit-backup-${formatDateISO()}.json`, 'application/json');
    setState({ ...state, lastBackupAt: new Date().toISOString() });
    showToast('Backup downloaded. Keep it somewhere safe, such as Google Drive.');
  };

  const importJSON = (file: File) => {
    if (file.size > 10_000_000) return showToast('That file is too large to be a backup.', 'amber');
    const reader = new FileReader();
    reader.onload = () => {
      let raw: unknown;
      try { raw = JSON.parse(String(reader.result)); } catch { return showToast('Could not read that file. Choose an EvidenceFit backup (.json).', 'amber'); }
      const r = parseState(raw);
      if (!r.ok) return showToast(r.error, 'amber');
      const sessions = r.state.profiles.reduce((s, p) => s + p.workouts.length, 0);
      confirm({
        title: 'Replace data with this backup?',
        message: `"${file.name}" has ${r.state.profiles.length} person(s) and ${sessions} session(s). Everything currently on this phone will be replaced. Download a backup of the current data first if you might need it.`,
        confirmLabel: 'Restore',
        danger: true,
        onConfirm: () => { setState(keepLocalKey(r.state, state)); setDrafts({}); showToast('Backup restored.'); },
      });
    };
    reader.readAsText(file);
  };

  const exportCsv = (kind: 'workouts' | 'protein') => {
    const slug = profile.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    downloadFile(kind === 'workouts' ? workoutsCsv(profile) : proteinCsv(profile), `evidencefit-${kind}-${slug}-${formatDateISO()}.csv`, 'text/csv');
  };

  const startFresh = (title: string, message: string) =>
    confirm({ title, message, confirmLabel: 'Erase and start fresh', danger: true,
      onConfirm: () => { setState({ ...createFreshState(), aiCoach: state.aiCoach }); setDrafts({}); setTab('settings'); showToast('Started fresh. Fill in your health screen first.'); } });

  const nav: { id: Tab; label: string; Icon: typeof Dumbbell }[] = [
    { id: 'today', label: 'Today', Icon: Dumbbell },
    { id: 'program', label: 'Plan', Icon: Calendar },
    { id: 'trends', label: 'Progress', Icon: BarChart3 },
    { id: 'coach', label: 'Coach', Icon: Bot },
    { id: 'settings', label: 'Settings', Icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col md:flex-row">
      <aside className="hidden md:flex md:flex-col md:w-60 bg-white border-r border-slate-200 shrink-0 sticky top-0 h-screen">
        <div className="p-5 flex items-center gap-2 font-extrabold text-lg"><Activity className="w-6 h-6 text-emerald-700" aria-hidden /> EvidenceFit</div>
        <nav className="flex-1 p-3 space-y-1" aria-label="Main">
          {nav.map(({ id, label, Icon }) => (
            <button key={id} type="button" aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}
              className={`w-full flex items-center gap-3 px-3 min-h-[44px] rounded-xl text-sm font-semibold ${tab === id ? 'bg-emerald-50 text-emerald-900' : 'text-slate-700 hover:bg-slate-50'}`}>
              <Icon className="w-5 h-5" aria-hidden /> {label}
              {id === 'trends' && audit.deloadRecommended && <span className="ml-auto w-2.5 h-2.5 rounded-full bg-amber-500" aria-label="deload advised" />}
            </button>
          ))}
        </nav>
        <p className="p-4 text-xs text-slate-600">Private: data stays on this device</p>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col pb-24 md:pb-0">
        <header className="sticky top-0 z-30 bg-white/95 border-b border-slate-200 px-4 py-3 flex items-center justify-between md:justify-end">
          <span className="md:hidden flex items-center gap-2 font-extrabold"><Activity className="w-5 h-5 text-emerald-700" aria-hidden /> EvidenceFit</span>
          {state.profiles.length > 1 ? (
            <label className="flex items-center gap-1.5 text-sm font-semibold">
              <User className="w-4 h-4 text-emerald-700" aria-hidden />
              <span className="sr-only">Person</span>
              <select value={profile.id} onChange={(e) => setState({ ...state, activeProfileId: e.target.value })} className="min-h-[40px] px-2 rounded-lg border border-slate-300 bg-white">
                {state.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          ) : (
            <button type="button" onClick={() => setTab('settings')} className="flex items-center gap-1.5 text-sm font-semibold min-h-[40px]"><User className="w-4 h-4 text-emerald-700" aria-hidden /> {profile.name}</button>
          )}
        </header>

        {saveError && (
          <div role="alert" className="mx-4 mt-4 p-3 rounded-xl bg-rose-100 border border-rose-300 text-sm text-rose-950">
            <strong>Changes are not being saved</strong> ({saveError}). Download a backup from Settings now, then free some space or leave private browsing.
          </div>
        )}
        {audit.screening.level !== 'proceed' && (
          <div role="status" className={`mx-4 mt-4 p-3 rounded-xl border text-sm flex items-start gap-2 ${audit.screening.level === 'stop' ? 'bg-rose-50 border-rose-300 text-rose-950' : 'bg-amber-50 border-amber-300 text-amber-950'}`}>
            <ShieldAlert className="w-5 h-5 shrink-0" aria-hidden /><span><strong>{audit.screening.headline}.</strong> {audit.screening.detail}</span>
          </div>
        )}

        <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-5 sm:px-6">
          {tab === 'today' && (
            <TodayTab profile={profile} audit={audit} draft={drafts[profile.id]} setDraft={setDraft} updateProfile={updateProfile}
              onAskSwap={(exercise, pain, site) => { setPrefillSwap({ exercise, pain, site }); setTab('coach'); }}
              showToast={showToast} confirm={confirm} backupDue={backupDue} goToSettings={() => setTab('settings')} />
          )}
          {tab === 'program' && <ProgramTab profile={profile} audit={audit} updateProfile={updateProfile} showToast={showToast} confirm={confirm} />}
          {tab === 'trends' && (
            <TrendsTab profile={profile} audit={audit} isDemoLoaded={state.isDemoLoaded} updateProfile={updateProfile} confirm={confirm}
              onClearDemo={() => startFresh('Clear demo data?', 'The demo person and their logs will be removed.')} />
          )}
          {tab === 'coach' && (
            <CoachTab profile={profile} audit={audit} settings={state.aiCoach} prefillSwap={prefillSwap} clearPrefill={() => setPrefillSwap(null)}
              updateProfileById={updateProfileById} goToSettings={() => setTab('settings')} />
          )}
          {tab === 'settings' && (
            <SettingsTab state={state} profile={profile} audit={audit} updateProfile={updateProfile} storageInfo={storageInfo}
              onSelectProfile={(id) => setState({ ...state, activeProfileId: id })}
              onAddProfile={(name, age, kg) => { const p = createBlankProfile(name, age, kg); setState({ ...state, profiles: [...state.profiles, p], activeProfileId: p.id }); showToast(`Added ${name}. Fill in the health screen.`); }}
              onDeleteProfile={(id) => {
                const t = state.profiles.find((p) => p.id === id);
                confirm({ title: `Delete ${t?.name ?? 'this person'}?`, message: 'All their sessions, protein logs and test results will be removed from this phone.', confirmLabel: 'Delete', danger: true,
                  onConfirm: () => setState((prev) => {
                    if (!prev) return prev;
                    const rest = prev.profiles.filter((p) => p.id !== id);
                    return { ...prev, profiles: rest, activeProfileId: prev.activeProfileId === id ? rest[0].id : prev.activeProfileId };
                  }) });
              }}
              onUpdateAi={(patch: Partial<AiCoachSettings>) => setState({ ...state, aiCoach: { ...state.aiCoach, ...patch } })}
              onExportJSON={exportJSON} onImportJSON={importJSON} onExportCsv={exportCsv}
              onLoadDemo={() => confirm({ title: 'Load demo data?', message: 'Your current data will be replaced by a demo person. Download a backup first if you need it.', confirmLabel: 'Load demo', danger: true,
                onConfirm: () => { setState({ ...createDemoState(), aiCoach: state.aiCoach }); setDrafts({}); } })}
              onResetAll={() => startFresh('Erase everything?', 'All people, sessions, protein logs and test results on this phone will be permanently deleted.')} />
          )}
        </main>
      </div>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 grid grid-cols-5 pb-[env(safe-area-inset-bottom)]" aria-label="Main">
        {nav.map(({ id, label, Icon }) => (
          <button key={id} type="button" aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}
            className={`relative flex flex-col items-center justify-center min-h-[60px] text-xs font-semibold ${tab === id ? 'text-emerald-800 bg-emerald-50' : 'text-slate-600'}`}>
            <Icon className="w-5 h-5" aria-hidden />{label}
            {id === 'trends' && audit.deloadRecommended && <span className="absolute top-2 right-[30%] w-2.5 h-2.5 rounded-full bg-amber-500" aria-label="deload advised" />}
          </button>
        ))}
      </nav>

      {toast && (
        <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-24 md:bottom-6 inset-x-4 md:left-auto md:right-6 md:w-96 z-50">
          <div className={`px-4 py-3 rounded-xl text-sm font-semibold text-white shadow-lg ${toast.tone === 'amber' ? 'bg-amber-700' : 'bg-slate-900'}`}>{toast.message}</div>
        </div>
      )}
      <ConfirmModal state={modal} onClose={closeModal} />
    </div>
  );
}

function Welcome({ corrupt, onStart, onDemo }: { corrupt: boolean; onStart: (n: string, a: number, kg: number) => void; onDemo: () => void }) {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [kg, setKg] = useState('');
  const valid = name.trim() && Number(age) >= 14 && Number(age) <= 105 && Number(kg) >= 30 && Number(kg) <= 250;
  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold"><Activity className="w-7 h-7 text-emerald-700" aria-hidden /> EvidenceFit</h1>
        <p className="mt-2 text-sm text-slate-700">An exercise and protein companion built on sports-science consensus. Your data stays on this phone.</p>
        {corrupt && <p role="alert" className="mt-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-900">Saved data on this device could not be read. Start fresh, then restore from a backup in Settings if you have one.</p>}
        <form className="mt-5 space-y-3" onSubmit={(e) => { e.preventDefault(); if (valid) onStart(name.trim(), Number(age), Number(kg)); }}>
          <label className="block text-sm font-semibold">Your name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="mt-1 w-full min-h-[44px] px-3 rounded-lg border border-slate-300" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold">Age<input type="number" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} className="mt-1 w-full min-h-[44px] px-3 rounded-lg border border-slate-300" /></label>
            <label className="block text-sm font-semibold">Weight (kg)<input type="number" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} className="mt-1 w-full min-h-[44px] px-3 rounded-lg border border-slate-300" /></label>
          </div>
          <button type="submit" disabled={!valid} className="w-full min-h-[48px] rounded-xl bg-emerald-700 text-white font-bold disabled:opacity-40">Start</button>
        </form>
        <button type="button" onClick={onDemo} className="mt-3 w-full min-h-[44px] rounded-xl border border-slate-300 text-sm font-semibold">Look around with demo data first</button>
        <p className="mt-4 text-xs text-slate-600">Next step after starting: fill in the health screen in Settings. This app gives general guidance and does not replace your doctor.</p>
      </div>
    </main>
  );
}
