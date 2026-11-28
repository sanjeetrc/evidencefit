import { useState } from 'react';
import { Footprints, Trash2 } from 'lucide-react';
import { Card, CardHeader } from '../../components/ui';
import { buildWalkWorkout, timeOfDayNow, TIMES_OF_DAY, WALK_ACTIVITIES, WALK_PLACES, type TimeOfDay, type WalkActivity } from '../../domain/walk';
import { dayLabel, formatDateISO } from '../../lib/dates';
import type { Profile, ShowToast, UpdateProfile } from '../../types';

interface Props { profile: Profile; date: string; updateProfile: UpdateProfile; showToast: ShowToast }

const pill = (on: boolean) => `px-3 min-h-[40px] rounded-lg text-sm font-semibold ${on ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700'}`;
const num = (s: string): number | null => { const n = Number(s.replace(',', '.')); return s.trim() && Number.isFinite(n) && n > 0 ? n : null; };

export default function WalkCard({ profile, date, updateProfile, showToast }: Props) {
  const [activity, setActivity] = useState<WalkActivity>('Walk');
  const [place, setPlace] = useState<string>('Road');
  const [time, setTime] = useState<TimeOfDay>(timeOfDayNow());
  const [minutes, setMinutes] = useState('');
  const [speed, setSpeed] = useState('');
  const [distance, setDistance] = useState('');

  const m = num(minutes); const s = num(speed); const d = num(distance);
  const derived = m && s && !d ? `That is ${Math.round(s * (m / 60) * 10) / 10} km at ${s} km/h.`
    : m && d && !s ? `That is ${Math.round((d / (m / 60)) * 10) / 10} km/h.` : '';

  const save = () => {
    if (!m || m > 600) { showToast('Enter the minutes walked (1 to 600).'); return; }
    if (s !== null && s > 30) { showToast('Speed looks too high: enter km per hour, e.g. 4.8.'); return; }
    const w = buildWalkWorkout({ date, activity, place, time, minutes: m, speedKmh: s, distanceKm: d, weightKg: profile.weightKg });
    updateProfile((p) => ({ circuitLogs: [...p.circuitLogs, w].sort((a, b) => a.date.localeCompare(b.date)) }));
    setMinutes(''); setSpeed(''); setDistance('');
    showToast(`${w.entries[0].name} saved for ${dayLabel(date)} (~${w.estKcal} kcal).`);
  };

  const todays = profile.circuitLogs.filter((w) => w.date === date && w.location === 'Outdoor' && w.entries.length === 1 && / (walk|cycle|cardio) \(/.test(w.entries[0].name));

  return (
    <Card>
      <CardHeader icon={<Footprints className="w-5 h-5" />} title="Walk or cardio"
        subtitle="A walk or ride outside your circuit, e.g. an evening road walk. It counts toward your aerobic minutes." />
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Activity">
          {WALK_ACTIVITIES.map((a) => <button key={a} type="button" aria-pressed={activity === a} onClick={() => setActivity(a)} className={pill(activity === a)}>{a}</button>)}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm font-semibold text-slate-700">Where
            <select value={place} onChange={(e) => setPlace(e.target.value)} className="mt-1 w-full min-h-[44px] px-2 rounded-xl border border-slate-300 bg-white">
              {WALK_PLACES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">Time of day
            <select value={time} onChange={(e) => setTime(e.target.value as TimeOfDay)} className="mt-1 w-full min-h-[44px] px-2 rounded-xl border border-slate-300 bg-white">
              {TIMES_OF_DAY.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-sm font-semibold text-slate-700">Minutes
            <input inputMode="decimal" aria-label="Walk minutes" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="30"
              className="mt-1 w-full min-h-[44px] px-2 rounded-xl border border-slate-300" />
          </label>
          <label className="text-sm font-semibold text-slate-700">km/h
            <input inputMode="decimal" aria-label="Walk speed km per hour" value={speed} onChange={(e) => setSpeed(e.target.value)} placeholder="4.8"
              className="mt-1 w-full min-h-[44px] px-2 rounded-xl border border-slate-300" />
          </label>
          <label className="text-sm font-semibold text-slate-700">or km
            <input inputMode="decimal" aria-label="Walk distance km" value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="2.4"
              className="mt-1 w-full min-h-[44px] px-2 rounded-xl border border-slate-300" />
          </label>
        </div>
        {derived && <p className="text-sm text-emerald-800">{derived}</p>}
        <button type="button" onClick={save} className="w-full min-h-[48px] rounded-xl bg-emerald-700 text-white font-bold">
          Save {activity === 'Other' ? 'cardio' : activity.toLowerCase()}{date === formatDateISO() ? '' : ` for ${dayLabel(date)}`}
        </button>
        {todays.length > 0 && (
          <ul className="space-y-1.5">
            {todays.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <span><span className="font-semibold">{w.entries[0].name}</span>: {w.entries[0].reps} min{w.notes ? ` · ${w.notes}` : ''}</span>
                <button type="button" aria-label={`Delete ${w.entries[0].name}`} className="p-2 text-slate-600"
                  onClick={() => { if (window.confirm('Delete this walk?')) updateProfile((p) => ({ circuitLogs: p.circuitLogs.filter((x) => x.id !== w.id) })); }}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
