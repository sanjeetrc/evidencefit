import { analyseCircuit } from './exercise';
import { uid } from '../lib/ids';
import type { CircuitEntry, LoggedWorkout } from '../types';

/** Walks and other cardio done outside a gym circuit, e.g. an evening road walk at 4.8 km/h. */
export const WALK_ACTIVITIES = ['Walk', 'Cycle', 'Other'] as const;
export const WALK_PLACES = ['Road', 'Park', 'Beach', 'Track', 'Indoors'] as const;
export const TIMES_OF_DAY = ['Morning', 'Afternoon', 'Evening'] as const;
export type WalkActivity = (typeof WALK_ACTIVITIES)[number];
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

export const timeOfDayNow = (d = new Date()): TimeOfDay => (d.getHours() < 12 ? 'Morning' : d.getHours() < 17 ? 'Afternoon' : 'Evening');

/** "Evening walk (road)". The name is what the progress charts and the coach see. */
export const walkName = (activity: WalkActivity, place: string, time: TimeOfDay) =>
  `${time} ${activity === 'Other' ? 'cardio' : activity.toLowerCase()} (${place.toLowerCase()})`;

export interface WalkInput {
  date: string; activity: WalkActivity; place: string; time: TimeOfDay;
  minutes: number; speedKmh: number | null; distanceKm: number | null; weightKg: number;
}

/** Builds the saved session. Speed comes from distance ÷ time when only distance is given. */
export function buildWalkWorkout(w: WalkInput): LoggedWorkout {
  const speed = w.speedKmh ?? (w.distanceKm && w.minutes ? Math.round((w.distanceKm / (w.minutes / 60)) * 10) / 10 : null);
  const km = w.distanceKm ?? (speed ? Math.round(speed * (w.minutes / 60) * 10) / 10 : null);
  const entry: CircuitEntry = {
    id: uid(), name: walkName(w.activity, w.place, w.time), sets: 1, load: null, loadUnit: 'kg',
    reps: w.minutes, unit: 'min', rir: null, pain: 0, speedKmh: speed, inclinePct: null,
  };
  const a = analyseCircuit([entry], w.weightKg);
  return {
    id: uid(), date: w.date, location: 'Outdoor', sleepHours: null, climate: 'Normal',
    notes: [km ? `${km} km` : '', speed ? `${speed} km/h` : ''].filter(Boolean).join(' at '),
    entries: [entry], estKcal: a.estKcal, muscles: a.muscles, benefits: a.benefits,
  };
}

