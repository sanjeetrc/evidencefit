import { describe, expect, it } from 'vitest';
import { runAudit } from './engine';
import { createBlankProfile, parseState } from './state';
import { BAND_PUSH_DOWN_NAME, PROGRAM_VERSION, PUSH_DOWN_NAME, PUSH_UP_NAME, buildDefaultProgram, isOneSided } from './program';
import { PAIN_AREAS, PAIN_SCALE, PROTEIN_FOODS, countedName, portionTotal } from './reference';
import { KG_PER_LB, defaultIncrementKg, displayLoad, formatLoad, fromUnit } from './units';
import { workoutsCsv } from './csv';
import { daysAgoISO } from './dates';
import { LoggedExercise, Workout } from './types';

const TODAY = '2026-11-21';
const ago = (n: number) => daysAgoISO(n, new Date(`${TODAY}T12:00:00`));
const w = (n: number, e: LoggedExercise): Workout => ({
  id: `w${n}`, date: ago(n), dayKey: 'Mon', title: 'T', location: 'Gym', sleepHours: 7, restingHr: null, climate: 'Normal', notes: '', exercises: [e],
});

describe('AC-11 kg and lb', () => {
  it('AC-11.1 lb round-trips exactly to the half pound', () => {
    for (const lb of [5, 22.5, 50, 112.5, 230]) expect(displayLoad(fromUnit(lb, 'lb'), 'lb')).toBe(lb);
    expect(formatLoad(fromUnit(50, 'lb'), 'lb')).toBe('50 lb');
    expect(formatLoad(60, 'kg')).toBe('60 kg');
  });
  it('AC-11.2 default step is 5 lb on lb machines, 1 kg on light and 2.5 kg on heavier kg loads', () => {
    expect(defaultIncrementKg(30, 'lb')).toBeCloseTo(5 * KG_PER_LB);
    expect(defaultIncrementKg(8, 'kg')).toBe(1);
    expect(defaultIncrementKg(40, 'kg')).toBe(2.5);
  });
  it('AC-11.3 progression on an lb machine is written in lb', () => {
    const lp = (): LoggedExercise => ({
      exerciseId: 'p', name: 'Triceps push-down', repMin: 10, repMax: 15, unit: 'reps', targetRpe: 7.5, loadUnit: 'lb',
      sets: [{ loadKg: fromUnit(50, 'lb'), reps: 15, rpe: 7, pain: 0 }],
    });
    const p = { ...createBlankProfile('T', 66, 75), workouts: [w(5, lp()), w(2, lp())] };
    const r = runAudit(p, TODAY).progressionReady[0];
    expect(r.suggestion).toContain('5 lb');
    expect(r.suggestion).toContain('next 55 lb');
  });
});

describe('AC-12 plan upgrade keeps the user\'s edits', () => {
  const v1Plan = () => {
    const prog = buildDefaultProgram();
    for (const d of ['Mon', 'Fri'] as const) {
      prog[d].exercises = prog[d].exercises
        .filter((e) => e.name !== PUSH_DOWN_NAME)
        .map((e) => (e.name === PUSH_UP_NAME ? { ...e, name: 'Incline push-up (bench)', notes: 'Lower the bench height as you progress.' } : e));
    }
    prog.Mon.exercises.push({ id: 'mine', name: 'My own curl', sets: 2, repMin: 10, repMax: 12, unit: 'reps', targetRpe: 7, restSec: 60, notes: '' });
    return prog;
  };
  it('AC-12.1 new plans include plain push-ups and a triceps push-down on both Gym A days', () => {
    const prog = buildDefaultProgram();
    for (const d of ['Mon', 'Fri'] as const) {
      const names = prog[d].exercises.map((e) => e.name);
      expect(names).toContain(PUSH_UP_NAME);
      expect(names.indexOf(PUSH_DOWN_NAME)).toBe(names.indexOf(PUSH_UP_NAME) + 1);
    }
    expect(createBlankProfile().programVersion).toBe(PROGRAM_VERSION);
  });
  it('AC-12.2 a saved v1 plan is renamed and gains the push-down once, custom exercises kept', () => {
    const r = parseState({ version: 2, profiles: [{ name: 'T', program: v1Plan() }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.state.profiles[0];
    expect(p.programVersion).toBe(PROGRAM_VERSION);
    const mon = p.program.Mon.exercises.map((e) => e.name);
    expect(mon).toContain(PUSH_UP_NAME);
    expect(mon).not.toContain('Incline push-up (bench)');
    expect(mon.filter((n) => n === PUSH_DOWN_NAME)).toHaveLength(1);
    expect(mon).toContain('My own curl');
    // Running the upgrade again (reload) changes nothing.
    const again = parseState(r.state);
    expect(again.ok && again.state.profiles[0].program.Mon.exercises.map((e) => e.name)).toEqual(mon);
  });
  it('AC-12.3 triceps volume stays modest: 2 sets, twice a week', () => {
    const pd = Object.values(buildDefaultProgram()).flatMap((d) => d.exercises).filter((e) => e.name === PUSH_DOWN_NAME);
    expect(pd.reduce((s, e) => s + e.sets, 0)).toBe(4);
  });
});

describe('AC-13 protein portions and pain records', () => {
  it('AC-13.1 every food has 1–3 sizes of ONE piece or serving, rising with size, realistic per item', () => {
    for (const f of PROTEIN_FOODS) {
      expect(f.portions.length).toBeGreaterThanOrEqual(1);
      expect(f.portions.length).toBeLessThanOrEqual(3);
      const g = f.portions.map((p) => p.grams);
      if (!/egg/i.test(f.food)) expect([...g].sort((a, b) => a - b)).toEqual(g);
      g.forEach((x) => { expect(x).toBeGreaterThan(0); expect(x).toBeLessThanOrEqual(25); });
    }
    // A single fish or chicken piece is well under a 100 g "portion".
    const fish = PROTEIN_FOODS.find((f) => f.food === 'Fish')!;
    const chicken = PROTEIN_FOODS.find((f) => f.food === 'Chicken')!;
    expect(fish.portions.map((p) => p.size)).toEqual(['Small', 'Medium', 'Large']);
    expect(chicken.portions[1].grams).toBeLessThan(15);
  });
  it('AC-13.2 the pain scale covers 0 to 10 and says effort is not pain', () => {
    expect(PAIN_SCALE.map((r) => r.range)).toEqual(['0', '1–3', '4–5', '6–10']);
    expect(PAIN_SCALE[0].action).toMatch(/not pain/);
    expect(PAIN_AREAS).toContain('Knee');
  });
  it('AC-13.3 pain site and unit survive a reload and reach the CSV', () => {
    const e: LoggedExercise = {
      exerciseId: 'x', name: 'Leg press', repMin: 8, repMax: 12, unit: 'reps', targetRpe: 7.5, loadUnit: 'lb', painSite: 'Left knee',
      sets: [{ loadKg: fromUnit(100, 'lb'), reps: 10, rpe: 7, pain: 4 }],
    };
    const r = parseState({ version: 2, profiles: [{ name: 'T', workouts: [w(1, e)] }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const saved = r.state.profiles[0].workouts[0].exercises[0];
    expect(saved).toMatchObject({ loadUnit: 'lb', painSite: 'Left knee' });
    const csv = workoutsCsv(r.state.profiles[0]);
    expect(csv.split('\n')[0]).toContain('PainSite');
    expect(csv).toContain(',100,lb,');
    expect(csv).toContain('Left knee');
  });
});

describe('AC-14 second round: left/right sets, home push-downs', () => {
  it('AC-14.1 one-sided exercises are detected; two-sided ones are not', () => {
    const all = Object.values(buildDefaultProgram()).flatMap((d) => d.exercises);
    const sided = [...new Set(all.filter(isOneSided).map((e) => e.name))].sort();
    expect(sided).toEqual(['Bird-dog', 'Dumbbell one-arm row', 'Fast step-up (power, each leg)', 'Single-leg balance near a counter']);
    expect(isOneSided({ name: 'Walking lunge' })).toBe(true);
    expect(isOneSided({ name: 'Leg press' })).toBe(false);
    expect(isOneSided({ name: 'Leg press', perSide: true })).toBe(true);
    expect(isOneSided({ name: 'Bird-dog', perSide: false })).toBe(false);
  });
  it('AC-14.2 band push-down on both home days; direct triceps 8 sets a week in total', () => {
    const prog = buildDefaultProgram();
    for (const d of ['Tue', 'Thu'] as const) expect(prog[d].exercises.map((e) => e.name)).toContain(BAND_PUSH_DOWN_NAME);
    const tri = Object.values(prog).flatMap((d) => d.exercises).filter((e) => /push-?down/i.test(e.name));
    expect(tri.reduce((s, e) => s + e.sets, 0)).toBe(8);
  });
  it('AC-14.3 a saved v2 plan gains the band push-down once on home days, nowhere else', () => {
    const prog = buildDefaultProgram();
    for (const d of ['Tue', 'Thu'] as const) prog[d].exercises = prog[d].exercises.filter((e) => e.name !== BAND_PUSH_DOWN_NAME);
    const r = parseState({ version: 2, profiles: [{ name: 'T', programVersion: 2, program: prog }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.state.profiles[0].program;
    for (const d of ['Tue', 'Thu'] as const) {
      const names = p[d].exercises.map((e) => e.name);
      expect(names.filter((n) => n === BAND_PUSH_DOWN_NAME)).toHaveLength(1);
      expect(names.indexOf(BAND_PUSH_DOWN_NAME)).toBe(names.indexOf('Dumbbell biceps curl') + 1);
    }
    expect(p.Mon.exercises.map((e) => e.name)).not.toContain(BAND_PUSH_DOWN_NAME);
    expect(PROGRAM_VERSION).toBe(3);
  });
  it('AC-14.4 the side of each set survives a reload and reaches the CSV', () => {
    const e: LoggedExercise = {
      exerciseId: 'r', name: 'Dumbbell one-arm row', repMin: 10, repMax: 12, unit: 'reps', targetRpe: 7.5,
      sets: [{ loadKg: 10, reps: 12, rpe: 7, pain: 0, side: 'L' }, { loadKg: 10, reps: 11, rpe: 7.5, pain: 0, side: 'R' }],
    };
    const r = parseState({ version: 2, profiles: [{ name: 'T', workouts: [w(1, e)] }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.profiles[0].workouts[0].exercises[0].sets.map((s) => s.side)).toEqual(['L', 'R']);
    const csv = workoutsCsv(r.state.profiles[0]);
    expect(csv).toContain(',1,Left,');
    expect(csv).toContain(',2,Right,');
  });
});

describe('AC-15 protein by piece size and count', () => {
  it('AC-15.1 total = count × protein per piece, rounded; names read naturally', () => {
    const chicken = PROTEIN_FOODS.find((f) => f.food === 'Chicken')!;
    const med = chicken.portions[1];
    expect(portionTotal(med, 3)).toBe(33);
    expect(countedName('Chicken', 'Medium', 'piece', 'pieces', 3)).toBe('Chicken: 3 medium pieces');
    expect(countedName('Chicken', 'Medium', 'piece', 'pieces', 1)).toBe('Chicken: 1 medium piece');
    const prawn = PROTEIN_FOODS.find((f) => f.food === 'Prawns')!.portions[1];
    expect(portionTotal(prawn, 3)).toBe(8); // 7.5 rounds up
  });
  it('AC-15.2 counted items survive a reload; bad counts fall back to a plain item', () => {
    const items = [
      { id: 'a', mealSlot: 'Lunch', name: 'Chicken: 3 medium pieces', grams: 33, count: 3, gramsEach: 11, food: 'Chicken', size: 'Medium', noun: 'piece', nounPlural: 'pieces' },
      { id: 'b', mealSlot: 'Lunch', name: 'Odd', grams: 5, count: 'x', gramsEach: 5, food: 'Fish' },
    ];
    const r = parseState({ version: 2, profiles: [{ name: 'T', proteinLogs: { [TODAY]: items } }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [a, b] = r.state.profiles[0].proteinLogs[TODAY];
    expect(a).toMatchObject({ count: 3, gramsEach: 11, food: 'Chicken', size: 'Medium' });
    expect(b.count).toBeUndefined();
    expect(b.grams).toBe(5);
  });
});
