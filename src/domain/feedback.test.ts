import { describe, expect, it } from 'vitest';
import { runAudit } from './engine';
import { createBlankProfile, parseState } from './state';
import { PROGRAM_VERSION, PUSH_DOWN_NAME, PUSH_UP_NAME, buildDefaultProgram } from './program';
import { PAIN_AREAS, PAIN_SCALE, PROTEIN_FOODS, portionLabel } from './reference';
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
  it('AC-13.1 every food has 2–3 sizes that rise with size, within sane per-portion grams', () => {
    for (const f of PROTEIN_FOODS) {
      expect(f.portions.length).toBeGreaterThanOrEqual(2);
      expect(f.portions.length).toBeLessThanOrEqual(3);
      const g = f.portions.map((p) => p.grams);
      expect([...g].sort((a, b) => a - b)).toEqual(g);
      g.forEach((x) => { expect(x).toBeGreaterThan(0); expect(x).toBeLessThanOrEqual(40); });
    }
    const fish = PROTEIN_FOODS.find((f) => f.food === 'Fish')!;
    expect(portionLabel(fish, fish.portions[1])).toMatch(/^Fish, medium/);
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
