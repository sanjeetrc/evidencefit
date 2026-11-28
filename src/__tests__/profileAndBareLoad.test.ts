// Ported from the throwaway rolldown scripts (see CLAUDE.md → Testing). Each check logs PASS/FAIL;
// the test fails if any check failed (the console output names which).
import { expect, it } from 'vitest';
import { parseQuickText } from '../voice/parseQuick';
import { normalizeState, createFreshState } from '../lib/storage';

it('bare-number load and profile range repair', async () => {
  let fails = 0;
  const eq = (label: string, got: unknown, want: unknown) => {
    const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok ? '' : `\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`}`);
  };
  const p = (t: string, u: 'lb' | 'kg' = 'lb') => { const e = parseQuickText(t, u)[0]; return [e.name, e.sets, e.reps, e.load, e.loadUnit, e.rir]; };
  eq('reviewer probe', p('chest press 50 3x10'), ['Chest press', 3, 10, 50, 'lb', null]);
  eq('number after sxr', p('chest press 3x10 50'), ['Chest press', 3, 10, 50, 'lb', null]);
  eq('"at 50"', p('chest press at 50 3x10'), ['Chest press', 3, 10, 50, 'lb', null]);
  eq('"@ 42.5"', p('lat pulldown 3x12 @ 42.5'), ['Lat pulldown', 3, 12, 42.5, 'lb', null]);
  eq('kg default', p('chest press 50 3x10', 'kg'), ['Chest press', 3, 10, 50, 'kg', null]);
  eq('explicit kg wins', p('chest press 50 kg 3x10'), ['Chest press', 3, 10, 50, 'kg', null]);
  eq('rir not load', p('chest press 3x10 2 to fail'), ['Chest press', 3, 10, null, 'lb', 2]);
  eq('rir before sxr', p('chest press 2 to fail 3x10'), ['Chest press', 3, 10, null, 'lb', 2]);
  eq('rir N', p('chest press 3x10 rir 2'), ['Chest press', 3, 10, null, 'lb', 2]);
  eq('load + rir', p('leg press 100 3x10 2 to fail'), ['Leg press', 3, 10, 100, 'lb', 2]);
  eq('wall sit degrees', p('wall sit (90° isometric) 4x60 sec')[3], null);
  eq('no sxr: trailing reps unchanged', p('push-ups 20'), ['Push-ups', 1, 20, null, 'lb', null]);
  eq('no sxr: leading reps unchanged', p('60 push-ups'), ['Push-ups', 1, 60, null, 'lb', null]);
  eq('plain 3x10', p('leg press 3x10'), ['Leg press', 3, 10, null, 'lb', null]);
  eq('treadmill untouched', parseQuickText('treadmill 25 min speed 5 incline 8')[0].load, null);
  eq('two exercises', parseQuickText('chest press 50 3x10, lat pulldown 60 3x12').map((e) => [e.name, e.load]), [['Chest press', 50], ['Lat pulldown', 60]]);
  // profile healing
  const s = createFreshState('T', 66, 70) as any;
  s.profiles[0].age = 6072; s.profiles[0].weightKg = 7068; s.profiles[0].proteinTargetG = 8099;
  const h = normalizeState(JSON.parse(JSON.stringify(s)))!.profiles[0];
  eq('corrupt age/weight/target healed', [h.age, h.weightKg, h.proteinTargetG], [65, 72, 101]);
  s.profiles[0].age = 72; s.profiles[0].weightKg = 68.4; s.profiles[0].proteinTargetG = 95;
  const g = normalizeState(JSON.parse(JSON.stringify(s)))!.profiles[0];
  eq('valid values kept', [g.age, g.weightKg, g.proteinTargetG], [72, 68.4, 95]);
  console.log(fails ? `\n${fails} FAILED` : '\nALL BARE-LOAD TESTS PASSED');
  expect(fails, 'checks failed — see the FAIL lines above').toBe(0);
});
