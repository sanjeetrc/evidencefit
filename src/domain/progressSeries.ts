/**
 * Keeps Progress charts a fixed, readable size however long the log grows.
 * Up to 8 weeks: one point per day. Longer ranges: one point per week (Monday start).
 * Beyond two years: one point per month. Nothing is deleted; only the view is summarised.
 */
import { daysBetween, formatDateISO } from '../lib/dates';
import type { LoggedWorkout, MuscleGroup, ProteinItem } from '../types';

type ProteinLogs = Record<string, ProteinItem[]>;

export type RangeKey = '4w' | '3m' | '1y' | 'all';
export const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: '4w', label: '4 wks', days: 28 },
  { key: '3m', label: '3 mo', days: 91 },
  { key: '1y', label: '1 yr', days: 365 },
  { key: 'all', label: 'All', days: null },
];
export const DAILY_MAX_DAYS = 56;
const WEEKLY_MAX_DAYS = 730;

export type Bucket = 'day' | 'week' | 'month';
export interface ProteinPoint { key: string; label: string; grams: number | null; loggedDays: number }
export interface ProteinSeries { bucket: Bucket; points: ProteinPoint[]; avg: number | null; loggedDays: number; daysMet: number; spanDays: number }

const iso = (d: Date) => formatDateISO(d);
const at = (s: string) => new Date(`${s}T12:00:00`);
const addDays = (s: string, n: number) => { const d = at(s); d.setDate(d.getDate() + n); return iso(d); };
const mondayOf = (s: string) => { const d = at(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
const fmt = (s: string, o: Intl.DateTimeFormatOptions) => at(s).toLocaleDateString('en-IN', o);

/** First day shown for a range; for "All", the earliest logged day (or 4 weeks ago when nothing is logged). */
export function rangeStart(range: RangeKey, today: string, earliest: string | null): string {
  const r = RANGES.find((x) => x.key === range)!;
  if (r.days !== null) return addDays(today, -(r.days - 1));
  return earliest && earliest < today ? earliest : addDays(today, -27);
}

export function bucketFor(spanDays: number): Bucket {
  return spanDays <= DAILY_MAX_DAYS ? 'day' : spanDays <= WEEKLY_MAX_DAYS ? 'week' : 'month';
}

const bucketKey = (date: string, b: Bucket) => (b === 'day' ? date : b === 'week' ? mondayOf(date) : date.slice(0, 7));
const bucketLabel = (key: string, b: Bucket) =>
  b === 'day' ? fmt(key, { day: 'numeric', month: 'short' })
    : b === 'week' ? fmt(key, { day: 'numeric', month: 'short' })
      : fmt(`${key}-01`, { month: 'short', year: '2-digit' });

const dayTotal = (logs: ProteinLogs, date: string) => (logs[date] ?? []).reduce((s, i) => s + (Number(i.grams) || 0), 0);

/** Protein per day, or the average per logged day for each week / month. Days with nothing logged are gaps, not zeros. */
export function buildProteinSeries(logs: ProteinLogs, today: string, range: RangeKey, target: number): ProteinSeries {
  const logged = Object.keys(logs).filter((d) => d <= today && (logs[d] ?? []).length > 0).sort();
  const start = rangeStart(range, today, logged[0] ?? null);
  const spanDays = daysBetween(start, today) + 1;
  const bucket = bucketFor(spanDays);
  const acc = new Map<string, { sum: number; n: number }>();
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const k = bucketKey(d, bucket);
    if (!acc.has(k)) acc.set(k, { sum: 0, n: 0 });
  }
  let sum = 0; let n = 0; let met = 0;
  for (const d of logged) {
    if (d < start) continue;
    const g = dayTotal(logs, d);
    const a = acc.get(bucketKey(d, bucket))!;
    a.sum += g; a.n += 1; sum += g; n += 1; if (target > 0 && g >= target) met += 1;
  }
  const points = [...acc.entries()].map(([key, a]) => ({
    key, label: bucketLabel(key, bucket), grams: a.n ? Math.round(a.sum / a.n) : null, loggedDays: a.n,
  }));
  return { bucket, points, avg: n ? Math.round(sum / n) : null, loggedDays: n, daysMet: met, spanDays };
}

/** Sessions that hit each muscle group within the range, most first. */
export function muscleBalance(logs: LoggedWorkout[], today: string, range: RangeKey): { muscles: [MuscleGroup, number][]; sessions: number } {
  const earliest = logs.reduce<string | null>((m, w) => (m === null || w.date < m ? w.date : m), null);
  const start = rangeStart(range, today, earliest);
  const inRange = logs.filter((w) => w.date >= start && w.date <= today);
  const counts = new Map<MuscleGroup, number>();
  inRange.forEach((w) => w.muscles.forEach((m) => counts.set(m, (counts.get(m) ?? 0) + 1)));
  return { muscles: [...counts.entries()].sort((a, b) => b[1] - a[1]), sessions: inRange.length };
}

export const bucketWord = (b: Bucket) => (b === 'day' ? 'per day' : b === 'week' ? 'weekly average' : 'monthly average');
