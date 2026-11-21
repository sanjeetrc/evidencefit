import { describe, expect, it } from 'vitest';
import { exerciseWarnings, proteinGuidance, runAudit, screen } from './engine';
import { createBlankProfile } from './state';
import { LoggedExercise, Profile, Workout } from './types';
import { daysAgoISO } from './dates';

const TODAY = '2026-11-21';
const ago = (n: number) => daysAgoISO(n, new Date(`${TODAY}T12:00:00`));

const exLog = (name: string, sets: [number, number, number | null, number?][], extra: Partial<LoggedExercise> = {}): LoggedExercise => ({
  exerciseId: name, name, repMin: 8, repMax: 12, unit: 'reps', targetRpe: 7.5,
  sets: sets.map(([loadKg, reps, rpe, pain = 0]) => ({ loadKg, reps, rpe, pain })),
  ...extra,
});
const session = (daysAgo: number, exercises: LoggedExercise[], extra: Partial<Workout> = {}): Workout => ({
  id: `w${daysAgo}`, date: ago(daysAgo), dayKey: 'Mon', title: 'T', location: 'Gym', sleepHours: 7, restingHr: null,
  climate: 'Normal', notes: '', exercises, ...extra,
});
const profile = (patch: Partial<Profile> = {}): Profile => ({ ...createBlankProfile('T', 66, 75), ...patch });

describe('AC-1 screening (Module 0)', () => {
  it('AC-1.1 any red-flag symptom → stop and refer', () => {
    const p = profile();
    p.redFlags.chestDiscomfort = true;
    expect(screen(p).level).toBe('stop');
  });
  it('AC-1.2 known disease + not active → light-moderate cap', () => {
    const p = profile({ isActiveRegularly: false });
    p.conditions.metabolic = true;
    const s = screen(p);
    expect(s.level).toBe('clearance-before-moderate');
    expect(s.vigorousAllowed).toBe(false);
  });
  it('AC-1.3 known disease + active → moderate OK, vigorous needs clearance', () => {
    const p = profile();
    p.conditions.cardiovascular = true;
    expect(screen(p).level).toBe('clearance-before-vigorous');
    expect(screen({ ...p, clearedForVigorous: true }).level).toBe('proceed');
  });
  it('AC-1.4 hypertension alone does not block (not a listed known disease)', () => {
    const p = profile();
    p.conditions.hypertension = true;
    expect(screen(p).level).toBe('proceed');
  });
});

describe('AC-2 exercise warnings', () => {
  it('AC-2.1 glaucoma flags head-down exercise (Surya Namaskar) as avoid', () => {
    const p = profile();
    p.conditions.glaucoma = true;
    const w = exerciseWarnings({ name: 'Surya Namaskar', tags: undefined }, p);
    expect(w.some((x) => x.severity === 'avoid')).toBe(true);
  });
  it('AC-2.2 osteoporosis flags sit-ups', () => {
    const p = profile();
    p.conditions.osteoporosis = true;
    expect(exerciseWarnings({ name: 'Sit-ups', tags: undefined }, p)).toHaveLength(1);
  });
  it('AC-2.3 intervals blocked until cleared when known disease', () => {
    const p = profile();
    p.conditions.cardiovascular = true;
    expect(exerciseWarnings({ name: 'Intervals 4x4', tags: ['vigorous'] }, p)[0].severity).toBe('avoid');
  });
  it('AC-2.4 no flags → no warnings', () => {
    expect(exerciseWarnings({ name: 'Leg press', tags: ['heavyBrace'] }, profile())).toHaveLength(0);
  });
});

describe('AC-3 protein (Module 8)', () => {
  it('AC-3.1 60+ gets 1.2–1.6 g/kg and ≥0.4 g/kg per meal', () => {
    const g = proteinGuidance(profile());
    expect([g.minG, g.maxG, g.perMealMinG]).toEqual([90, 120, 30]);
  });
  it('AC-3.2 under 60 gets 1.6–2.2 g/kg', () => {
    const g = proteinGuidance(profile({ age: 40 }));
    expect([g.minG, g.maxG]).toEqual([120, 165]);
  });
  it('AC-3.3 kidney disease removes the target', () => {
    const p = profile();
    p.conditions.renal = true;
    const g = proteinGuidance(p);
    expect(g.isRenalRestricted).toBe(true);
    expect(g.minG).toBeNull();
    expect(runAudit(p, TODAY).daysHitProtein).toBe(0);
  });
  it('AC-3.4 per-meal minimum is counted per meal slot', () => {
    const p = profile({ mealPattern: '2-meal' });
    p.proteinLogs[ago(0)] = [
      { id: '1', mealSlot: 'Lunch', name: 'Fish', grams: 32 },
      { id: '2', mealSlot: 'Dinner', name: 'Dal', grams: 8 },
    ];
    expect(runAudit(p, TODAY).mealsMeetingPerMealMin).toEqual({ hit: 1, total: 2 });
  });
});

describe('AC-4 double progression', () => {
  it('AC-4.1 two sessions at top of range ≤ target RPE → progress by the smallest increment', () => {
    const p = profile({
      workouts: [
        session(5, [exLog('Leg press', [[60, 12, 7], [60, 12, 7.5]], { incrementKg: 5 })]),
        session(2, [exLog('Leg press', [[60, 12, 7], [60, 12, 7]], { incrementKg: 5 })]),
      ],
    });
    const r = runAudit(p, TODAY).progressionReady;
    expect(r).toHaveLength(1);
    expect(r[0].nextLoad).toBe(65);
  });
  it('AC-4.2 one session at top is not enough', () => {
    const p = profile({ workouts: [session(5, [exLog('Row', [[10, 11, 7]])]), session(2, [exLog('Row', [[10, 12, 7]])])] });
    expect(runAudit(p, TODAY).progressionReady).toHaveLength(0);
  });
  it('AC-4.3 pain above 3 blocks progression', () => {
    const p = profile({ workouts: [session(5, [exLog('Row', [[10, 12, 7, 4]])]), session(2, [exLog('Row', [[10, 12, 7]])])] });
    expect(runAudit(p, TODAY).progressionReady).toHaveLength(0);
  });
  it('AC-4.4 light dumbbells step by 1 kg by default, not 4%', () => {
    const p = profile({ workouts: [session(5, [exLog('Curl', [[8, 12, 7]])]), session(2, [exLog('Curl', [[8, 12, 7]])])] });
    expect(runAudit(p, TODAY).progressionReady[0].nextLoad).toBe(9);
  });
  it('AC-4.5 history matches names case-insensitively', () => {
    const p = profile({ workouts: [session(5, [exLog('Leg Press', [[60, 12, 7]])]), session(2, [exLog('leg press', [[60, 12, 7]])])] });
    expect(runAudit(p, TODAY).progressionReady).toHaveLength(1);
  });
});

describe('AC-5 reactive deload', () => {
  it('AC-5.1 per-set performance falling twice at same effort → deload', () => {
    const p = profile({
      workouts: [
        session(9, [exLog('Leg press', [[60, 12, 7.5], [60, 12, 7.5]])]),
        session(5, [exLog('Leg press', [[60, 10, 7.5], [60, 10, 7.5]])]),
        session(2, [exLog('Leg press', [[60, 8, 8], [60, 8, 8]])]),
      ],
    });
    expect(runAudit(p, TODAY).deloadRecommended).toBe(true);
  });
  it('AC-5.2 doing fewer sets (a planned deload) is not a performance drop', () => {
    const p = profile({
      workouts: [
        session(9, [exLog('Leg press', [[60, 12, 7], [60, 12, 7], [60, 12, 7]])]),
        session(5, [exLog('Leg press', [[60, 12, 7], [60, 12, 7]])]),
        session(2, [exLog('Leg press', [[60, 12, 7]])]),
      ],
    });
    expect(runAudit(p, TODAY).deloadRecommended).toBe(false);
  });
  it('AC-5.3 sleep under 6 h before 3 sessions → deload; unlogged sleep is ignored', () => {
    const lowSleep = [9, 5, 2].map((d) => session(d, [], { sleepHours: 5.5 }));
    expect(runAudit(profile({ workouts: lowSleep }), TODAY).deloadRecommended).toBe(true);
    const unknown = [9, 5, 2].map((d) => session(d, [], { sleepHours: null }));
    expect(runAudit(profile({ workouts: unknown }), TODAY).deloadRecommended).toBe(false);
  });
  it('AC-5.4 resting HR trigger ignored on beta-blockers', () => {
    const ws = [9, 5, 2].map((d) => session(d, [], { restingHr: 75 }));
    const p = profile({ workouts: ws, baselineRestingHr: 60 });
    expect(runAudit(p, TODAY).deloadRecommended).toBe(true);
    p.medications.betaBlockers = true;
    expect(runAudit(p, TODAY).deloadRecommended).toBe(false);
  });
  it('AC-5.5 pain ≥4 in two consecutive sessions → deload', () => {
    const p = profile({ workouts: [session(5, [exLog('Row', [[10, 10, 7, 4]])]), session(2, [exLog('Row', [[10, 10, 7, 5]])])] });
    expect(runAudit(p, TODAY).deloadReasons.join()).toMatch(/pain/i);
  });
});

describe('AC-6 ramp-back and aerobic minutes', () => {
  it.each([
    [3, 'ontrack'], [10, 'repeat'], [20, 'ramp'], [40, 'restart'],
  ])('AC-6.1 %i days off → %s', (days, level) => {
    expect(runAudit(profile({ workouts: [session(days as number, [])] }), TODAY).rampBack.level).toBe(level);
  });
  it('AC-6.2 sums timed aerobic minutes for 7 days, excluding warm-up and older sessions', () => {
    const walk = (m: number) => exLog('Brisk walk', [[0, m, 4]], { unit: 'min' });
    const warm = exLog('General warm-up', [[0, 8, 4]], { unit: 'min' });
    const p = profile({ workouts: [session(1, [walk(30), warm]), session(3, [walk(40)]), session(10, [walk(60)])] });
    expect(runAudit(p, TODAY).aerobicMinutes7d).toBe(70);
  });
});
