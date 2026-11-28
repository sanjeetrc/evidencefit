import { useState } from 'react';
import { ChevronDown, Utensils } from 'lucide-react';
import { CollapsibleCard } from '../../components/ui';
import { groupProteinByMeal, proteinGapText } from '../../domain/protein';
import { dayLabel, daysBetween, formatDateISO } from '../../lib/dates';
import type { Profile } from '../../types';

const PAGE_DAYS = 10;

const ago = (date: string, today: string) => {
  const d = daysBetween(date, today);
  return d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
};

/** Day-by-day protein: total vs target per day; tap a day to see everything eaten, by meal. */
export default function ProteinDiary({ profile }: { profile: Profile }) {
  const today = formatDateISO();
  const [shownDays, setShownDays] = useState(PAGE_DAYS);
  const target = profile.proteinTargetG;

  const days = Object.entries(profile.proteinLogs)
    .filter(([date, items]) => items.length > 0 && date <= today)
    .sort((a, b) => b[0].localeCompare(a[0]));
  const totals = days.map(([, items]) => items.reduce((s, i) => s + (Number(i.grams) || 0), 0));
  const last7 = days.filter(([date]) => daysBetween(date, today) <= 6);
  const avg7 = last7.length
    ? Math.round(last7.reduce((s, [, items]) => s + items.reduce((t, i) => t + (Number(i.grams) || 0), 0), 0) / last7.length)
    : 0;

  return (
    <CollapsibleCard icon={<Utensils className="w-5 h-5" />} title="Protein diary"
      headline={last7.length ? `Last 7 days: ${avg7} g/day average · target ${target} g` : days.length ? `${days.length} day${days.length === 1 ? '' : 's'} logged · target ${target} g/day` : `Target ${target} g/day`}>
      {days.length > 0 && <p className="text-sm text-slate-600 mb-2">Tap a day to see what you ate.</p>}
      {days.length === 0 ? (
        <p className="text-base text-slate-700">No protein logged yet. Add food in the Protein card on the Today tab.</p>
      ) : (
        <div className="space-y-2">
          {last7.length > 0 && (
            <p className="text-base font-semibold text-slate-800">
              Last 7 days: average <strong>{avg7} g/day</strong> on {last7.length} logged day{last7.length === 1 ? '' : 's'};
              target reached on {last7.filter(([, items]) => items.reduce((s, i) => s + (Number(i.grams) || 0), 0) >= target).length}.
            </p>
          )}
          {days.slice(0, shownDays).map(([date, items], idx) => {
            const total = Math.round(totals[idx] * 10) / 10;
            const pct = target > 0 ? Math.min(100, Math.round((total / target) * 100)) : 0;
            const met = target > 0 && total >= target;
            return (
              <details key={date} open={idx === 0} className="group rounded-xl border-2 border-slate-200 overflow-hidden">
                <summary className="list-none cursor-pointer px-3 py-2.5 min-h-[56px] bg-slate-50 space-y-1.5">
                  <span className="flex flex-wrap items-center justify-between gap-x-3">
                    <span className="text-base font-extrabold text-slate-900">
                      {dayLabel(date)} <span className="font-semibold text-slate-600">· {ago(date, today)}</span>
                    </span>
                    <span className={`inline-flex items-center gap-1 text-base font-bold ${met ? 'text-emerald-800' : 'text-amber-900'}`}>
                      {total} g — {proteinGapText(total, target)}
                      <ChevronDown className="w-5 h-5 transition-transform group-open:rotate-180" aria-hidden />
                    </span>
                  </span>
                  <span className="block w-full h-2 bg-slate-200 rounded-full overflow-hidden" aria-hidden>
                    <span className={`block h-full ${met ? 'bg-emerald-600' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
                  </span>
                </summary>
                <div className="divide-y divide-slate-100">
                  {groupProteinByMeal(items).map((g) => (
                    <div key={g.slot} className="px-3 py-2">
                      <p className="flex justify-between text-sm font-bold uppercase tracking-wide text-emerald-800">
                        <span>{g.slot}</span><span>{g.grams} g</span>
                      </p>
                      <ul>
                        {g.items.map((i) => (
                          <li key={i.id} className="text-base text-slate-900 leading-snug py-0.5">• {i.name} — <strong>{i.grams} g</strong></li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </details>
            );
          })}
          {days.length > shownDays && (
            <button type="button" onClick={() => setShownDays((n) => n + PAGE_DAYS)}
              className="w-full min-h-[48px] rounded-xl bg-white border-2 border-slate-300 text-base font-bold text-slate-900">
              Show older days ({days.length - shownDays} more)
            </button>
          )}
          <p className="text-sm text-slate-600">To add or fix a day, go to Today and choose that day under “Logging for”.</p>
        </div>
      )}
    </CollapsibleCard>
  );
}
