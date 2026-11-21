import { Profile } from './types';

/** Quote a CSV cell and neutralise spreadsheet formula injection (=, +, -, @). */
export const cell = (v: unknown): string => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) || s.startsWith("'") ? `"${s.replace(/"/g, '""')}"` : s;
};

const row = (xs: unknown[]) => xs.map(cell).join(',');

export function workoutsCsv(p: Profile): string {
  const out = [row(['Date', 'Title', 'Location', 'SleepHrs', 'RestingHR', 'Climate', 'Exercise', 'Set', 'LoadKg', 'RepsOrDuration', 'Unit', 'RPE', 'Pain'])];
  for (const w of [...p.workouts].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const e of w.exercises) {
      e.sets.forEach((s, i) =>
        out.push(row([w.date, w.title, w.location, w.sleepHours, w.restingHr, w.climate, e.name, i + 1, s.loadKg, s.reps, e.unit, s.rpe, s.pain]))
      );
    }
  }
  return out.join('\n');
}

export function proteinCsv(p: Profile): string {
  const out = [row(['Date', 'Meal', 'Item', 'ProteinGrams'])];
  for (const [date, items] of Object.entries(p.proteinLogs).sort(([a], [b]) => a.localeCompare(b))) {
    for (const it of items) out.push(row([date, it.mealSlot, it.name, it.grams]));
  }
  return out.join('\n');
}
