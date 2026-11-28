// Ported from the throwaway rolldown scripts (see CLAUDE.md → Testing). Each check logs PASS/FAIL;
// the test fails if any check failed (the console output names which).
import { expect, it } from 'vitest';
import { createFreshState, normalizeState, normalizeEntry, countKgEntries, relabelLoadsAsLb } from '../lib/storage';
import { parseQuickText } from '../voice/parseQuick';
import { interpretGuidedStep, buildGuidedEntry } from '../voice/guided';
import { entryForExercise, EXERCISE_LIBRARY } from '../domain/exerciseLibrary';
import { QUICK_PRESETS } from '../domain/exercise';
import { parseQuickWithAI } from '../ai';

it('lb default weight unit and "Mark all as lb"', async () => {
  let fails = 0;
  const eq = (label: string, got: unknown, want: unknown) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) fails++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok ? '' : `\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`}`);
  };

  // --- Profile setting ---
  const fresh = createFreshState('T', 66, 70);
  eq('new profile defaults to lb', fresh.profiles[0].defaultLoadUnit, 'lb');
  const oldRaw = JSON.parse(JSON.stringify(fresh));
  delete oldRaw.profiles[0].defaultLoadUnit;
  eq('older data (field missing) → lb', normalizeState(oldRaw)!.profiles[0].defaultLoadUnit, 'lb');
  oldRaw.profiles[0].defaultLoadUnit = 'kg';
  eq('kg setting kept', normalizeState(oldRaw)!.profiles[0].defaultLoadUnit, 'kg');
  oldRaw.profiles[0].defaultLoadUnit = 'stone';
  eq('junk setting → lb', normalizeState(oldRaw)!.profiles[0].defaultLoadUnit, 'lb');

  // --- Stored entries keep their unit ---
  eq('stored kg entry stays kg', normalizeEntry({ name: 'Row', loadUnit: 'kg', load: 10 })!.loadUnit, 'kg');
  eq('stored lb entry stays lb', normalizeEntry({ name: 'Row', loadUnit: 'lb', load: 10 })!.loadUnit, 'lb');
  eq('missing unit → lb', normalizeEntry({ name: 'Row', load: 10 })!.loadUnit, 'lb');
  eq('missing unit with kg default → kg', normalizeEntry({ name: 'Row', load: 10 }, 'kg')!.loadUnit, 'kg');

  // --- Library & presets ---
  eq('library entries have no fixed unit', EXERCISE_LIBRARY.some((x) => 'loadUnit' in x), false);
  eq('presets have no fixed unit', QUICK_PRESETS.some((x) => 'loadUnit' in x), false);
  eq('library exercise → lb', entryForExercise('Dumbbell row', []).loadUnit, 'lb');
  eq('library exercise with kg setting → kg', entryForExercise('Leg press', [], 'kg').loadUnit, 'kg');
  eq('custom exercise → lb', entryForExercise('Zercher thing', []).loadUnit, 'lb');
  const hist = [{ name: 'Leg press', count: 1, lastDate: '2026-11-20', last: { id: 'a', name: 'Leg press', sets: 3, reps: 10, unit: 'reps' as const, load: 40, loadUnit: 'kg' as const, rir: 2, pain: 0 } }];
  eq('repeat exercise keeps last time\'s unit', entryForExercise('Leg press', hist as never, 'lb').loadUnit, 'kg');

  // --- Typed / offline voice parser ---
  eq('typed "leg press 3x10 100" → lb', parseQuickText('leg press 3x10')[0].loadUnit, 'lb');
  eq('typed with "100 kg" → kg', parseQuickText('leg press 3x10 100 kg')[0].loadUnit, 'kg');
  eq('typed with "100 lbs" → lb (kg default)', parseQuickText('leg press 3x10 100 lbs', 'kg')[0].loadUnit, 'lb');
  eq('typed no unit, kg default → kg', parseQuickText('push-ups 20', 'kg')[0].loadUnit, 'kg');

  // --- Guided voice ---
  eq('guided weight "40" → lb', interpretGuidedStep(1, '40', {}).loadUnit, 'lb');
  eq('guided weight "40 kg" → kg', interpretGuidedStep(1, '40 kg', {}).loadUnit, 'kg');
  eq('guided weight "40 kilos" → kg', interpretGuidedStep(1, '40 kilos', {}).loadUnit, 'kg');
  eq('guided weight "40 pounds" (kg default) → lb', interpretGuidedStep(1, '40 pounds', {}, [], 'kg').loadUnit, 'lb');
  eq('guided weight "40" (kg default) → kg', interpretGuidedStep(1, '40', {}, [], 'kg').loadUnit, 'kg');
  eq('guided entry, weight skipped → lb', buildGuidedEntry({ name: 'Push-ups' }).loadUnit, 'lb');
  eq('guided entry, kg default → kg', buildGuidedEntry({ name: 'Push-ups' }, 'kg').loadUnit, 'kg');

  // --- Relabel (no conversion) ---
  const logs = [
    { id: 'w1', date: '2026-11-20', entries: [
      { id: 'e1', name: 'Leg press', sets: 3, reps: 10, unit: 'reps', load: 100, loadUnit: 'kg', rir: 2, pain: 0 },
      { id: 'e2', name: 'Row', sets: 3, reps: 10, unit: 'reps', load: 60, loadUnit: 'lb', rir: 2, pain: 0 },
    ] },
    { id: 'w2', date: '2026-11-21', entries: [{ id: 'e3', name: 'Curl', sets: 3, reps: 10, unit: 'reps', load: 12.5, loadUnit: 'lb', rir: 2, pain: 0 }] },
  ] as never[];
  eq('kg entries counted', countKgEntries(logs), 1);
  const fixed = relabelLoadsAsLb(logs) as any[];
  eq('all now lb', fixed.flatMap((w) => w.entries.map((e: any) => e.loadUnit)), ['lb', 'lb', 'lb']);
  eq('numbers unchanged', fixed.flatMap((w) => w.entries.map((e: any) => e.load)), [100, 60, 12.5]);
  eq('nothing left to relabel', countKgEntries(fixed), 0);
  eq('untouched workout keeps identity', fixed[1] === (logs as any[])[1], true);
  eq('original not mutated', (logs as any[])[0].entries[0].loadUnit, 'kg');

  // --- AI parser ---
  let lastPrompt = '';
  let reply = '{"exercises":[{"name":"Leg press","sets":3,"load":100,"reps":10},{"name":"Curl","sets":3,"load":10,"loadUnit":"kg","reps":10}]}';
  (globalThis as any).fetch = (_url: string, init: any) => {
    const body = JSON.parse(init.body);
    lastPrompt = body.contents[0].parts[0].text;
    return Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: reply }] } }] }), { status: 200 }));
  };
  const gem = { ...fresh.aiCoach, enabled: true, consentAt: 'x', apiKey: 'gk', model: 'gemini-3.5-flash-lite' };
  await (async () => {
    let p = await parseQuickWithAI('leg press 3x10 100', gem);
    eq('AI: unit omitted → lb', p.entries?.[0].loadUnit, 'lb');
    eq('AI: explicit kg kept', p.entries?.[1].loadUnit, 'kg');
    eq('AI prompt says default lb', lastPrompt.includes('if no unit is said, use loadUnit: "lb"'), true);
    p = await parseQuickWithAI('leg press 3x10 100', gem, 'kg');
    eq('AI: unit omitted, kg setting → kg', p.entries?.[0].loadUnit, 'kg');
    eq('AI prompt says default kg', lastPrompt.includes('if no unit is said, use loadUnit: "kg"'), true);
    reply = '{"exercises":[]}';
    console.log(fails ? `\n${fails} FAILED` : '\nALL LB TESTS PASSED');
  })();
  expect(fails, 'checks failed — see the FAIL lines above').toBe(0);
});
