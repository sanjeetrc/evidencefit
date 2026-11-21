import { DayKey } from './types';

/** Local calendar date (the user's "today"), not UTC. */
export const formatDateISO = (d: Date = new Date()): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const daysAgoISO = (daysAgo: number, from: Date = new Date()): string => {
  const d = new Date(from);
  d.setDate(d.getDate() - daysAgo);
  return formatDateISO(d);
};

// Noon avoids DST edge cases when converting a calendar date to a Date.
const atNoon = (dateStr: string) => new Date(`${dateStr}T12:00:00`);

export const getDayKeyFromDate = (dateStr: string): DayKey => {
  const map: DayKey[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return map[atNoon(dateStr).getDay()] ?? 'Mon';
};

export const daysBetween = (fromISO: string, toISO: string): number =>
  Math.round((atNoon(toISO).getTime() - atNoon(fromISO).getTime()) / 86_400_000);

export const shortDateLabel = (dateStr: string): string =>
  dateStr ? atNoon(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';

export const isValidISODate = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(atNoon(s).getTime());
