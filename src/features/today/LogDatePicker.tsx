import { CalendarDays } from 'lucide-react';
import { dayLabel, daysAgoISO } from '../../lib/dates';

/** How far back an earlier day can be filled in. */
const MAX_BACKFILL_DAYS = 60;

interface Props {
  /** The day being logged (YYYY-MM-DD). */
  value: string;
  today: string;
  /** null = follow today's date. */
  onChange: (date: string | null) => void;
}

/**
 * "Logging for" picker: fill in a workout or protein you forgot on an earlier day.
 * Never allows future dates. Shows a clear banner whenever the day isn't today.
 */
export default function LogDatePicker({ value, today, onChange }: Props) {
  const yesterday = daysAgoISO(1, new Date(`${today}T12:00:00`));
  const twoAgo = daysAgoISO(2, new Date(`${today}T12:00:00`));
  const oldest = daysAgoISO(MAX_BACKFILL_DAYS, new Date(`${today}T12:00:00`));
  const isToday = value === today;

  const chip = (label: string, date: string | null, on: boolean) => (
    <button key={label} type="button" aria-pressed={on} onClick={() => onChange(date)}
      className={`min-h-[44px] px-4 rounded-full border-2 text-base font-bold ${on ? 'bg-emerald-700 border-emerald-700 text-white' : 'bg-white border-slate-300 text-slate-800'}`}>
      {label}
    </button>
  );

  return (
    <div className={`rounded-2xl border-2 p-3 space-y-2.5 ${isToday ? 'bg-white border-slate-200' : 'bg-amber-50 border-amber-400'}`}>
      <p className="flex items-center gap-2 text-base font-bold text-slate-900">
        <CalendarDays className="w-5 h-5 text-emerald-700" aria-hidden /> Logging for
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {chip('Today', null, isToday)}
        {chip('Yesterday', yesterday, value === yesterday)}
        {chip('2 days ago', twoAgo, value === twoAgo)}
        <label className="inline-flex items-center gap-2 min-h-[44px] px-3 rounded-full border-2 border-slate-300 bg-white text-base font-semibold">
          <span>Other day:</span>
          <input type="date" value={value} min={oldest} max={today} aria-label="Pick an earlier day"
            onChange={(e) => {
              const d = e.target.value;
              if (!d || d >= today) onChange(null);
              else if (d >= oldest) onChange(d);
            }}
            className="min-h-[36px] bg-transparent text-base" />
        </label>
      </div>
      {!isToday && (
        <p role="status" className="flex flex-wrap items-center gap-2 text-base font-semibold text-amber-950">
          You’re filling in <strong>{dayLabel(value)}</strong> — the workout and protein below will be saved to that day.
          <button type="button" onClick={() => onChange(null)} className="min-h-[44px] px-3 rounded-lg bg-white border-2 border-amber-400 font-bold">
            Back to today
          </button>
        </p>
      )}
    </div>
  );
}
