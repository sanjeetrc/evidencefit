import { describe, expect, it } from 'vitest';
import { createBlankProfile } from './state';
import { regionsOf, suggestFocus } from './focus';
import type { Workout } from './types';

const session = (date: string, names: string[]): Workout => ({
  id: date, date, dayKey: 'Mon', title: 'x', location: 'Gym', sleepHours: null, restingHr: null, climate: 'Normal', notes: '',
  exercises: names.map((n) => ({ exerciseId: n, name: n, repMin: 10, repMax: 10, unit: 'reps', targetRpe: 7, sets: [{ loadKg: 20, reps: 10, rpe: 7, pain: 0 }] })),
});

describe('AC-20 next suggested focus', () => {
  it('maps exercises to muscle groups', () => {
    expect(regionsOf('Leg press')).toEqual(['Legs']);
    expect(regionsOf('Seated cable row')).toEqual(['Pull']);
    expect(regionsOf('Push-ups (incline or knee as needed)')).toEqual(['Push']);
    expect(regionsOf('Leg curl')).toEqual(['Legs']);
    expect(regionsOf('Treadmill walk')).toEqual([]);
  });

  it('nothing in the last 48 hours: full body', () => {
    const p = createBlankProfile('T', 66, 74);
    p.workouts = [session('2026-11-25', ['Leg press', 'Seated cable row', 'Push-ups'])];
    expect(suggestFocus(p, '2026-11-28').headline).toMatch(/^Full-body/);
  });

  it('legs and push yesterday: back and easy cardio', () => {
    const p = createBlankProfile('T', 66, 74);
    p.workouts = [session('2026-11-27', ['Leg press', 'Push-ups'])];
    const f = suggestFocus(p, '2026-11-28');
    expect(f.headline).toMatch(/^Back \(pull\)/);
    expect(f.since.Legs).toBe(1);
  });

  it('legs only: upper body; upper only: lower body; all: active recovery', () => {
    const p = createBlankProfile('T', 66, 74);
    p.workouts = [session('2026-11-28', ['Leg press'])];
    expect(suggestFocus(p, '2026-11-28').headline).toMatch(/^Upper body/);
    p.workouts = [session('2026-11-27', ['Seated cable row'])];
    expect(suggestFocus(p, '2026-11-28').headline).toMatch(/^Lower body/);
    p.workouts = [session('2026-11-27', ['Leg press', 'Push-ups', 'Seated cable row'])];
    expect(suggestFocus(p, '2026-11-28').headline).toMatch(/^Active recovery/);
  });
});
