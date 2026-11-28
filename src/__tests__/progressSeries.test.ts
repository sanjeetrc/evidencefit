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
