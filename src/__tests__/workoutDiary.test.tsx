// Ported from the throwaway rolldown scripts (see CLAUDE.md → Testing). Each check logs PASS/FAIL;
// the test fails if any check failed (the console output names which).
import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import WorkoutDiary from '../features/progress/WorkoutDiary';
import { createBlankProfile } from '../lib/storage';
import { daysAgoISO } from '../lib/dates';

it('Workout diary rendering', async () => {
  let fail = 0;
  const has = (l: string, c: boolean) => { if (!c) { fail++; console.log('FAIL', l); } };
  const e = (name: string, extra = {}) => ({ id: name, name, sets: 3, reps: 10, unit: 'reps' as const, load: null, loadUnit: 'kg' as const, rir: null, pain: 0, ...extra });
  const w = (id: string, date: string, entries: ReturnType<typeof e>[], extra = {}) => ({ id, date, location: 'Gym' as const, sleepHours: null, climate: 'Normal' as const, notes: '', entries, estKcal: 150, muscles: [], benefits: [], ...extra });
  const p = createBlankProfile();
  const t = daysAgoISO(0), y = daysAgoISO(1), old = daysAgoISO(5);
  // Saved out of date order on purpose (backfilled day)
  p.circuitLogs = [w('a', old, [e('Plank')]), w('b', t, [e('Leg press', { load: 100, loadUnit: 'lb', rir: 2 })], { notes: 'felt good' }), w('c', y, [e('Treadmill', { sets: 1, reps: 20, unit: 'min', speedKmh: 5, inclinePct: 6 })], { location: 'Home', sleepHours: 7 }), w('d', t, [e('Push-ups')])];
  p.proteinLogs = { [t]: [{ id: 'x', mealSlot: 'Lunch', name: 'Dal', grams: 40 }] };
  p.safetyChecks = { [t]: { at: 'z', flags: [] }, [y]: { at: 'z', flags: ['calf'] } };
  const html = renderToStaticMarkup(<WorkoutDiary profile={p} updateProfile={() => {}} />);
  const text = html.replace(/<[^>]+>/g, '\n').replace(/&#x27;|&quot;/g, "'").split('\n').map((s) => s.trim()).filter(Boolean).join(' | ');
  console.log(text);
  has('3 days logged', text.includes('3 days logged'));
  has('newest day first', text.indexOf('· today') < text.indexOf('· yesterday') && text.indexOf('· yesterday') < text.indexOf('· 5 days ago'));
  has('same day both circuits', text.includes('Leg press: 3×10 @ 100 lb, 2 to fail') && text.includes('Push-ups: 3×10'));
  has('day kcal summed', text.includes('~300 kcal'));
  has('treadmill line', text.includes('Treadmill: 20 min @ 5 km/h, 6% incline'));
  has('notes', text.includes('Note: felt good'));
  has('protein', text.includes('40 g') && text.includes('not logged'));
  has('safety', text.includes('clear') && text.includes('Calf pain when walking') && !text.includes('not done'));
  const empty = renderToStaticMarkup(<WorkoutDiary profile={createBlankProfile()} updateProfile={() => {}} />);
  has('empty state', empty.includes('No workouts saved yet'));
  console.log(fail ? `${fail} FAILED` : 'ALL DIARY TESTS PASSED');
  expect(fail, 'checks failed — see the FAIL lines above').toBe(0);
});
