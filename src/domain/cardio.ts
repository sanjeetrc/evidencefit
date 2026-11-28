import { getDayKeyFromDate } from './dates';
import { CardioActivity, CardioDetail, Location, TimeOfDay, Workout } from './types';

export const CARDIO_SURFACES = ['Road', 'Park or track', 'Beach', 'Treadmill', 'Stationary cycle', 'Other'] as const;

/** Effort by the talk test, mapped to RPE (0–10). */
export const CARDIO_EFFORTS = [
  { label: 'Easy', detail: 'could sing', rpe: 3 },
  { label: 'Talk test', detail: 'full sentences', rpe: 4 },
  { label: 'Brisk', detail: 'short sentences only', rpe: 6 },
] as const;

export const timeOfDayNow = (d = new Date()): TimeOfDay => (d.getHours() < 12 ? 'Morning' : d.getHours() < 17 ? 'Afternoon' : 'Evening');

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

/** Fills in distance from speed, or speed from distance, given the minutes. */
export function completeCardio(minutes: number, distanceKm: number | null, speedKmh: number | null): { distanceKm: number | null; speedKmh: number | null } {
  if (!(minutes > 0)) return { distanceKm, speedKmh };
  if (distanceKm !== null && distanceKm > 0) return { distanceKm: round(distanceKm, 2), speedKmh: round(distanceKm / (minutes / 60), 1) };
  if (speedKmh !== null && speedKmh > 0) return { distanceKm: round((speedKmh * minutes) / 60, 2), speedKmh: round(speedKmh, 1) };
  return { distanceKm: null, speedKmh: null };
}

/** Upper speed that is plausible for the activity, to catch typing slips. */
export const maxSpeedKmh = (a: CardioActivity) => (a === 'Walk' ? 9 : a === 'Cycle' ? 45 : 25);

export const cardioName = (c: Pick<CardioDetail, 'activity' | 'surface' | 'timeOfDay'>) =>
  `${c.activity === 'Other' ? 'Cardio' : c.activity}, ${c.surface.toLowerCase()} (${c.timeOfDay.toLowerCase()})`;

const locationFor = (surface: string): Location =>
  /treadmill|stationary/i.test(surface) ? 'Gym' : /road|park|track|beach/i.test(surface) ? 'Outdoor' : 'Home';

export function buildCardioWorkout(opts: { id: string; date: string; minutes: number; rpe: number; detail: CardioDetail; notes?: string }): Workout {
  const { id, date, minutes, rpe, detail } = opts;
  const filled = { ...detail, ...completeCardio(minutes, detail.distanceKm, detail.speedKmh) };
  return {
    id, date, dayKey: getDayKeyFromDate(date),
    title: `${detail.timeOfDay} ${detail.activity === 'Other' ? 'cardio' : detail.activity.toLowerCase()}`,
    location: locationFor(detail.surface), sleepHours: null, restingHr: null, climate: 'Normal', notes: opts.notes ?? '',
    exercises: [{
      exerciseId: `cardio_${id}`, name: cardioName(detail), repMin: minutes, repMax: minutes, unit: 'min', targetRpe: rpe,
      cardio: filled, sets: [{ loadKg: 0, reps: minutes, rpe, pain: 0 }],
    }],
  };
}

export interface CardioEntry { workoutId: string; date: string; minutes: number; rpe: number | null; detail: CardioDetail }

export const cardioEntries = (workouts: Workout[]): CardioEntry[] =>
  workouts
    .flatMap((w) => w.exercises.filter((e) => e.cardio).map((e) => ({
      workoutId: w.id, date: w.date, minutes: e.sets.reduce((s, x) => s + x.reps, 0), rpe: e.sets[0]?.rpe ?? null, detail: e.cardio as CardioDetail,
    })))
    .sort((a, b) => a.date.localeCompare(b.date));

export const describeCardio = (c: CardioEntry) =>
  [`${c.minutes} min`, c.detail.distanceKm !== null ? `${c.detail.distanceKm} km` : null, c.detail.speedKmh !== null ? `${c.detail.speedKmh} km/h` : null]
    .filter(Boolean).join(' · ');
