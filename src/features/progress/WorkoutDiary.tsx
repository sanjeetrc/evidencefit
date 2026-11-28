import { useState } from 'react';
import { CalendarDays, Flame, Search, Trash2 } from 'lucide-react';
import { CollapsibleCard } from '../../components/ui';
import { describeEntry } from '../../domain/coachBrief';
import { safetyFlagLabels } from '../../domain/safety';
import { dayLabel, daysBetween, formatDateISO } from '../../lib/dates';
import type { LoggedWorkout, Profile, UpdateProfile } from '../../types';

interface Props {
  profile: Profile;
  updateProfile: UpdateProfile;
}

const PAGE_DAYS = 10;

const ago = (date: string, today: string) => {
  const d = daysBetween(date, today);
  return d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
};

/** Day-by-day list of what was done: newest day first, every exercise on its own line, searchable. */
export default function WorkoutDiary({ profile, updateProfile }: Props) {
  const today = formatDateISO();
  const [query, setQuery] = useState('');
  const [shownDays, setShownDays] = useState(PAGE_DAYS);
  const q = query.trim().toLowerCase();

  // Group circuits by day, newest day first (same-day circuits in the order they were saved).
  const byDay = new Map<string, LoggedWorkout[]>();
  for (const w of profile.circuitLogs) byDay.set(w.date, [...(byDay.get(w.date) ?? []), w]);
  let days = [...byDay.keys()].sort((a, b) => b.localeCompare(a));
  if (q) days = days.filter((d) => byDay.get(d)!.some((w) => w.entries.some((e) => e.name.toLowerCase().includes(q))));
  const visible = days.slice(0, shownDays);

  const allDays = [...byDay.keys()].sort((a, b) => b.localeCompare(a));
  const week = profile.circuitLogs.filter((w) => { const d = daysBetween(w.date, today); return d >= 0 && d <= 6; }).length;
  const headline = allDays.length
    ? `${week} session${week === 1 ? '' : 's'} in the last 7 days · last on ${dayLabel(allDays[0])} · ${byDay.size} day${byDay.size === 1 ? '' : 's'} logged`
    : 'Nothing logged yet';

  const deleteCircuit = (w: LoggedWorkout) => {
    if (!window.confirm(`Delete the ${w.location.toLowerCase()} circuit from ${dayLabel(w.date)}?`)) return;
    updateProfile((p) => ({ circuitLogs: p.circuitLogs.filter((x) => x.id !== w.id) }));
  };

  return (
    <CollapsibleCard icon={<CalendarDays className="w-5 h-5" />} title="Workout diary" defaultOpen
      headline={headline}>

      {profile.circuitLogs.length === 0 ? (
        <p className="text-base text-slate-700">No workouts saved yet. Save one on the Today tab and it appears here.</p>
      ) : (
        <div className="space-y-4">
          <label className="flex items-center gap-2 min-h-[48px] px-3 rounded-xl border-2 border-slate-300 bg-white focus-within:border-emerald-600">
            <Search className="w-5 h-5 text-slate-500 shrink-0" aria-hidden />
            <input value={query} onChange={(e) => { setQuery(e.target.value); setShownDays(PAGE_DAYS); }}
              placeholder="Find an exercise (e.g. leg press)" aria-label="Find an exercise"
              className="flex-1 min-w-0 py-2 text-base bg-transparent outline-none" />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="min-h-[40px] px-2 text-base font-semibold text-slate-700 underline">Clear</button>
            )}
          </label>
          {q && (
            <p role="status" className="text-base font-semibold text-slate-800">
              {days.length
                ? `“${query.trim()}” found on ${days.length} day${days.length === 1 ? '' : 's'} — last on ${dayLabel(days[0])} (${ago(days[0], today)}).`
                : `No day with “${query.trim()}” yet.`}
            </p>
          )}

          <ol className="space-y-4">
            {visible.map((date) => {
              const workouts = byDay.get(date)!;
              const protein = (profile.proteinLogs[date] ?? []).reduce((s, i) => s + i.grams, 0);
              const safety = profile.safetyChecks?.[date];
              const kcal = workouts.reduce((s, w) => s + w.estKcal, 0);
              return (
                <li key={date} className="rounded-2xl border-2 border-slate-200 overflow-hidden">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2.5 bg-slate-50 border-b border-slate-200">
                    <h3 className="text-lg font-extrabold text-slate-900">
                      {dayLabel(date)} <span className="text-base font-semibold text-slate-600">· {ago(date, today)}</span>
                    </h3>
                    <span className="inline-flex items-center gap-1 text-base font-bold text-orange-900"><Flame className="w-4 h-4" aria-hidden /> ~{kcal} kcal</span>
                  </div>
                  <div className="px-3 py-2 space-y-3">
                    {workouts.map((w) => (
                      <div key={w.id} className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-base font-bold text-emerald-900">{w.location}{w.sleepHours != null ? ` · slept ${w.sleepHours} h` : ''}</p>
                          <button type="button" onClick={() => deleteCircuit(w)} aria-label={`Delete circuit from ${dayLabel(w.date)}`}
                            className="min-w-[44px] min-h-[44px] grid place-items-center text-slate-400 hover:text-rose-700"><Trash2 className="w-5 h-5" /></button>
                        </div>
                        <ul className="space-y-1">
                          {w.entries.map((e) => {
                            const hit = q && e.name.toLowerCase().includes(q);
                            return (
                              <li key={e.id} className={`text-base leading-snug ${hit ? 'bg-yellow-100 rounded px-1 font-semibold' : 'text-slate-800'}`}>
                                • {describeEntry(e)}
                              </li>
                            );
                          })}
                        </ul>
                        {w.notes.trim() && <p className="text-base text-slate-600 italic">Note: {w.notes.trim()}</p>}
                      </div>
                    ))}
                    <p className="text-sm text-slate-700 pt-1 border-t border-slate-100">
                      Protein: <strong>{protein ? `${protein} g` : 'not logged'}</strong>
                      {protein > 0 && ` of ${profile.proteinTargetG} g`}
                      {safety && <>{' · '}Safety check: <strong className={safety.flags.length ? 'text-rose-800' : ''}>
                        {safety.flags.length ? `symptoms — ${safetyFlagLabels(safety.flags).join('; ')}` : 'clear'}
                      </strong></>}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>

          {days.length > shownDays && (
            <button type="button" onClick={() => setShownDays((n) => n + PAGE_DAYS)}
              className="w-full min-h-[48px] rounded-xl bg-white border-2 border-slate-300 text-base font-bold text-slate-900">
              Show older days ({days.length - shownDays} more)
            </button>
          )}
        </div>
      )}
    </CollapsibleCard>
  );
}
