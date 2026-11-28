import { useState, type Dispatch, type SetStateAction } from 'react';
import { Bot, ShieldCheck, Sparkles, X } from 'lucide-react';
import { aiLabel, explainAiError, listCompatibleModels, PROVIDER_LABEL, testAi } from '../../ai';
import NumberField from '../../components/NumberField';
import { Card, CardHeader } from '../../components/ui';
import { CONDITION_ITEMS, MEDICATION_ITEMS } from '../../domain/health';
import { countKgEntries, relabelLoadsAsLb } from '../../lib/storage';
import type { AiCoachSettings, AppState, LoadUnit, MealPattern, Profile, ShowToast, UpdateProfile } from '../../types';
import DriveSyncCard from '../drive/DriveSyncCard';
import { buildLabel } from '../../lib/build';
import BackupCard from './BackupCard';

interface Props {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState | null>>;
  profile: Profile;
  updateProfile: UpdateProfile;
  showToast: ShowToast;
}

export default function SettingsTab({ state, setState, profile, updateProfile, showToast }: Props) {
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const [modelList, setModelList] = useState<{ provider: string; models: string[]; msg: string | null } | null>(null);
  const [glossFrom, setGlossFrom] = useState('');
  const [glossTo, setGlossTo] = useState('');

  const setAi = (fn: (a: AiCoachSettings) => AiCoachSettings) =>
    setState((prev) => (prev ? { ...prev, aiCoach: fn(prev.aiCoach) } : prev));
  const ai = state.aiCoach;
  const isGroq = ai.provider === 'groq';
  const providerName = isGroq ? 'Groq' : 'Gemini';

  const loadUnit: LoadUnit = profile.defaultLoadUnit ?? 'lb';
  const kgEntries = countKgEntries(profile.circuitLogs);
  const markAllAsLb = () => {
    if (!window.confirm(`Change the unit on ${kgEntries} saved exercise${kgEntries === 1 ? '' : 's'} from kg to lb?

The numbers stay the same (100 kg becomes 100 lb). Use this only if those weights were really pounds.`)) return;
    updateProfile((p) => ({ circuitLogs: relabelLoadsAsLb(p.circuitLogs) }));
    showToast(`Done — ${kgEntries} exercise${kgEntries === 1 ? '' : 's'} now marked as lb.`);
  };

  const addGlossaryRule = () => {
    const f = glossFrom.trim();
    const t = glossTo.trim();
    if (!f || !t) return;
    updateProfile((p) => ({
      voiceGlossary: [...p.voiceGlossary.filter((r) => r.from.toLowerCase() !== f.toLowerCase()), { from: f, to: t }],
    }));
    setGlossFrom('');
    setGlossTo('');
    showToast(`Saved: "${f}" → "${t}"`);
  };

  return (
    <>
      <Card>
        <CardHeader icon={<ShieldCheck className="w-5 h-5" />} title="Profile & Health Flags" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <label className="flex flex-col gap-1"><span className="font-semibold">Name</span>
            <input value={profile.name} onChange={(e) => updateProfile(() => ({ name: e.target.value }))} className="min-h-[42px] px-3 rounded-lg border border-slate-300" /></label>
          <label className="flex flex-col gap-1"><span className="font-semibold">Age</span>
            <NumberField min={18} max={110} value={profile.age} onCommit={(n) => updateProfile(() => ({ age: n }))} className="min-h-[44px] px-3 rounded-lg border border-slate-300 text-base" /></label>
          <label className="flex flex-col gap-1"><span className="font-semibold">Weight (kg)</span>
            <NumberField min={30} max={250} decimals={1} value={profile.weightKg} onCommit={(n) => updateProfile(() => ({ weightKg: n }))} className="min-h-[44px] px-3 rounded-lg border border-slate-300 text-base" /></label>
          <label className="flex flex-col gap-1"><span className="font-semibold">Protein target (g)</span>
            <NumberField min={20} max={400} value={profile.proteinTargetG} onCommit={(n) => updateProfile(() => ({ proteinTargetG: n }))} className="min-h-[44px] px-3 rounded-lg border border-slate-300 text-base" /></label>
        </div>
        <div className="mt-3">
          <label htmlFor="meal-pattern" className="text-sm font-semibold mr-3">Meals a day:</label>
          <select id="meal-pattern" value={profile.mealPattern} onChange={(e) => updateProfile(() => ({ mealPattern: e.target.value as MealPattern }))} className="min-h-[40px] px-3 rounded-lg border border-slate-300 text-sm">
            <option value="2-meal">2 meals (Lunch & Dinner)</option><option value="3-meal">3 meals</option>
          </select>
        </div>
        <div className="mt-4 p-3 rounded-xl border-2 border-slate-200 space-y-3">
          <p className="text-base font-bold text-slate-900">Default weight unit</p>
          <div className="flex gap-2" role="radiogroup" aria-label="Default weight unit">
            {(['lb', 'kg'] as const).map((u) => (
              <button key={u} type="button" role="radio" aria-checked={loadUnit === u}
                onClick={() => updateProfile(() => ({ defaultLoadUnit: u }))}
                className={`flex-1 min-h-[48px] rounded-xl border-2 text-base font-bold ${loadUnit === u ? 'bg-emerald-700 border-emerald-700 text-white' : 'bg-white border-slate-300 text-slate-900'}`}>
                {u === 'lb' ? 'Pounds (lb)' : 'Kilograms (kg)'}
              </button>
            ))}
          </div>
          <p className="text-base text-slate-700">Used for new exercises, Quick-Add buttons, voice and typed logs when you don't say a unit. You can still tap the unit on any exercise to change it.</p>
          {kgEntries > 0 ? (
            <div className="space-y-2">
              <p className="text-base text-slate-700">{kgEntries} saved exercise{kgEntries === 1 ? ' is' : 's are'} marked as kg. If you actually lifted pounds, fix the label in one go (the numbers don't change).</p>
              <button type="button" onClick={markAllAsLb}
                className="w-full min-h-[48px] rounded-xl bg-white border-2 border-amber-600 text-base font-bold text-amber-900">
                Mark all existing loads as lb
              </button>
            </div>
          ) : profile.circuitLogs.length > 0 && (
            <p className="text-base text-emerald-800 font-semibold">All saved loads are marked as lb ✓</p>
          )}
        </div>
        <h3 className="mt-4 mb-2 text-sm font-bold">Conditions & Medications</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          {CONDITION_ITEMS.map((c) => (
            <label key={c.key} className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 cursor-pointer">
              <input type="checkbox" checked={profile.conditions[c.key]} onChange={() => updateProfile((p) => ({ conditions: { ...p.conditions, [c.key]: !p.conditions[c.key] } }))} className="mt-1 w-4 h-4 accent-emerald-700" />
              <span><strong className="block">{c.label}</strong><span className="text-xs text-slate-600">{c.note}</span></span>
            </label>
          ))}
          {MEDICATION_ITEMS.map((m) => (
            <label key={m.key} className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 cursor-pointer">
              <input type="checkbox" checked={profile.medications[m.key]} onChange={() => updateProfile((p) => ({ medications: { ...p.medications, [m.key]: !p.medications[m.key] } }))} className="mt-1 w-4 h-4 accent-emerald-700" />
              <span><strong className="block">{m.label}</strong><span className="text-xs text-slate-600">{m.note}</span></span>
            </label>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader icon={<Bot className="w-5 h-5" />} title="AI Coach" subtitle="Optional. Also powers smart voice parsing in Quick-Log." />
        <div role="radiogroup" aria-label="AI provider" className="mb-3 grid grid-cols-2 gap-2">
          {(['gemini', 'groq'] as const).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={ai.provider === p}
              onClick={() => { setAiStatus(null); setModelList(null); setAi((a) => ({ ...a, provider: p })); }}
              className={`min-h-[44px] rounded-lg border-2 text-sm font-bold ${ai.provider === p ? 'bg-emerald-700 border-emerald-700 text-white' : 'bg-white border-slate-300 text-slate-800'}`}>
              {PROVIDER_LABEL[p]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <input type="password" placeholder={`Paste ${providerName} API key`} value={isGroq ? ai.groqApiKey : ai.apiKey}
            autoComplete="off" spellCheck={false} aria-label={`${providerName} API key`}
            onChange={(e) => { const v = e.target.value.trim(); setAi((a) => (a.provider === 'groq' ? { ...a, groqApiKey: v } : { ...a, apiKey: v })); }}
            className="sm:col-span-2 min-h-[44px] px-3 rounded-lg border border-slate-300 text-sm" />
          <input value={isGroq ? ai.groqModel : ai.model} aria-label={`${providerName} model`} spellCheck={false}
            onChange={(e) => { const v = e.target.value.trim(); setAi((a) => (a.provider === 'groq' ? { ...a, groqModel: v } : { ...a, model: v })); }}
            className="min-h-[44px] px-3 rounded-lg border border-slate-300 text-sm" />
        </div>
        <div className="mt-2 space-y-2">
          <button type="button" onClick={async () => {
            setModelList({ provider: ai.provider, models: [], msg: 'Asking ' + providerName + ' which models your key can use…' });
            const r = await listCompatibleModels(ai);
            setModelList({ provider: ai.provider, models: r.models, msg: r.error ?? null });
          }} className="px-4 min-h-[40px] rounded-lg bg-white border-2 border-slate-300 text-slate-900 text-sm font-semibold">
            Find compatible models
          </button>
          {modelList && modelList.provider === ai.provider && (
            <div className="space-y-1.5">
              {modelList.msg && <p className="text-sm text-slate-700">{modelList.msg}</p>}
              {modelList.models.length > 0 && (
                <>
                  <p className="text-sm text-slate-700">Tap one to use it:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {modelList.models.map((m) => {
                      const current = (isGroq ? ai.groqModel : ai.model) === m;
                      return (
                        <button key={m} type="button" aria-pressed={current}
                          onClick={() => { setAiStatus(null); setAi((a) => (a.provider === 'groq' ? { ...a, groqModel: m } : { ...a, model: m })); }}
                          className={`min-h-[36px] px-2.5 rounded-lg border text-xs font-semibold ${current ? 'bg-emerald-700 border-emerald-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'}`}>
                          {m}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <label className="mt-3 flex items-center gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-300 text-sm font-semibold cursor-pointer">
          <input type="checkbox" checked={ai.enabled && !!(isGroq ? ai.groqConsentAt : ai.consentAt)}
            onChange={() => setAi((a) => {
              const consentKey = a.provider === 'groq' ? 'groqConsentAt' : 'consentAt';
              const on = a.enabled && !!a[consentKey];
              return on ? { ...a, enabled: false, [consentKey]: null } : { ...a, enabled: true, [consentKey]: new Date().toISOString() };
            })}
            className="w-5 h-5 accent-emerald-700" />
          I agree to send my workout logs and profile basics (age, weight, protein target) to {PROVIDER_LABEL[ai.provider]} for AI coaching and voice parsing
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={async () => {
            setAiStatus('Testing…');
            const r = await testAi(ai);
            const secs = (r.ms / 1000).toFixed(1);
            setAiStatus(r.ok
              ? `Connected — replied in ${secs} s (${aiLabel(ai)}).`
              : `Not connected after ${secs} s: ${explainAiError(r.error, ai.provider)}`);
          }} className="px-4 min-h-[40px] rounded-lg bg-slate-900 text-white text-sm font-semibold">Test AI connection</button>
          {aiStatus && <span className="text-sm text-slate-700">{aiStatus}</span>}
        </div>
        {isGroq ? (
          <p className="mt-3 text-xs text-slate-500">
            Get a key at console.groq.com → API Keys. Model names change over time — if the test says “model not found”, copy a
            current one from the Groq models page (e.g. llama-3.3-70b-versatile, or llama-3.1-8b-instant for speed).
            <strong> Groq keys can’t be locked to this website</strong>, so anyone who gets this key can use it: keep it on the free tier
            (or set a spending limit), never share backups made from a browser you don’t control, and delete the key in the Groq console if
            this device is lost. Your key is stored only in this browser and is never included in backups.
          </p>
        ) : (
          <p className="mt-3 text-xs text-slate-500">
            Your key is stored only in this browser. In Google Cloud Console → Credentials, restrict it to the Generative Language API
            and to this site's address so it is useless anywhere else.
          </p>
        )}
      </Card>

      <Card>
        <CardHeader icon={<Sparkles className="w-5 h-5" />} title="Voice Glossary" subtitle="Teach EvidenceFit your recurring mic slips. Your rules run before the built-in fixes, before AI & offline parsing, and save in Backup JSON." />
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <input placeholder="Heard (e.g. syria mask)" value={glossFrom} onChange={(e) => setGlossFrom(e.target.value)} aria-label="Heard phrase"
            className="flex-1 min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm" />
          <input placeholder="Means (e.g. Surya Namaskar)" value={glossTo} onChange={(e) => setGlossTo(e.target.value)} aria-label="Replacement"
            onKeyDown={(e) => { if (e.key === 'Enter') addGlossaryRule(); }}
            className="flex-1 min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm" />
          <button type="button" onClick={addGlossaryRule} className="px-4 min-h-[42px] rounded-lg bg-emerald-700 text-white text-sm font-semibold">Add rule</button>
        </div>
        {profile.voiceGlossary.length === 0 ? (
          <p className="text-xs text-slate-500">No custom voice rules yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {profile.voiceGlossary.map((r) => (
              <li key={r.from} className="py-1.5 flex items-center justify-between gap-2">
                <span><strong className="text-slate-700">“{r.from}”</strong> → <strong className="text-emerald-800">{r.to}</strong></span>
                <button type="button" onClick={() => updateProfile((p) => ({ voiceGlossary: p.voiceGlossary.filter((x) => x.from !== r.from) }))}
                  aria-label={`Remove rule ${r.from}`} className="p-1.5 text-rose-700"><X className="w-4 h-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <DriveSyncCard />

      <BackupCard state={state} setState={setState} profile={profile} showToast={showToast} />
      <p className="px-1 text-base text-slate-600">
        App version: <span className="font-mono text-slate-800">{buildLabel()}</span>
      </p>
    </>
  );
}
