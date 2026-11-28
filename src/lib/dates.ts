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

export const shortDateLabel = (dateStr: string): string =>
  dateStr ? new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';

export const daysBetween = (fromISO: string, toISO: string): number =>
  Math.round((new Date(`${toISO}T12:00:00`).getTime() - new Date(`${fromISO}T12:00:00`).getTime()) / 86_400_000);

export const isISODate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** "Mon, 24 Nov" — for telling the user which day they are logging. */
export const dayLabel = (iso: string): string =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
