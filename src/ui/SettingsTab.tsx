import { useRef, useState } from 'react';
import { Bot, CloudDownload, Database, Download, FileSpreadsheet, ShieldAlert, ShieldCheck, Upload, User, UserPlus, Users, X } from 'lucide-react';
import { Audit } from '../domain/engine';
import { CONDITION_ITEMS, MEDICATION_ITEMS, RED_FLAG_ITEMS } from '../domain/reference';
import { recommendedProteinTarget } from '../domain/state';
import { AiCoachSettings, AppState, Profile } from '../domain/types';
import { Card, CardHeader, NumInput } from './common';
import { getClientId, isValidClientId, saveClientId } from '../drive/googleDrive';

interface Props {
  state: AppState;
  profile: Profile;
  audit: Audit;
  updateProfile: (fn: (p: Profile) => Partial<Profile>) => void;
  onSelectProfile: (id: string) => void;
  onAddProfile: (name: string, age: number, weightKg: number) => void;
  onDeleteProfile: (id: string) => void;
  onUpdateAi: (patch: Partial<AiCoachSettings>) => void;
  onExportJSON: () => void;
  onImportJSON: (f: File) => void;
  onRestoreDrive: () => void;
  driveBusy: boolean;
  onExportCsv: (kind: 'workouts' | 'protein') => void;
  onLoadDemo: () => void;
  onResetAll: () => void;
  storageInfo: string;
}

const Toggle = ({ checked, onChange, label, note, tone }: { checked: boolean; onChange: () => void; label: string; note?: string; tone: 'rose' | 'amber' }) => (
  <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer ${checked ? (tone === 'rose' ? 'bg-rose-50 border-rose-400' : 'bg-amber-50 border-amber-400') : 'bg-white border-slate-200'}`}>
    <input type="checkbox" checked={checked} onChange={onChange} className="mt-1 w-5 h-5 accent-emerald-700" />
    <span className="text-sm"><span className="font-semibold text-slate-900">{label}</span>{note && <span className="block text-slate-600">{note}</span>}</span>
  </label>
);

/** One-time setup: paste the Google OAuth client ID (public, not a secret). Hidden once built in. */
function DriveSetup() {
  const builtIn = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);
  const [value, setValue] = useState(() => getClientId());
  const [saved, setSaved] = useState(() => isValidClientId(getClientId()));
  if (builtIn) return null;
  return (
    <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm" open={!saved}>
      <summary className="font-semibold text-slate-800 cursor-pointer min-h-[32px]">Set up Google Drive (one time) {saved ? '· done' : ''}</summary>
      <p className="mt-2 text-slate-700">Paste the Google client ID ending in <code>.apps.googleusercontent.com</code>. It is not a password; it only lets this page ask Google for permission to read your Drive.</p>
      <div className="mt-2 flex gap-2">
        <input aria-label="Google client ID" value={value} onChange={(e) => setValue(e.target.value)} placeholder="1234…apps.googleusercontent.com"
          className="flex-1 min-w-0 min-h-[44px] px-3 rounded-lg border border-slate-300 bg-white text-sm" />
        <button type="button" className="shrink-0 px-4 min-h-[44px] rounded-lg bg-slate-900 text-white font-semibold disabled:opacity-50" disabled={!isValidClientId(value)}
          onClick={() => { saveClientId(value.trim()); setSaved(true); }}>Save</button>
      </div>
      {value && !isValidClientId(value) && <p className="mt-1 text-amber-900">That does not look like a client ID yet.</p>}
    </details>
  );
}

export function SettingsTab(props: Props) {
  const { state, profile, audit, updateProfile } = props;
  const [newName, setNewName] = useState('');
  const [newAge, setNewAge] = useState<number | null>(60);
  const [newWeight, setNewWeight] = useState<number | null>(65);
  const [adding, setAdding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toggle = <G extends 'conditions' | 'redFlags' | 'medications'>(g: G, k: keyof Profile[G]) =>
    updateProfile((p) => ({ [g]: { ...p[g], [k]: !p[g][k] } } as Partial<Profile>));
  const rec = recommendedProteinTarget(profile.age, profile.weightKg);
  const ai = state.aiCoach;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader icon={<Users className="w-5 h-5" />} title="People on this phone" subtitle="Each person has separate logs, flags and plan"
          right={<button type="button" onClick={() => setAdding((v) => !v)} className="inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-lg bg-slate-900 text-white text-sm font-semibold"><UserPlus className="w-4 h-4" aria-hidden /> Add person</button>} />
        <div className="flex flex-wrap gap-2">
          {state.profiles.map((p) => (
            <div key={p.id} className={`flex items-center rounded-xl border ${p.id === profile.id ? 'bg-emerald-50 border-emerald-600' : 'bg-slate-50 border-slate-200'}`}>
              <button type="button" aria-pressed={p.id === profile.id} onClick={() => props.onSelectProfile(p.id)} className="flex items-center gap-1.5 pl-3 pr-2 min-h-[44px] text-sm font-semibold">
                <User className="w-4 h-4" aria-hidden /> {p.name} ({p.age})
              </button>
              {state.profiles.length > 1 && (
                <button type="button" onClick={() => props.onDeleteProfile(p.id)} aria-label={`Delete ${p.name}`} className="p-2.5 text-slate-500 hover:text-rose-700"><X className="w-4 h-4" /></button>
              )}
            </div>
          ))}
        </div>
        {adding && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-2.5 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <input aria-label="Name" placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} className="min-h-[44px] px-3 rounded-lg border border-slate-300 bg-white text-sm" />
            <label className="text-sm flex items-center gap-2">Age <NumInput label="Age" value={newAge} allowEmpty min={14} max={105} onChange={setNewAge} /></label>
            <label className="text-sm flex items-center gap-2">Kg <NumInput label="Weight kg" value={newWeight} allowEmpty min={30} max={250} onChange={setNewWeight} /></label>
            <button type="button" className="min-h-[44px] rounded-lg bg-emerald-700 text-white text-sm font-semibold"
              onClick={() => { if (!newName.trim()) return; props.onAddProfile(newName.trim(), newAge ?? 60, newWeight ?? 65); setNewName(''); setAdding(false); }}>Create</button>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader icon={<ShieldCheck className="w-5 h-5" />} title={`Health screen: ${profile.name}`} subtitle="Sets intensity limits, warnings and protein targets. It does not replace your doctor." />
        <div className={`mb-4 p-3 rounded-xl text-sm border ${audit.screening.level === 'proceed' ? 'bg-emerald-50 border-emerald-200' : audit.screening.level === 'stop' ? 'bg-rose-50 border-rose-300' : 'bg-amber-50 border-amber-300'}`} role="status">
          <strong>{audit.screening.headline}.</strong> {audit.screening.detail}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label className="flex flex-col gap-1 text-sm col-span-2 sm:col-span-1"><span className="font-semibold">Name</span>
            <input value={profile.name} maxLength={60} onChange={(e) => updateProfile(() => ({ name: e.target.value }))} className="min-h-[44px] px-3 rounded-lg border border-slate-300 bg-white" /></label>
          <label className="flex flex-col gap-1 text-sm"><span className="font-semibold">Age</span>
            <NumInput label="Age" value={profile.age} min={14} max={105} onChange={(v) => updateProfile(() => ({ age: v ?? 60 }))} /></label>
          <label className="flex flex-col gap-1 text-sm"><span className="font-semibold">Weight (kg)</span>
            <NumInput label="Weight kg" value={profile.weightKg} min={30} max={250} step={0.5} onChange={(v) => updateProfile(() => ({ weightKg: v ?? 70 }))} /></label>
          <label className="flex flex-col gap-1 text-sm"><span className="font-semibold">Usual resting HR</span>
            <NumInput label="Baseline resting heart rate" value={profile.baselineRestingHr} allowEmpty min={30} max={120} disabled={audit.hrRestricted} onChange={(v) => updateProfile(() => ({ baselineRestingHr: v }))} /></label>
          <label className="flex flex-col gap-1 text-sm"><span className="font-semibold">Meals a day</span>
            <select value={profile.mealPattern} onChange={(e) => updateProfile(() => ({ mealPattern: e.target.value as Profile['mealPattern'] }))} className="min-h-[44px] px-3 rounded-lg border border-slate-300 bg-white">
              <option value="2-meal">2 meals</option><option value="3-meal">3 meals</option>
            </select></label>
          <label className="flex flex-col gap-1 text-sm"><span className="font-semibold">Protein target (g/day)</span>
            <NumInput label="Protein target grams per day" value={profile.proteinTargetG} min={0} max={400} disabled={audit.protein.isRenalRestricted} onChange={(v) => updateProfile(() => ({ proteinTargetG: v ?? 0 }))} /></label>
          <div className="col-span-2 text-sm text-slate-700 self-end">
            {audit.protein.label}
            {!audit.protein.isRenalRestricted && profile.proteinTargetG !== rec && (
              <button type="button" onClick={() => updateProfile(() => ({ proteinTargetG: rec }))} className="ml-2 underline font-semibold text-emerald-800 min-h-[40px]">Use {rec} g</button>
            )}
          </div>
        </div>

        <div className="mt-4">
          <Toggle tone="amber" checked={profile.isActiveRegularly} onChange={() => updateProfile((p) => ({ isActiveRegularly: !p.isActiveRegularly }))}
            label="Currently active" note="At least 30 min of moderate exercise, 3 days a week, for the past 3 months" />
        </div>

        <h3 className="mt-5 mb-2 flex items-center gap-2 text-sm font-bold text-rose-900"><ShieldAlert className="w-4 h-4" aria-hidden /> Symptoms (any one means: see your doctor first)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {RED_FLAG_ITEMS.map((r) => <Toggle key={r.key} tone="rose" checked={profile.redFlags[r.key]} onChange={() => toggle('redFlags', r.key)} label={r.label} />)}
        </div>
        <h3 className="mt-5 mb-2 text-sm font-bold">Known conditions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {CONDITION_ITEMS.map((c) => <Toggle key={c.key} tone="amber" checked={profile.conditions[c.key]} onChange={() => toggle('conditions', c.key)} label={c.label} note={c.note} />)}
        </div>
        <h3 className="mt-5 mb-2 text-sm font-bold">Medications that change exercise response</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {MEDICATION_ITEMS.map((m) => <Toggle key={m.key} tone="amber" checked={profile.medications[m.key]} onChange={() => toggle('medications', m.key)} label={m.label} note={m.note} />)}
        </div>
        {(audit.screening.level !== 'proceed' || profile.clearedForVigorous) && audit.screening.level !== 'stop' && (
          <div className="mt-5">
            <Toggle tone="amber" checked={profile.clearedForVigorous} onChange={() => updateProfile((p) => ({ clearedForVigorous: !p.clearedForVigorous }))}
              label="My doctor has cleared me for vigorous exercise" note="Tick only after a doctor has said so. Lifts the intensity cap and allows intervals." />
          </div>
        )}
      </Card>

      <Card>
        <CardHeader icon={<Database className="w-5 h-5" />} title="Your data" subtitle={props.storageInfo} />
        <p className="text-sm text-slate-700 mb-3">
          Everything is stored only in this browser on this device. Nothing is uploaded. Download a backup regularly and keep it in Google Drive or email it to yourself.
          {state.lastBackupAt ? ` Last backup: ${new Date(state.lastBackupAt).toLocaleDateString('en-IN')}.` : ' No backup yet.'}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button type="button" onClick={props.onExportJSON} className="flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-emerald-700 text-white text-sm font-semibold"><Download className="w-4 h-4" aria-hidden /> Download backup (all people)</button>
          <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center justify-center gap-2 min-h-[48px] rounded-xl border border-slate-300 text-sm font-semibold"><Upload className="w-4 h-4" aria-hidden /> Restore from backup</button>
          <button type="button" onClick={props.onRestoreDrive} disabled={props.driveBusy}
            className="sm:col-span-2 flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-sky-800 text-white text-sm font-semibold disabled:opacity-60">
            <CloudDownload className="w-4 h-4" aria-hidden /> {props.driveBusy ? 'Opening Google Drive…' : 'Restore from Google Drive'}
          </button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) props.onImportJSON(f); e.target.value = ''; }} />
          <button type="button" onClick={() => props.onExportCsv('workouts')} className="flex items-center justify-center gap-2 min-h-[48px] rounded-xl border border-slate-300 text-sm font-semibold"><FileSpreadsheet className="w-4 h-4" aria-hidden /> Sessions as spreadsheet (CSV)</button>
          <button type="button" onClick={() => props.onExportCsv('protein')} className="flex items-center justify-center gap-2 min-h-[48px] rounded-xl border border-slate-300 text-sm font-semibold"><FileSpreadsheet className="w-4 h-4" aria-hidden /> Protein as spreadsheet (CSV)</button>
        </div>
        <DriveSetup />
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap gap-2">
          <button type="button" onClick={props.onLoadDemo} className="px-3 min-h-[40px] rounded-lg text-sm font-semibold bg-slate-100">Load demo data</button>
          <button type="button" onClick={props.onResetAll} className="px-3 min-h-[40px] rounded-lg text-sm font-semibold text-rose-800 bg-rose-50 border border-rose-200">Erase everything</button>
        </div>
      </Card>

      <Card>
        <CardHeader icon={<Bot className="w-5 h-5" />} title="AI coach (optional)" subtitle="Off by default. The on-device rules work without it." />
        <div className="text-sm text-slate-700 space-y-2">
          <p>When on, each question sends your age, health flags, medications, protein average and your last 8 sessions to Google's Gemini service. Your name and notes are not sent. Google's terms apply to that data.</p>
          <p>You need your own Gemini API key. It is stored only on this phone and is left out of backups.</p>
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <input type="password" aria-label="Gemini API key" autoComplete="off" placeholder="Gemini API key" value={ai.apiKey} onChange={(e) => props.onUpdateAi({ apiKey: e.target.value.trim() })}
            className="sm:col-span-2 min-h-[44px] px-3 rounded-lg border border-slate-300 bg-white text-sm" />
          <input aria-label="Model name" value={ai.model} onChange={(e) => props.onUpdateAi({ model: e.target.value.trim() })} className="min-h-[44px] px-3 rounded-lg border border-slate-300 bg-white text-sm" />
        </div>
        <div className="mt-3">
          <Toggle tone="amber" checked={ai.enabled && !!ai.consentAt}
            onChange={() => props.onUpdateAi(ai.enabled ? { enabled: false, consentAt: null } : { enabled: true, consentAt: new Date().toISOString() })}
            label="I agree to send my training and health data to Google to get AI answers" note={ai.consentAt ? `Agreed ${new Date(ai.consentAt).toLocaleDateString('en-IN')}` : undefined} />
        </div>
      </Card>
    </div>
  );
}
