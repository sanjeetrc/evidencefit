import { describe, expect, it } from 'vitest';
import { buildWalkWorkout, walkName } from '../domain/walk';
import { normalizeState, planWorkoutToCircuit } from '../lib/storage';

describe('evening walk logging', () => {
  it('names the walk and works out distance from speed', () => {
    expect(walkName('Walk', 'Road', 'Evening')).toBe('Evening walk (road)');
    const w = buildWalkWorkout({ date: '2026-11-28', activity: 'Walk', place: 'Road', time: 'Evening', minutes: 30, speedKmh: 4.8, distanceKm: null, weightKg: 84 });
    expect(w.location).toBe('Outdoor');
    expect(w.entries[0]).toMatchObject({ reps: 30, unit: 'min', speedKmh: 4.8, sets: 1 });
    expect(w.notes).toBe('2.4 km at 4.8 km/h');
    expect(w.muscles).toContain('Cardio');
    // ACSM level walking at 4.8 km/h ≈ 3.3 MET → ~140 kcal for 84 kg in 30 min
    expect(w.estKcal).toBeGreaterThan(120);
    expect(w.estKcal).toBeLessThan(160);
  });
  it('works out speed from distance', () => {
    const w = buildWalkWorkout({ date: '2026-11-28', activity: 'Walk', place: 'Park', time: 'Morning', minutes: 40, speedKmh: null, distanceKm: 3, weightKg: 70 });
    expect(w.entries[0].speedKmh).toBe(4.5);
  });
});

describe('data from the plan-based version still loads', () => {
  it('converts a session: sets counted, heaviest load, RIR = 10 − RPE, highest pain', () => {
    const c = planWorkoutToCircuit({ id: 'w', date: '2026-11-27', location: 'Rest', exercises: [
      { exerciseId: 'a', name: 'Leg press', unit: 'reps', loadUnit: 'lb', sets: [{ loadKg: 45.359237, reps: 10, rpe: 7, pain: 0 }, { loadKg: 0, reps: 0, rpe: null, pain: 0 }] },
    ] }) as { location: string; entries: { sets: number; load: number; loadUnit: string; rir: number }[] };
    expect(c.location).toBe('Home');
    expect(c.entries[0]).toMatchObject({ sets: 1, load: 100, loadUnit: 'lb', rir: 3 });
  });
  it('keeps circuit logs and converted sessions without duplicates', () => {
    const s = normalizeState({ version: 2, activeProfileId: 'p', profiles: [{ id: 'p', name: 'X', age: 66, weightKg: 74,
      circuitLogs: [{ id: 'same', date: '2026-11-26', location: 'Gym', entries: [{ id: 'e', name: 'Row', sets: 3, load: 50, loadUnit: 'lb', reps: 12, unit: 'reps', rir: 2, pain: 0 }] }],
      workouts: [{ id: 'same', date: '2026-11-26', exercises: [{ name: 'Row', sets: [{ loadKg: 20, reps: 12 }] }] },
        { id: 'new', date: '2026-11-27', exercises: [{ name: 'Plank', unit: 'sec', sets: [{ loadKg: 0, reps: 30 }] }] }] }] });
    expect(s?.profiles[0].circuitLogs.map((w) => w.id)).toEqual(['same', 'new']);
  });
});

