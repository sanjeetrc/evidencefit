import { useState } from 'react';
import { AlertTriangle, CheckCircle2, HeartPulse } from 'lucide-react';
import { Card, CardHeader } from '../../components/ui';
import { SAFETY_FLAGS, SAFETY_STOP_MESSAGE, safetyFlagLabels } from '../../domain/safety';
import { formatDateISO } from '../../lib/dates';
import { useDrive } from '../../sync/useDriveSync';
import type { Profile, UpdateProfile } from '../../types';

interface Props {
  profile: Profile;
  updateProfile: UpdateProfile;
}

function StopBanner() {
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-xl bg-rose-700 text-white px-3 py-3 text-base font-bold leading-snug">
      <AlertTriangle className="w-6 h-6 shrink-0 mt-0.5" aria-hidden />
      <span>{SAFETY_STOP_MESSAGE}</span>
    </div>
  );
}

/**
 * "Before you train" screen. Answering is recorded per day; ticking a symptom shows a stop banner
 * but never blocks logging. Once answered, the card collapses to one line.
 */
export default function SafetyCheckCard({ profile, updateProfile }: Props) {
  const today = formatDateISO();
  const check = profile.safetyChecks?.[today];
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string[]>(() => check?.flags ?? []);
  const open = !check || editing;
  const drive = useDrive();

  const toggle = (key: string) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const save = (flags: string[]) => {
    updateProfile((p) => ({ safetyChecks: { ...(p.safetyChecks ?? {}), [today]: { at: new Date().toISOString(), flags } } }));
    setSelected(flags);
    setEditing(false);
    drive.requestAutoSync(); // background; never blocks
  };

  if (!open && check) {
    const flagged = check.flags.length > 0;
    return (
      <div className="space-y-2">
        <div className={`flex items-center justify-between gap-2 rounded-xl border-2 px-3 min-h-[48px] ${flagged ? 'bg-rose-50 border-rose-300 text-rose-950' : 'bg-emerald-50 border-emerald-300 text-emerald-950'}`}>
          <p className="flex items-center gap-2 text-base font-bold">
            {flagged ? <AlertTriangle className="w-5 h-5" aria-hidden /> : <CheckCircle2 className="w-5 h-5" aria-hidden />}
            Checked ✓{flagged ? ` — symptoms reported: ${safetyFlagLabels(check.flags).join('; ')}` : ' — no warning symptoms today'}
          </p>
          <button type="button" onClick={() => { setSelected(check.flags); setEditing(true); }}
            className="shrink-0 min-h-[44px] px-3 rounded-lg text-base font-semibold underline">Change</button>
        </div>
        {flagged && <StopBanner />}
      </div>
    );
  }

  return (
    <Card className="border-2 border-amber-300">
      <CardHeader icon={<HeartPulse className="w-5 h-5" />} title="Before you train"
        subtitle="Do you have any of these today? Tap each one that applies." />
      <div className="space-y-2">
        {SAFETY_FLAGS.map((f) => {
          const on = selected.includes(f.key);
          return (
            <label key={f.key}
              className={`flex items-center gap-3 min-h-[52px] px-3 py-2 rounded-xl border-2 cursor-pointer text-base font-semibold ${on ? 'bg-rose-50 border-rose-500 text-rose-950' : 'bg-white border-slate-300 text-slate-900'}`}>
              <input type="checkbox" checked={on} onChange={() => toggle(f.key)} className="w-6 h-6 shrink-0 accent-rose-700" />
              {f.label}
            </label>
          );
        })}

        {selected.length > 0 && <StopBanner />}

        {selected.length === 0 ? (
          <button type="button" onClick={() => save([])}
            className="w-full min-h-[56px] rounded-xl bg-emerald-700 text-white text-lg font-extrabold inline-flex items-center justify-center gap-2">
            <CheckCircle2 className="w-6 h-6" aria-hidden /> None of these today
          </button>
        ) : (
          <button type="button" onClick={() => save(selected)}
            className="w-full min-h-[56px] rounded-xl bg-rose-700 text-white text-lg font-extrabold">
            Save — I have {selected.length === 1 ? 'this symptom' : 'these symptoms'} today
          </button>
        )}
        {editing && (
          <button type="button" onClick={() => { setSelected(check?.flags ?? []); setEditing(false); }}
            className="w-full min-h-[44px] rounded-lg text-base font-semibold text-slate-700 underline">Cancel</button>
        )}
        <p className="text-sm text-slate-600">You can still log workouts either way — this record helps you and your coach.</p>
      </div>
    </Card>
  );
}
