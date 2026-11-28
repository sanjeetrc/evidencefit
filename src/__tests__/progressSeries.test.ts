import { describe, expect, it } from 'vitest';
import { buildProteinSeries, bucketFor, muscleBalance, rangeStart } from '../domain/progressSeries';

const item = (g: number) => [{ id: String(g), mealSlot: 'Lunch' as const, name: 'x', grams: g }];
const today = '2026-11-28';

describe('progress series', () => {
  it('4 weeks is daily, 28 points, gaps for unlogged days', () => {
    const s = buildProteinSeries({ '2026-11-28': item(100), '2026-11-27': item(60), '2026-10-01': item(500) }, today, '4w', 90);
    expect(s.bucket).toBe('day');
    expect(s.points).toHaveLength(28);
    expect(s.points.at(-1)!.grams).toBe(100);
    expect(s.points[0].grams).toBeNull();
    expect(s.avg).toBe(80);
    expect(s.daysMet).toBe(1);
  });
  it('3 months and 1 year roll up into weekly averages of logged days', () => {
    const s = buildProteinSeries({ '2026-11-24': item(100), '2026-11-25': item(60) }, today, '3m', 90);
    expect(s.bucket).toBe('week');
    expect(s.points.length).toBeLessThanOrEqual(15);
    expect(s.points.at(-1)!.grams).toBe(80);
    expect(buildProteinSeries({}, today, '1y', 90).points.length).toBeLessThanOrEqual(54);
  });
  it('All starts at the first log; long histories go monthly', () => {
    expect(rangeStart('all', today, '2026-11-01')).toBe('2026-11-01');
    expect(bucketFor(56)).toBe('day');
    expect(bucketFor(57)).toBe('week');
    expect(bucketFor(1000)).toBe('month');
    const s = buildProteinSeries({ '2023-01-05': item(50), [today]: item(100) }, today, 'all', 90);
    expect(s.bucket).toBe('month');
    expect(s.points.length).toBeLessThanOrEqual(48);
  });
  it('muscle balance counts sessions in range only', () => {
    const w = (date: string, muscles: string[]) => ({ date, muscles }) as never;
    const b = muscleBalance([w('2026-11-27', ['Legs']), w('2026-11-20', ['Legs', 'Core']), w('2026-06-01', ['Back'])], today, '4w');
    expect(b.sessions).toBe(2);
    expect(b.muscles[0]).toEqual(['Legs', 2]);
    expect(muscleBalance([w('2026-06-01', ['Back'])], today, '1y').sessions).toBe(1);
  });
});

import { buildCardioSeries } from '../domain/progressSeries';
import { buildWalkWorkout } from '../domain/walk';

describe('treadmill speed and incline', () => {
  it('walk card saves a treadmill walk with speed and incline, at the gym', () => {
    const w = buildWalkWorkout({ date: today, activity: 'Treadmill', place: 'Gym', time: 'Evening', minutes: 30, speedKmh: 5, distanceKm: null, weightKg: 84, inclinePct: 3 });
    expect(w.location).toBe('Gym');
    expect(w.entries[0].name).toBe('Evening treadmill walk (gym)');
    expect(w.entries[0].speedKmh).toBe(5);
    expect(w.entries[0].inclinePct).toBe(3);
    expect(w.notes).toBe('2.5 km');
    const flat = buildWalkWorkout({ date: today, activity: 'Treadmill', place: 'Gym', time: 'Evening', minutes: 30, speedKmh: 5, distanceKm: null, weightKg: 84, inclinePct: 0 });
    expect(w.estKcal).toBeGreaterThan(flat.estKcal);
    const road = buildWalkWorkout({ date: today, activity: 'Walk', place: 'Road', time: 'Evening', minutes: 30, speedKmh: 4.8, distanceKm: null, weightKg: 84 });
    expect(road.entries[0].inclinePct).toBeNull();
    expect(road.location).toBe('Outdoor');
  });
  it('cardio series averages speed and incline; last session reported', () => {
    const t = buildWalkWorkout({ date: '2026-11-27', activity: 'Treadmill', place: 'Gym', time: 'Evening', minutes: 20, speedKmh: 5, distanceKm: null, weightKg: 84, inclinePct: 4 });
    const r = buildWalkWorkout({ date: '2026-11-28', activity: 'Walk', place: 'Road', time: 'Evening', minutes: 30, speedKmh: 4.8, distanceKm: null, weightKg: 84 });
    const s = buildCardioSeries([t, r], today, '4w');
    expect(s.sessions).toBe(2);
    expect(s.minutes).toBe(50);
    expect(s.avgSpeed).toBe(4.9);
    expect(s.avgIncline).toBe(4);
    expect(s.last!.date).toBe('2026-11-28');
    expect(s.points.at(-2)!.incline).toBe(4);
  });
});
