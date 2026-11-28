// Ported from the throwaway rolldown scripts (see CLAUDE.md → Testing). Each check logs PASS/FAIL;
// the test fails if any check failed (the console output names which).
import { expect, it } from 'vitest';
import { QUICK_PRESETS, inferMusclesAndBenefits, estimateEntryKcal } from '../domain/exercise';
import { EXERCISE_LIBRARY, entryForExercise, findLibraryExercise } from '../domain/exerciseLibrary';
import { matchKnownExercise } from '../voice/guided';
import { applyVoiceGlossary } from '../voice/glossary';

it('mobility presets and library', async () => {
  let fail = 0;
  const has = (l: string, c: boolean, d = '') => { if (!c) { fail++; console.log('FAIL', l, d); } };
  const mob = QUICK_PRESETS.filter((p) => p.section === 'Mobility');
  has('16 mobility presets', mob.length === 16, String(mob.length));
  has('wall sit in row, timed', mob.some((p) => p.name === 'Wall sit (90° isometric)' && p.unit === 'sec' && p.sets === 4 && p.reps === 60));
  has('wall sit not in main row', !QUICK_PRESETS.some((p) => /wall sit/i.test(p.name) && !p.section));
  has('all mobility presets are Home', mob.every((p) => p.group === 'Home'));
  has('Surya moved out of main Home row', !QUICK_PRESETS.some((p) => p.name === 'Surya Namaskar' && !p.section));
  for (const p of mob.filter((x) => !/wall sit/i.test(x.name))) {
    const lib = findLibraryExercise(p.name);
    has(`in library: ${p.name}`, !!lib && lib.name === p.name && lib.category === 'Mobility & Balance');
    has(`same values: ${p.name}`, !!lib && lib.sets === p.sets && lib.reps === p.reps && lib.unit === p.unit, JSON.stringify([lib, p]));
    const info = inferMusclesAndBenefits(p.name, p.unit);
    has(`mobility muscles: ${p.name}`, info.muscles.includes('Mobility'), JSON.stringify(info.muscles));
    const e = entryForExercise(p.name, []);
    has(`no to-fail: ${p.name}`, e.rir === null);
    const kcal = estimateEntryKcal(e, 70);
    has(`small kcal: ${p.name}`, kcal >= 1 && kcal <= (p.name === 'Surya Namaskar' ? 120 : 30), String(kcal));
  }
  // Voice: spoken names land on the new exercises
  const M = (s: string) => matchKnownExercise(applyVoiceGlossary(s, []), []);
  const voice: [string, string][] = [['cat cow', 'Cat-cow'], ['neck rolls', 'Neck mobility'], ['open book', 'Thoracic rotation'], ['hip circles', 'Hip circles'],
    ['ankle circles', 'Ankle circles'], ['wall angels', 'Wall angels'], ['hip flexor stretch', 'Hip flexor stretch'], ['hamstring stretch', 'Hamstring stretch'],
    ['calf stretch', 'Calf stretch'], ['doorway stretch', 'Chest stretch'], ['childs pose', 'Child’s pose'], ['knee to chest', 'Knee-to-chest stretch'],
    ['spinal twist', 'Seated spinal twist'], ['leg swings', 'Leg swings'],
    // existing ones still right
    ['stretching', 'Stretching'], ['leg curl', 'Hamstring curl'], ['calf raise', 'Calf raises'], ['chest press', 'Machine chest press'], ['russian twist', 'Russian twist']];
  for (const [s, w] of voice) { const got = M(s); has(`voice "${s}" → ${w}`, got === w, got); }
  // Strength moves unaffected
  has('leg press still rir 2', entryForExercise('Leg press', []).rir === 2);
  has('russian twist not mobility', !inferMusclesAndBenefits('Russian twist', 'reps').muscles.includes('Mobility'));
  has('library unique', new Set(EXERCISE_LIBRARY.map((x) => x.name.toLowerCase())).size === EXERCISE_LIBRARY.length);
  console.log(fail ? `${fail} FAILED` : `ALL MOBILITY TESTS PASSED (${EXERCISE_LIBRARY.length} exercises)`);
  expect(fail, 'checks failed — see the FAIL lines above').toBe(0);
});
