import { useState } from 'react';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { RED_FLAG_ITEMS } from '../domain/reference';
import type { Profile, RedFlagKey } from '../domain/types';
import { Card, CardHeader } from './common';

interface SafetyCheckCardProps {
  profile: Profile;
  /** The real calendar date: the check is about how you feel now. */
  today: string;
  updateProfile: (fn: (p: Profile) => Partial<Profile>) => void;
}

const timeLabel = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
};

/** "Before you train": a 10-second daily check for warning signs that mean no exercise today. */
export function SafetyCheckCard({ profile, today, updateProfile }: SafetyCheckCardProps) {
  const check = profile.safetyChecks?.[today];
  const [editing, setEditing] = useState(false);
  const [ticked, setTicked] = useState<RedFlagKey[]>(check?.flags ?? []);

  const save = (flags: RedFlagKey[]) => {
    updateProfile((p) => {
      const all = { ...(p.safetyChecks ?? {}), [today]: { at: new Date().toISOString(), flags } };
      const keep = Object.keys(all).sort().slice(-90);
      return { safetyChecks: Object.fromEntries(keep.map((k) => [k, all[k]])) };
    });
    setEditing(false);
  };

  if (check && !editing) {
    const labels = RED_FLAG_ITEMS.filter((r) => check.flags.includes(r.key)).map((r) => r.label);
    const change = (
      <button type="button" onClick={() => { setTicked(check.flags); setEditing(true); }}
        className="shrink-0 px-3 min-h-[40px] rounded-lg border border-current text-sm font-semibold">Change</button>
    );
    if (!labels.length) {
      return (
        <div role="status" className="flex items-center justify-between gap-2 rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-950">
          <span className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 shrink-0" />Before you train: checked{timeLabel(check.at) ? ` at ${timeLabel(check.at)}` : ''}, no warning signs.</span>
          {change}
        </div>
      );
    }
    return (
      <div role="alert" className="rounded-2xl bg-rose-50 border-2 border-rose-400 px-4 py-3 text-rose-950">
        <div className="flex items-start justify-between gap-2">
          <p className="flex items-center gap-2 font-bold text-base"><ShieldAlert className="w-5 h-5 shrink-0" />Do not exercise today</p>
          {change}
        </div>
        <ul className="mt-2 list-disc pl-5 text-sm">{labels.map((l) => <li key={l}>{l}</li>)}</ul>
        <p className="mt-2 text-sm">These can be signs of a heart or circulation problem. Rest, and speak to your doctor today before any exercise.</p>
        <p className="mt-1.5 text-sm font-semibold">If chest pain lasts more than a few minutes, or comes with breathlessness, sweating, or arm or jaw pain, call 108 or 112 now.</p>
      </div>
    );
  }

  const toggle = (k: RedFlagKey) => setTicked((t) => (t.includes(k) ? t.filter((x) => x !== k) : [...t, k]));
  return (
    <Card>
      <CardHeader icon={<ShieldAlert className="w-5 h-5" />} title="Before you train" subtitle="Do you have any of these today? Tick any that apply." />
      <div className="space-y-2">
        {RED_FLAG_ITEMS.map((r) => (
          <label key={r.key} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer ${ticked.includes(r.key) ? 'bg-rose-50 border-rose-400' : 'bg-white border-slate-200'}`}>
            <input type="checkbox" checked={ticked.includes(r.key)} onChange={() => toggle(r.key)} className="mt-0.5 w-5 h-5 accent-rose-700" />
            <span className="text-sm font-semibold text-slate-900">{r.label}</span>
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {ticked.length === 0 ? (
          <button type="button" onClick={() => save([])} className="flex-1 min-h-[48px] rounded-xl bg-emerald-700 text-white font-semibold">None of these: I feel fine</button>
        ) : (
          <button type="button" onClick={() => save(ticked)} className="flex-1 min-h-[48px] rounded-xl bg-rose-700 text-white font-semibold">Save: I have {ticked.length === 1 ? 'this' : 'these'}</button>
        )}
        {check && <button type="button" onClick={() => setEditing(false)} className="px-4 min-h-[48px] rounded-xl border border-slate-300 font-semibold">Cancel</button>}
      </div>
    </Card>
  );
}
