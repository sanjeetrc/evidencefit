// Ported from the throwaway rolldown scripts (see CLAUDE.md → Testing). Each check logs PASS/FAIL;
// the test fails if any check failed (the console output names which).
import { expect, it } from 'vitest';
import { estimateEntryKcal, treadmillMet } from '../domain/exercise';
import { entryForExercise, entrySummary } from '../domain/exerciseLibrary';
import { normalizeEntry } from '../lib/storage';
import { buildGuidedEntry, guidedProgress, interpretGuidedStep, nextGuidedStep, parseInclineAnswer, parseSpeedAnswer } from '../voice/guided';
import { parseQuickText } from '../voice/parseQuick';

it('treadmill speed/incline/calories', async () => {
  let fail = 0;
  const eq = (label: string, got: unknown, want: unknown) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) { fail++; console.log('FAIL', label, '\n   got ', JSON.stringify(got), '\n   want', JSON.stringify(want)); }
  };

  // Speech parsing
  const sp: [string, number | null][] = [
    ['5', 5], ['5.5', 5.5], ['five point five', 5.5], ['5 point 5', 5.5], ['five and a half', 5.5], ['55', 5.5],
    ['5 kilometres per hour', 5], ['speed 6', 6], ['3 miles per hour', 4.8], ['skip', null], ['', null], ['6 km/h', 6],
  ];
  for (const [s, w] of sp) eq(`speed "${s}"`, parseSpeedAnswer(s), w);
  const inc: [string, number | null][] = [['8', 8], ['incline 8', 8], ['eight percent', 8], ['flat', 0], ['zero', 0], ['no incline', 0], ['12.5', 12.5], ['skip', null], ['50', null]];
  for (const [s, w] of inc) eq(`incline "${s}"`, parseInclineAnswer(s), w);

  // Route
  eq('treadmill route', [nextGuidedStep(0, { name: 'Treadmill' }), nextGuidedStep(5, { name: 'Treadmill' }), nextGuidedStep(6, { name: 'Treadmill' }), nextGuidedStep(3, { name: 'Treadmill' })], [5, 6, 3, null]);
  eq('standard route', [nextGuidedStep(0, { name: 'Leg press' }), nextGuidedStep(3, { name: 'Leg press' }), nextGuidedStep(4, { name: 'Leg press' })], [1, 4, null]);
  eq('progress', [guidedProgress(6, { name: 'Incline treadmill walk' }), guidedProgress(2, { name: 'Leg press' })], [{ n: 3, total: 4 }, { n: 3, total: 5 }]);

  // Full guided treadmill run
  let d = interpretGuidedStep(0, 'incline treadmill', {});
  d = interpretGuidedStep(5, 'five point five', d);
  d = interpretGuidedStep(6, 'incline 10', d);
  d = interpretGuidedStep(3, '25', d);
  const g = buildGuidedEntry(d);
  eq('guided treadmill entry', [g.name, g.sets, g.reps, g.unit, g.load, g.rir, g.speedKmh, g.inclinePct], ['Incline treadmill walk', 1, 25, 'min', null, null, 5.5, 10]);
  eq('guided "half an hour"-ish: 1 hour', interpretGuidedStep(3, '1 hour', { name: 'Treadmill' }).reps, 60);
  const lp = buildGuidedEntry({ name: 'Leg press', sets: 3, reps: 10, load: 100, loadUnit: 'lb', rir: 2 });
  eq('non-treadmill has no extras', 'speedKmh' in lp || 'inclinePct' in lp, false);

  // Quick text
  const q = parseQuickText('treadmill 25 min 5.5 kmph incline 8, leg press 3x10 100 lb');
  eq('quick treadmill', [q[0].name, q[0].reps, q[0].unit, q[0].speedKmh, q[0].inclinePct, q[0].rir], ['Treadmill', 25, 'min', 5.5, 8, null]);
  eq('quick leg press untouched', [q[1].name, q[1].sets, q[1].reps, q[1].load, 'speedKmh' in q[1]], ['Leg press', 3, 10, 100, false]);
  const q2 = parseQuickText('incline treadmill walk 30 minutes speed 4.5 at 12%');
  eq('quick incline walk', [q2[0].name, q2[0].reps, q2[0].speedKmh, q2[0].inclinePct], ['Incline treadmill walk', 30, 4.5, 12]);
  const q3 = parseQuickText('treadmill 20');
  eq('bare number = minutes', [q3[0].reps, q3[0].unit], [20, 'min']);

  // Storage: old entries unchanged, new fields kept & clamped
  const old = { id: 'a', name: 'Leg press', sets: 3, load: 100, loadUnit: 'lb', reps: 10, unit: 'reps', rir: 2, pain: 0 };
  eq('old entry shape unchanged', normalizeEntry(old), old);
  eq('treadmill fields kept', normalizeEntry({ ...old, name: 'Treadmill', speedKmh: '5.55', inclinePct: 40 }), { ...old, name: 'Treadmill', speedKmh: 5.6, inclinePct: 30 });

  // Calories (70 kg, 30 min) — ACSM
  const kc = (speedKmh: number | undefined, inclinePct: number | undefined) =>
    estimateEntryKcal({ id: 'x', name: 'Treadmill', sets: 1, reps: 30, unit: 'min', load: null, loadUnit: 'kg', rir: null, pain: 0, speedKmh, inclinePct }, 70);
  console.log('MET 5 km/h flat', treadmillMet(5, 0).toFixed(2), '| 5 km/h 10%', treadmillMet(5, 10).toFixed(2), '| 4.5 km/h 8%', treadmillMet(4.5, 8).toFixed(2), '| 8 km/h flat', treadmillMet(8, 0).toFixed(2), '| 10 km/h 2%', treadmillMet(10, 2).toFixed(2));
  console.log('kcal 70kg 30min: no speed', kc(undefined, undefined), '| 5/0', kc(5, 0), '| 5/10', kc(5, 10), '| 4.5/8', kc(4.5, 8), '| 8/0', kc(8, 0));
  eq('steeper burns more', kc(5, 10) > kc(5, 0), true);
  eq('faster burns more', kc(8, 0) > kc(5, 0), true);

  // Quick-Add defaults & summary
  const t = entryForExercise('Incline treadmill walk', []);
  eq('quick-add defaults', [t.speedKmh, t.inclinePct, t.unit], [4.5, 8, 'min']);
  eq('summary', entrySummary(t), '25 min · 4.5 km/h · 8% incline');
  eq('summary strength', entrySummary(lp), '3×10 · 100 lb');

  console.log(fail ? `${fail} FAILED` : 'ALL TREADMILL TESTS PASSED');
  expect(fail, 'checks failed — see the FAIL lines above').toBe(0);
});
