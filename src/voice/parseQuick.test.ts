import { describe, expect, it } from 'vitest';
import type { CircuitEntry } from '../types';
import { parseQuickText, replaceWordNums } from './parseQuick';

/** Parse one line (default unit = the profile default, lb) and return the only entry. */
const one = (text: string, unit: 'lb' | 'kg' = 'lb'): CircuitEntry => {
  const out = parseQuickText(text, unit);
  expect(out).toHaveLength(1);
  return out[0];
};
const pick = (e: CircuitEntry) => ({
  name: e.name, sets: e.sets, reps: e.reps, unit: e.unit, load: e.load, loadUnit: e.loadUnit, rir: e.rir,
  speedKmh: e.speedKmh ?? null, inclinePct: e.inclinePct ?? null,
});

describe('bare weight next to the name (sets and reps given)', () => {
  it('"chest press 50 3x10" → Chest press, 50 lb, 3×10', () => {
    expect(pick(one('chest press 50 3x10'))).toMatchObject({ name: 'Chest press', sets: 3, reps: 10, unit: 'reps', load: 50, loadUnit: 'lb' });
  });

  it('"lat pulldown 60 3 sets 12 reps" → Lat pulldown, 60 lb, 3×12', () => {
    expect(pick(one('lat pulldown 60 3 sets 12 reps'))).toMatchObject({ name: 'Lat pulldown', sets: 3, reps: 12, load: 60, loadUnit: 'lb' });
  });

  it('also after the sets/reps, with "at", "of" or a decimal', () => {
    expect(pick(one('chest press 3x10 50'))).toMatchObject({ name: 'Chest press', load: 50 });
    expect(pick(one('chest press at 50 3x10'))).toMatchObject({ name: 'Chest press', load: 50 });
    expect(pick(one('seated cable row 42.5 3 sets of 12'))).toMatchObject({ name: 'Seated cable row', sets: 3, reps: 12, load: 42.5 });
  });

  it('uses the profile default unit when it is kg', () => {
    expect(pick(one('chest press 50 3x10', 'kg'))).toMatchObject({ load: 50, loadUnit: 'kg' });
  });

  it('a unit that is said wins over the default', () => {
    expect(pick(one('chest press 20 kg 3x10'))).toMatchObject({ name: 'Chest press', load: 20, loadUnit: 'kg' });
  });

  it('never reads RIR, time or reps as the weight', () => {
    expect(pick(one('chest press 3x10 2 to fail'))).toMatchObject({ name: 'Chest press', load: null, rir: 2 });
    expect(pick(one('chest press 3x10 rir 2'))).toMatchObject({ name: 'Chest press', load: null, rir: 2 });
    expect(pick(one('lat pulldown 3 sets 12 reps'))).toMatchObject({ name: 'Lat pulldown', sets: 3, reps: 12, load: null });
    expect(pick(one('lat pulldown 3 sets of 12'))).toMatchObject({ name: 'Lat pulldown', sets: 3, reps: 12, load: null });
    expect(one('wall sit (90° isometric) 4x60 sec').load).toBeNull();
  });

  it('keeps the name stable so history matches', () => {
    expect(one('chest press 50 3x10').name).toBe(one('chest press 3x10').name);
  });
});

describe('numbers without sets and reps stay reps', () => {
  it('"60 push-ups" → Push-ups, 1×60, no load', () => {
    expect(pick(one('60 push-ups'))).toMatchObject({ name: 'Push-ups', sets: 1, reps: 60, load: null });
  });

  it('"push-ups 20" → Push-ups, 1×20, no load', () => {
    expect(pick(one('push-ups 20'))).toMatchObject({ name: 'Push-ups', sets: 1, reps: 20, load: null });
  });
});

describe('explicit unit and voice "22 fail"', () => {
  it('"leg press 100 lb 10 reps 22 fail 5 sets" → 5×10 @ 100 lb, 2 to fail', () => {
    expect(replaceWordNums('22 fail')).toBe('2 to fail');
    expect(pick(one('leg press 100 lb 10 reps 22 fail 5 sets'))).toMatchObject({
      name: 'Leg press', sets: 5, reps: 10, load: 100, loadUnit: 'lb', rir: 2,
    });
  });
});

describe('treadmill', () => {
  it('"treadmill 4 mph 20 min" → Treadmill, 20 min, 6.4 km/h', () => {
    expect(pick(one('treadmill 4 mph 20 min'))).toMatchObject({
      name: 'Treadmill', sets: 1, reps: 20, unit: 'min', speedKmh: 6.4, load: null,
    });
  });

  it('"treadmill 30 minutes speed 5.5 incline 8" → 30 min, 5.5 km/h, 8 %', () => {
    expect(pick(one('treadmill 30 minutes speed 5.5 incline 8'))).toMatchObject({
      name: 'Treadmill', reps: 30, unit: 'min', speedKmh: 5.5, inclinePct: 8,
    });
  });

  it('mph spellings: "speed 3 mph", "3.5 miles per hour"', () => {
    expect(one('treadmill speed 3 mph 25 min').speedKmh).toBe(4.8);
    expect(one('treadmill 3.5 miles per hour 25 min').speedKmh).toBe(5.6);
  });

  it('km/h still works', () => {
    expect(one('treadmill 5 kmph 25 min').speedKmh).toBe(5);
  });
});

describe('several exercises in one line', () => {
  it('splits and parses each', () => {
    const out = parseQuickText('chest press 50 3x10, lat pulldown 60 3 sets 12 reps, 60 push-ups');
    expect(out.map((e) => [e.name, e.sets, e.reps, e.load])).toEqual([
      ['Chest press', 3, 10, 50],
      ['Lat pulldown', 3, 12, 60],
      ['Push-ups', 1, 60, null],
    ]);
  });
});
