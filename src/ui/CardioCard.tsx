import { useState } from 'react';
import { Footprints, Trash2 } from 'lucide-react';
import { CARDIO_EFFORTS, CARDIO_SURFACES, buildCardioWorkout, cardioEntries, completeCardio, describeCardio, maxSpeedKmh, timeOfDayNow } from '../domain/cardio';
import { uid } from '../domain/state';
import { CARDIO_ACTIVITIES, CardioActivity, Profile, TIMES_OF_DAY, TimeOfDay } from '../domain/types';
import { Card, CardHeader, NumInput } from './common';

interface CardioCardProps {
  profile: Profile;
  today: string;
  rpeCap: number | null;
  updateProfile: (fn: (p: Profile) => Partial<Profile>) => void;
  showToast: (msg: string, tone?: 'emerald' | 'amber') => void;
  confirm: (opts: { title: string; message: string; confirmLabel: string; onConfirm: () => void }) => void;
}

const seg = (on: boolean) =>
  `px-3 min-h-[40px] rounded-lg text-sm font-semibold border ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-800 border-slate-300'}`;

/** Quick log for a walk, ride or other cardio done outside a planned session. */
export function CardioCard({ profile, today, rpeCap, updateProfile, showToast, confirm }: CardioCardProps) {
  const [activity, setActivity] = useState<CardioActivity>('Walk');
  const [surface, setSurface] = useState<string>('Road');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(() => timeOfDayNow());
  const [minutes, setMinutes] = useState<number | null>(null);
  const [km, setKm] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [effort, setEffort] = useState(1);

  const rpe = CARDIO_EFFORTS[effort].rpe;
  const filled = minutes ? completeCardio(minutes, km, speed) : { distanceKm: null, speedKmh: null };
  const tooFast = filled.speedKmh !== null && filled.speedKmh > maxSpeedKmh(activity);
  const overCap = rpeCap !== null && rpe > rpeCap;
  const todays = cardioEntries(profile.workouts).filter((c) => c.date === today);

  const save = () => {
    if (!minutes || minutes < 1 || minutes > 300) {
      showToast('Enter how many minutes (1–300).', 'amber');
      return;
    }
    if (tooFast) {
      showToast(`${filled.speedKmh} km/h looks too fast for a ${activity.toLowerCase()}. Check the distance or speed.`, 'amber');
      return;
    }
    const w = buildCardioWorkout({ id: uid(), date: today, minutes, rpe, detail: { activity, surface, timeOfDay, distanceKm: km, speedKmh: km ? null : speed } });
    updateProfile((p) => ({ workouts: [...p.workouts, w] }));
    setMinutes(null); setKm(null); setSpeed(null);
    showToast(`Saved: ${w.title.toLowerCase()}, ${describeCardio(cardioEntries([w])[0])}.`);
  };

  return (
    <Card>
      <CardHeader icon={<Footprints className="w-5 h-5" />} title="Walk or cardio" subtitle="Log a walk, ride or other cardio done outside today's session. It counts toward your weekly aerobic minutes." />
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Activity">
          {CARDIO_ACTIVITIES.map((a) => (
            <button key={a} type="button" aria-pressed={activity === a} className={seg(activity === a)}
              onClick={() => { setActivity(a); if (a === 'Cycle' && surface === 'Treadmill') setSurface('Road'); }}>{a}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-0.5 text-sm"><span className="text-xs font-bold text-slate-600 uppercase">Where</span>
            <select aria-label="Where" value={surface} onChange={(e) => setSurface(e.target.value)} className="min-h-[44px] px-2 rounded-lg border border-slate-300 bg-white font-semibold">
              {CARDIO_SURFACES.map((s) => <option key={s}>{s}</option>)}
            </select></label>
          <label className="flex flex-col gap-0.5 text-sm"><span className="text-xs font-bold text-slate-600 uppercase">When</span>
            <select aria-label="Time of day" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value as TimeOfDay)} className="min-h-[44px] px-2 rounded-lg border border-slate-300 bg-white font-semibold">
              {TIMES_OF_DAY.map((t) => <option key={t}>{t}</option>)}
            </select></label>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-0.5"><span className="text-xs font-bold text-slate-600 uppercase">Minutes</span>
            <NumInput label="Cardio minutes" value={minutes} allowEmpty min={1} max={300} onChange={setMinutes} /></label>
          <label className="flex flex-col gap-0.5"><span className="text-xs font-bold text-slate-600 uppercase">km</span>
            <NumInput label="Distance km" value={km} allowEmpty min={0} max={300} step={0.1} onChange={(v) => { setKm(v); if (v) setSpeed(null); }} /></label>
          <label className="flex flex-col gap-0.5"><span className="text-xs font-bold text-slate-600 uppercase">km/h</span>
            <NumInput label="Speed km per hour" value={speed} allowEmpty min={0} max={80} step={0.1} onChange={(v) => { setSpeed(v); if (v) setKm(null); }} /></label>
        </div>
        <p className="text-sm text-slate-700" aria-live="polite">
          {minutes && filled.distanceKm !== null
            ? <>That is <strong>{filled.distanceKm} km</strong> at <strong>{filled.speedKmh} km/h</strong>.</>
            : 'Enter minutes, then either the distance or the speed (from your phone or the treadmill). The other is worked out.'}
          {tooFast && <span className="block font-semibold text-amber-900">That speed looks too fast for a {activity.toLowerCase()}; check the numbers.</span>}
        </p>
        <div>
          <p className="text-xs font-bold text-slate-600 uppercase mb-1">Effort (talk test)</p>
          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Effort">
            {CARDIO_EFFORTS.map((e, k) => (
              <button key={e.label} type="button" aria-pressed={effort === k} onClick={() => setEffort(k)} className={`${seg(effort === k)} py-1.5 text-left`}>
                <span className="block">{e.label}</span><span className={`block text-xs font-normal ${effort === k ? 'text-slate-200' : 'text-slate-600'}`}>{e.detail}</span>
              </button>
            ))}
          </div>
          {overCap && <p className="mt-1.5 text-sm font-semibold rounded-lg px-2.5 py-1.5 bg-amber-100 text-amber-950">Your health screen caps effort at RPE {rpeCap} until you have clearance. Keep to talk-test pace.</p>}
        </div>
        <button type="button" onClick={save} className="w-full min-h-[48px] rounded-xl text-base font-bold bg-teal-700 text-white hover:bg-teal-800">
          Save {activity === 'Other' ? 'cardio' : activity.toLowerCase()}
        </button>
      </div>
      {todays.length > 0 && (
        <ul className="mt-4 pt-3 border-t border-slate-100 divide-y divide-slate-100">
          {todays.map((c) => (
            <li key={c.workoutId} className="flex items-center justify-between gap-2 py-1.5 text-sm">
              <span><strong>{c.detail.timeOfDay} {c.detail.activity.toLowerCase()}</strong>, {c.detail.surface.toLowerCase()}: {describeCardio(c)}</span>
              <button type="button" aria-label={`Delete ${c.detail.timeOfDay.toLowerCase()} ${c.detail.activity.toLowerCase()}`} className="p-2.5 text-slate-500 hover:text-rose-700"
                onClick={() => confirm({ title: 'Delete this entry?', message: `${c.detail.timeOfDay} ${c.detail.activity.toLowerCase()}, ${describeCardio(c)}, will be removed.`, confirmLabel: 'Delete',
                  onConfirm: () => updateProfile((p) => ({ workouts: p.workouts.filter((w) => w.id !== c.workoutId) })) })}>
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
