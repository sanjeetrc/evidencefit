// Ported from the throwaway rolldown scripts (see CLAUDE.md → Testing). Each check logs PASS/FAIL;
// the test fails if any check failed (the console output names which).
import { expect, it } from 'vitest';
import { EXERCISE_LIBRARY, entryForExercise, exercisesFromHistory, searchExercises } from '../domain/exerciseLibrary';
import { inferMusclesAndBenefits } from '../domain/exercise';
import { matchKnownExercise } from '../voice/guided';
import { applyVoiceGlossary } from '../voice/glossary';
import type { LoggedWorkout } from '../types';

it('exercise library, search and history', async () => {
  let fail = 0;
  const eq = (label: string, got: unknown, want: unknown) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) { fail++; console.log('FAIL', label, '\n   got ', JSON.stringify(got), '\n   want', JSON.stringify(want)); }
  };
  const has = (label: string, cond: boolean, detail = '') => { if (!cond) { fail++; console.log('FAIL', label, detail); } };

  // --- Voice matching (spoken text → glossary → matcher) ---
  const M = (said: string, own: string[] = []) => matchKnownExercise(applyVoiceGlossary(said, []), own);
  const voice: [string, string][] = [
    ['leg press', 'Leg press'], ['like press', 'Leg press'], ['incline treadmill', 'Incline treadmill walk'], ['treadmill', 'Treadmill'],
    ['walking lunges', 'Walking lunges'], ['lunges', 'Lunges'], ['hip thrust', 'Hip thrust'], ['farmers walk', 'Farmer carry'],
    ['chair squats', 'Sit-to-stand (chair)'], ['sit to stand', 'Sit-to-stand (chair)'], ['cable row', 'Seated cable row'],
    ['chest press', 'Machine chest press'], ['pec deck', 'Chest fly (pec deck)'], ['calf raise', 'Calf raises'], ['RDL', 'Romanian deadlift'],
    ['plank', 'Plank'], ['side plank', 'Side plank'], ['bird dog', 'Bird dog'], ['dead bug', 'Dead bug'], ['crunches', 'Crunches'],
    ['exercise bike', 'Stationary bike'], ['cycling', 'Stationary bike'], ['rowing machine', 'Rowing machine'], ['stairs', 'Stair climber'],
    ['brisk walk', 'Brisk walk'], ['walk', 'Brisk walk'], ['shoulder press', 'Shoulder press'], ['lateral raises', 'Lateral raise'],
    ['hammer curls', 'Hammer curl'], ['bicep curl', 'Dumbbell bicep curl'], ['leg curl', 'Hamstring curl'], ['pull ups', 'Assisted pull-ups'],
    ['face pull', 'Face pulls'], ['surya namaskar', 'Surya Namaskar'], ['syria mask', 'Surya Namaskar'], ['wall sit', 'Wall sit'],
    ['wall seat', 'Wall sit'], ['push ups', 'Push-ups'], ['wall push ups', 'Wall push-ups'], ['tricep push down', 'Tricep push-down'],
    ['lat pull down', 'Lat pulldown'], ['single leg balance', 'Single-leg balance'], ['tai chi', 'Tai chi'], ['yoga', 'Yoga'],
    ['pranayama', 'Pranayama'], ['zumba', 'Zumba'], ['dumbbell squat', 'Goblet squat'], ['squats', 'Bodyweight squats'],
  ];
  for (const [said, want] of voice) eq(`voice "${said}"`, M(said), want);
  // User's own wording wins
  eq('own name kept', M('hack squat', ['Hack squat (narrow stance)']), 'Hack squat');
  eq('own exact name wins tie', M('chest press', ['Chest press']), 'Chest press');
  eq('own long name', M('narrow stance hack squat', ['Narrow stance hack squat']), 'Narrow stance hack squat');

  // --- Library integrity ---
  const names = EXERCISE_LIBRARY.map((x) => x.name.toLowerCase());
  has('library names unique', new Set(names).size === names.length);
  has('library size', EXERCISE_LIBRARY.length >= 70, String(EXERCISE_LIBRARY.length));
  // Every library exercise matches itself by voice
  for (const x of EXERCISE_LIBRARY) eq(`self-match ${x.name}`, M(x.name), x.name);
  // No library exercise falls back to the generic "General muscular conditioning" guess
  for (const x of EXERCISE_LIBRARY) {
    const info = inferMusclesAndBenefits(x.name, x.unit);
    has(`muscles known for ${x.name}`, !info.benefits.some((b) => b.startsWith('General')), JSON.stringify(info));
  }

  // --- Muscle inference fixes ---
  const mus = (n: string, u: 'reps' | 'min' | 'sec' = 'reps') => inferMusclesAndBenefits(n, u).muscles;
  has('cable row not Core', !mus('Seated cable row').includes('Core'), JSON.stringify(mus('Seated cable row')));
  has('crunches not Cardio', !mus('Crunches').includes('Cardio'), JSON.stringify(mus('Crunches')));
  has('leg curl not Biceps', !mus('Leg curl').includes('Biceps'), JSON.stringify(mus('Leg curl')));
  has('rowing machine Cardio only-ish', mus('Rowing machine', 'min').includes('Cardio') && !mus('Rowing machine', 'min').includes('Biceps'), JSON.stringify(mus('Rowing machine', 'min')));
  has('stair climber legs', mus('Stair climber', 'min').includes('Quads'), JSON.stringify(mus('Stair climber', 'min')));
  has('walking lunges not Cardio', !mus('Walking lunges').includes('Cardio'), JSON.stringify(mus('Walking lunges')));
  has('hip thrust glutes', mus('Hip thrust').includes('Glutes'));
  has('abs still core', mus('Core / Abs').includes('Core'));
  has('existing presets unchanged: leg press', JSON.stringify(mus('Leg press')) === JSON.stringify(['Quads', 'Glutes']));
  has('existing presets unchanged: push-ups', JSON.stringify(mus('Push-ups')) === JSON.stringify(['Chest', 'Triceps', 'Shoulders']));

  // --- Search ---
  has('search "row"', ['Seated cable row', 'Dumbbell row', 'Rowing machine'].every((n) => searchExercises('row', []).includes(n)), JSON.stringify(searchExercises('row', [])));
  has('search alias "pec"', searchExercises('pec', []).includes('Chest fly (pec deck)'));
  has('search multi-word "leg cu"', searchExercises('leg cu', [])[0] === 'Hamstring curl', JSON.stringify(searchExercises('leg cu', [])));
  eq('search empty', searchExercises('  ', []), []);

  // --- History ---
  const w = (date: string, ...e: [string, number, number, number | null][]): LoggedWorkout => ({
    id: date, date, location: 'Gym', sleepHours: null, climate: 'Normal', notes: '', estKcal: 0, muscles: [], benefits: [],
    entries: e.map(([name, sets, reps, load], i) => ({ id: `${date}${i}`, name, sets, reps, load, loadUnit: 'lb', unit: 'reps', rir: 2, pain: 0 })),
  });
  const logs = [w('2026-11-01', ['Leg press', 3, 10, 90], ['Hack squat', 3, 8, 50]), w('2026-11-10', ['leg press', 4, 8, 110]), w('2026-11-05', ['Plank', 3, 30, null])];
  const hist = exercisesFromHistory(logs);
  eq('history order (recent first)', hist.map((h) => h.name), ['leg press', 'Plank', 'Hack squat']);
  eq('history merges case + counts', [hist[0].count, hist[0].last.load, hist[0].last.sets], [2, 110, 4]);
  has('history in search first', searchExercises('squat', hist)[0] === 'Hack squat', JSON.stringify(searchExercises('squat', hist)));
  const again = entryForExercise('Leg Press', hist);
  eq('repeat last time', [again.name, again.sets, again.reps, again.load, again.pain], ['leg press', 4, 8, 110, 0]);
  has('repeat gets new id', again.id !== hist[0].last.id);
  const fresh = entryForExercise('Plank', []);
  eq('library defaults (hold)', [fresh.sets, fresh.reps, fresh.unit, fresh.rir], [3, 30, 'sec', null]);
  const custom = entryForExercise('zumba class', []);
  eq('custom defaults', [custom.name, custom.sets, custom.reps, custom.unit], ['zumba class', 3, 10, 'reps']);

  console.log(fail ? `${fail} FAILED` : 'ALL LIBRARY TESTS PASSED');
  expect(fail, 'checks failed — see the FAIL lines above').toBe(0);
});
