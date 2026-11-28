import { describe, expect, it } from 'vitest';
import { buildCardioWorkout, cardioEntries, completeCardio, describeCardio, maxSpeedKmh, timeOfDayNow } from './cardio';
import { runAudit } from './engine';
import { createBlankProfile, parseState } from './state';
import { workoutsCsv } from './csv';

const TODAY = '2026-11-28';
const walk = (id: string, date: string, minutes: number, speedKmh: number | null, distanceKm: number | null = null) =>
  buildCardioWorkout({ id, date, minutes, rpe: 4, detail: { activity: 'Walk', surface: 'Road', timeOfDay: 'Evening', distanceKm, speedKmh } });

describe('AC-16 walks and cardio', () => {
  it('AC-16.1 speed gives distance, distance gives speed', () => {
    expect(completeCardio(30, null, 4.8)).toEqual({ distanceKm: 2.4, speedKmh: 4.8 });
    expect(completeCardio(45, 3.6, null)).toEqual({ distanceKm: 3.6, speedKmh: 4.8 });
    expect(completeCardio(30, null, null)).toEqual({ distanceKm: null, speedKmh: null });
    expect(maxSpeedKmh('Walk')).toBeLessThan(10);
  });
  it('AC-16.2 an evening road walk is saved with its details and reads naturally', () => {
    const w = walk('a', TODAY, 30, 4.8);
    expect(w.title).toBe('Evening walk');
    expect(w.location).toBe('Outdoor');
    expect(w.exercises[0].name).toBe('Walk, road (evening)');
    const [c] = cardioEntries([w]);
    expect(describeCardio(c)).toBe('30 min · 2.4 km · 4.8 km/h');
  });
  it('AC-16.3 walks count toward weekly aerobic minutes and never trigger "ready to progress"', () => {
    const p = { ...createBlankProfile('T', 66, 74), workouts: [walk('a', '2026-11-25', 30, 4.8), walk('b', '2026-11-27', 30, 4.9), walk('c', TODAY, 40, 5)] };
    const a = runAudit(p, TODAY);
    expect(a.aerobicMinutes7d).toBe(100);
    expect(a.progressionReady).toHaveLength(0);
  });
  it('AC-16.4 cardio details survive a reload and reach the CSV; junk is repaired', () => {
    const good = walk('a', TODAY, 30, 4.8);
    const bad = { ...walk('b', TODAY, 20, null), id: 'b' };
    (bad.exercises[0] as unknown as { cardio: unknown }).cardio = { activity: 'Fly', timeOfDay: 'Midnight', speedKmh: 'x' };
    const r = parseState({ version: 2, profiles: [{ name: 'T', workouts: [good, bad] }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [g, b] = r.state.profiles[0].workouts;
    expect(g.exercises[0].cardio).toEqual({ activity: 'Walk', surface: 'Road', timeOfDay: 'Evening', distanceKm: 2.4, speedKmh: 4.8 });
    expect(b.exercises[0].cardio).toMatchObject({ activity: 'Walk', timeOfDay: 'Morning', speedKmh: null });
    const csv = workoutsCsv(r.state.profiles[0]);
    expect(csv.split('\n')[0]).toContain('SpeedKmh');
    expect(csv).toContain('Walk,Road,Evening,2.4,4.8');
  });
  it('AC-16.5 time of day defaults from the clock', () => {
    expect(timeOfDayNow(new Date('2026-11-28T07:00:00'))).toBe('Morning');
    expect(timeOfDayNow(new Date('2026-11-28T18:30:00'))).toBe('Evening');
  });
});
