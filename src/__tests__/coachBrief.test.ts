// Ported from the throwaway rolldown scripts (see CLAUDE.md → Testing). Each check logs PASS/FAIL;
// the test fails if any check failed (the console output names which).
import { expect, it } from 'vitest';
import { buildCoachBrief, describeEntry } from '../domain/coachBrief';
import { createBlankProfile } from '../lib/storage';
import type { CircuitEntry, LoggedWorkout } from '../types';

it('Copy-for-Claude coach brief', async () => {
  let fail = 0;
  const has = (label: string, cond: boolean, detail = '') => { if (!cond) { fail++; console.log('FAIL', label, detail); } };
  const eq = (label: string, got: unknown, want: unknown) => has(label, JSON.stringify(got) === JSON.stringify(want), `\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`);

  const e = (p: Partial<CircuitEntry>): CircuitEntry => ({ id: 'x', name: 'X', sets: 3, reps: 10, unit: 'reps', load: null, loadUnit: 'kg', rir: null, pain: 0, ...p });
  eq('strength line', describeEntry(e({ name: 'Leg press', load: 100, loadUnit: 'lb', rir: 2 })), 'Leg press: 3×10 @ 100 lb, 2 to fail');
  eq('treadmill line', describeEntry(e({ name: 'Incline treadmill walk', sets: 1, reps: 25, unit: 'min', speedKmh: 4.5, inclinePct: 8 })), 'Incline treadmill walk: 25 min @ 4.5 km/h, 8% incline');
  eq('failure + pain', describeEntry(e({ name: 'Push-ups', reps: 15, rir: 0, pain: 4 })), 'Push-ups: 3×15, to failure — pain 4/10');
  eq('hold', describeEntry(e({ name: 'Wall sit', sets: 4, reps: 60, unit: 'sec' })), 'Wall sit: 4×60 sec');
  eq('bodyweight plain', describeEntry(e({ name: 'Surya Namaskar', sets: 4 })), 'Surya Namaskar: 4×10');

  const w = (date: string, entries: CircuitEntry[], extra: Partial<LoggedWorkout> = {}): LoggedWorkout => ({
    id: date, date, location: 'Gym', sleepHours: 7, climate: 'Normal', notes: '', entries, estKcal: 300, muscles: ['Quads', 'Glutes'], benefits: [], ...extra,
  });

  const p = createBlankProfile('Secret Name', 65, 72);
  p.conditions.hypertension = true;
  p.medications.statins = true;
  p.circuitLogs = [
    w('2026-11-24', [e({ name: 'Leg press', load: 100, loadUnit: 'lb', rir: 2 }), e({ name: 'Push-ups', reps: 15, rir: 0, pain: 4 })], { muscles: ['Quads', 'Glutes', 'Chest'], notes: 'shoulder  tight' }),
    w('2026-11-20', [e({ name: 'Treadmill', sets: 1, reps: 20, unit: 'min', speedKmh: 5, inclinePct: 0 })], { muscles: ['Cardio'], location: 'Home', climate: 'Hot/Humid', sleepHours: null }),
    w('2026-11-05', [e({ name: 'Old squat' })]), // outside 14, inside 28
    w('2026-11-30', [e({ name: 'Future thing' })]), // future
  ];
  p.proteinLogs = {
    '2026-11-24': [{ id: 'a', mealSlot: 'Lunch', name: 'Dal', grams: 60 }, { id: 'b', mealSlot: 'Dinner', name: 'Paneer', grams: 50 }],
    '2026-11-23': [{ id: 'c', mealSlot: 'Lunch', name: 'Eggs', grams: 70 }],
    '2026-10-01': [{ id: 'd', mealSlot: 'Lunch', name: 'Old', grams: 200 }],
  };

  const b14 = buildCoachBrief(p, { days: 14, includeHealth: true, today: '2026-11-25' });
  console.log(b14);
  console.log('-----');
  has('no profile name', !b14.includes('Secret Name'));
  has('profile line', b14.includes(`Age 65, weight 72 kg, 2 meals/day, protein target ${p.proteinTargetG} g/day`));
  has('conditions', b14.includes('- Conditions: High blood pressure'));
  has('meds', b14.includes('- Medications: Statins'));
  has('2 workouts in 14 days', b14.includes('— 2 workouts'));
  has('excludes old + future', !b14.includes('Old squat') && !b14.includes('Future thing'));
  has('newest first', b14.indexOf('Leg press') < b14.indexOf('Treadmill'));
  has('notes collapsed', b14.includes('Notes: "shoulder tight"'));
  has('hot/humid + no sleep', /Home · hot\/humid · ~300 kcal/.test(b14));
  has('muscle counts', b14.includes('Quads 1×') && b14.includes('Cardio 1×'));
  has('untrained', b14.includes('Not trained in 14 days: Hamstrings, Triceps, Back, Biceps, Shoulders, Core'));
  has('pain', b14.includes('Pain reported: Push-ups 4/10'));
  has('protein', b14.includes('average 90 g/day') && b14.includes('of 2 logged days'));
  has('ends with question', b14.endsWith('MY QUESTION:\n'));

  const b28 = buildCoachBrief(p, { days: 28, includeHealth: false, today: '2026-11-25' });
  has('28 days includes old', b28.includes('Old squat') && b28.includes('— 3 workouts'));
  has('health hidden', !b28.includes('Conditions') && !b28.includes('Statins'));

  const empty = buildCoachBrief(createBlankProfile(), { days: 14, includeHealth: true, today: '2026-11-25' });
  has('empty', empty.includes('No workouts logged in the last 14 days.') && empty.includes('Protein: not logged') && empty.includes('Conditions: none'));

  console.log(fail ? `${fail} FAILED` : 'ALL BRIEF TESTS PASSED');
  expect(fail, 'checks failed — see the FAIL lines above').toBe(0);
});
