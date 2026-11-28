import { describe, expect, it } from 'vitest';
import { circuitToWorkout, parseCircuitText, wordsToNumbers } from './circuitParser';

const KNOWN = ['Leg press', 'Seated cable row', 'Biceps curl (each arm)', 'Treadmill walk', 'Push-ups', 'Plank'];

describe('AC-18 circuit typed or dictated', () => {
  it('turns spoken numbers into digits', () => {
    expect(wordsToNumbers('three sets of twelve at forty kg')).toBe('3 sets of 12 at 40 kg');
    expect(wordsToNumbers('four point eight km per hour')).toBe('4.8 km per hour');
    expect(wordsToNumbers('one hundred twenty seconds')).toBe('120 seconds');
  });

  it('reads a typed circuit with commas, x and RIR', () => {
    const r = parseCircuitText('Leg press 40 kg 3x12 RIR 2, seated row 25kg 3 by 10, plank 3 x 30 sec', KNOWN);
    expect(r.incomplete).toEqual([]);
    expect(r.entries.map((e) => e.name)).toEqual(['Leg press', 'Seated cable row', 'Plank']);
    expect(r.entries[0]).toMatchObject({ sets: 3, reps: 12, load: 40, loadUnit: 'kg', rpe: 8, unit: 'reps' });
    expect(r.entries[1]).toMatchObject({ sets: 3, reps: 10, load: 25 });
    expect(r.entries[2]).toMatchObject({ sets: 3, reps: 30, unit: 'sec', load: null });
  });

  it('reads a dictated circuit with no punctuation', () => {
    const r = parseCircuitText('treadmill twenty minutes four point three km per hour incline one then leg press three sets of twelve at ninety pounds pain two then push ups ten', KNOWN);
    expect(r.entries).toHaveLength(3);
    expect(r.entries[0]).toMatchObject({ name: 'Treadmill walk', reps: 20, unit: 'min', speedKmh: 4.3, inclinePct: 1 });
    expect(r.entries[1]).toMatchObject({ name: 'Leg press', sets: 3, reps: 12, load: 90, loadUnit: 'lb', pain: 2 });
    expect(r.entries[2]).toMatchObject({ name: 'Push-ups', sets: 1, reps: 10 });
  });

  it('splits on "and" between exercises but not inside one', () => {
    const r = parseCircuitText('biceps curl 8 kg 2 by 12 and plank 45 seconds', KNOWN);
    expect(r.entries.map((e) => e.name)).toEqual(['Biceps curl (each arm)', 'Plank']);
    const r2 = parseCircuitText('leg press 3 by 12 and RIR 3', KNOWN);
    expect(r2.entries).toHaveLength(1);
    expect(r2.entries[0].rpe).toBe(7);
  });

  it('keeps unknown names and flags pieces without reps or time', () => {
    const r = parseCircuitText('farmer carry 2 x 40 metres\nhip thrust', KNOWN);
    expect(r.entries[0].name).toMatch(/^Farmer carry/);
    expect(r.incomplete.map((e) => e.name)).toEqual(['Hip thrust']);
  });

  it('builds a session in kg on the chosen day', () => {
    const r = parseCircuitText('leg press 90 lb 3x12 rpe 7', KNOWN);
    const w = circuitToWorkout(r.entries, { date: '2026-11-26', location: 'Gym' });
    expect(w.date).toBe('2026-11-26');
    expect(w.dayKey).toBe('Thu');
    expect(w.exercises[0].sets).toHaveLength(3);
    expect(w.exercises[0].sets[0].loadKg).toBeCloseTo(40.823, 2);
    expect(w.exercises[0].sets[0].rpe).toBe(7);
  });
});

import { parseState } from './state';
describe('AC-19 before-you-train check is kept and cleaned', () => {
  it('keeps known warning signs per day and drops anything else', () => {
    const r = parseState({ version: 2, profiles: [{ id: 'p', name: 'X', safetyChecks: {
      '2026-11-26': { at: '2026-11-26T07:38:39.507Z', flags: [] },
      '2026-11-28': { at: '2026-11-28T04:27:53.789Z', flags: ['dizziness', 'made-up', 'dizziness'] },
      'not-a-date': { at: 'x', flags: ['chestDiscomfort'] },
    } }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const checks = r.state.profiles[0].safetyChecks ?? {};
    expect(Object.keys(checks)).toEqual(['2026-11-26', '2026-11-28']);
    expect(checks['2026-11-28'].flags).toEqual(['dizziness']);
  });
});
