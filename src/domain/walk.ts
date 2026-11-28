import { analyseCircuit } from './exercise';
import { uid } from '../lib/ids';
import type { CircuitEntry, LoggedWorkout } from '../types';

/** Walks and other cardio done outside a gym circuit, e.g. an evening road walk at 4.8 km/h. */
export const WALK_ACTIVITIES = ['Walk', 'Treadmill', 'Cycle', 'Other'] as const;
export const WALK_PLACES = ['Road', 'Park', 'Beach', 'Track', 'Indoors'] as const;
export const TREADMILL_PLACES = ['Gym', 'Home'] as const;
export const TIMES_OF_DAY = ['Morning', 'Afternoon', 'Evening'] as const;
export type WalkActivity = (typeof WALK_ACTIVITIES)[number];
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

export const timeOfDayNow = (d = new Date()): TimeOfDay => (d.getHours() < 12 ? 'Morning' : d.getHours() < 17 ? 'Afternoon' : 'Evening');

/** "Evening walk (road)". The name is what the progress charts and the coach see. */
export const walkName = (activity: WalkActivity, place: string, time: TimeOfDay) =>
  activity === 'Treadmill' ? `${time} treadmill walk (${place.toLowerCase()})`
    : `${time} ${activity === 'Other' ? 'cardio' : activity.toLowerCase()} (${place.toLowerCase()})`;

/** Matches sessions saved by the walk card, so the card can list and delete them. */
export const isWalkCardSession = (w: LoggedWorkout) => w.entries.length === 1 && / (walk|cycle|cardio) \(/.test(w.entries[0].name);

export interface WalkInput {
  date: string; activity: WalkActivity; place: string; time: TimeOfDay;
  minutes: number; speedKmh: number | null; distanceKm: number | null; weightKg: number;
  /** Treadmill only. */
  inclinePct?: number | null;
}

/** Builds the saved session. Speed comes from distance ÷ time when only distance is given. */
export function buildWalkWorkout(w: WalkInput): LoggedWorkout {
  const speed = w.speedKmh ?? (w.distanceKm && w.minutes ? Math.round((w.distanceKm / (w.minutes / 60)) * 10) / 10 : null);
  const km = w.distanceKm ?? (speed ? Math.round(speed * (w.minutes / 60) * 10) / 10 : null);
  const entry: CircuitEntry = {
    id: uid(), name: walkName(w.activity, w.place, w.time), sets: 1, load: null, loadUnit: 'kg',
    reps: w.minutes, unit: 'min', rir: null, pain: 0, speedKmh: speed,
    inclinePct: w.activity === 'Treadmill' ? (w.inclinePct ?? 0) : null,
  };
  const a = analyseCircuit([entry], w.weightKg);
  return {
    id: uid(), date: w.date, location: w.activity === 'Treadmill' ? (w.place === 'Home' ? 'Home' : 'Gym') : 'Outdoor', sleepHours: null, climate: 'Normal',
    // Speed and incline are already on the entry and shown with it; the note keeps the distance.
    notes: km ? `${km} km` : '',
    entries: [entry], estKcal: a.estKcal, muscles: a.muscles, benefits: a.benefits,
  };
}

