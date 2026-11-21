import { describe, expect, it } from 'vitest';
import { createFreshState, isDuplicateWorkout, parseState, toBackup, keepLocalKey } from './state';
import { cell, workoutsCsv } from './csv';
import { buildDefaultProgram } from './program';
import { runAudit, exerciseWarnings } from './engine';

describe('AC-7 data integrity: load, import, migrate', () => {
  it('AC-7.1 rejects non-objects and empty profile lists without throwing', () => {
    expect(parseState(null).ok).toBe(false);
    expect(parseState('x').ok).toBe(false);
    expect(parseState({ profiles: [] }).ok).toBe(false);
  });
  it('AC-7.2 migrates a v1 prototype backup, coercing string numbers and clamping ranges', () => {
    const v1 = {
      version: 1, customApiKey: 'SECRET', activeProfileId: 'a',
      profiles: [{
        id: 'a', name: 'Test User', age: '66', weightKg: '74', mealPattern: '2-meal',
        workouts: [
          { id: 'w', date: '2026-11-01', dayKey: 'Mon', title: 'Gym', exercises: [{ name: 'Leg Press', repMin: 10, repMax: 12, sets: [{ loadKg: '60', reps: '12', rpe: '14', pain: '-3' }] }] },
          { id: 'bad', date: 'not-a-date', exercises: [] },
        ],
        proteinLogs: { '2026-11-01': [{ name: 'Fish', grams: '25', mealSlot: 'Lunch' }], junk: [] },
      }],
    };
    const r = parseState(v1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.state.profiles[0];
    expect(r.migratedFrom).toBe(1);
    expect(p.age).toBe(66);
    expect(p.workouts).toHaveLength(1);
    expect(p.workouts[0].exercises[0].sets[0]).toMatchObject({ loadKg: 60, reps: 12, rpe: 10, pain: 0 });
    expect(Object.keys(p.proteinLogs)).toEqual(['2026-11-01']);
    expect(p.conditions.hernia).toBe(false);
    // The v1 key is kept on-device but the coach stays off until fresh consent.
    expect(r.state.aiCoach.apiKey).toBe('SECRET');
    expect(r.state.aiCoach.enabled).toBe(false);
  });
  it('AC-7.3 backups never contain the API key; import keeps the device key', () => {
    const s = createFreshState();
    s.aiCoach = { ...s.aiCoach, apiKey: 'K', enabled: true, consentAt: 'x' };
    const b = toBackup(s);
    expect(JSON.stringify(b)).not.toContain('"K"');
    expect(keepLocalKey(b, s).aiCoach.apiKey).toBe('K');
  });
  it('AC-7.4 detects an accidental double save of the same session', () => {
    const w = { date: '2026-11-21', title: 'Gym A', exercises: [{ exerciseId: '1', name: 'Row', repMin: 8, repMax: 12, unit: 'reps' as const, targetRpe: 7, sets: [{ loadKg: 10, reps: 10, rpe: 7, pain: 0 }] }] };
    const existing = [{ ...w, id: 'x', dayKey: 'Mon' as const, location: 'Gym' as const, sleepHours: null, restingHr: null, climate: 'Normal' as const, notes: '' }];
    expect(isDuplicateWorkout(existing, w)).toBe(true);
    expect(isDuplicateWorkout(existing, { ...w, title: 'Other' })).toBe(false);
  });
});

describe('AC-8 CSV export', () => {
  it('AC-8.1 neutralises formula injection and quotes commas', () => {
    expect(cell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(cell('a,b')).toBe('"a,b"');
    expect(cell(-5)).toBe('-5');
  });
  it('AC-8.2 writes one row per set', () => {
    const s = createFreshState();
    const p = s.profiles[0];
    p.workouts = [{ id: '1', date: '2026-11-20', dayKey: 'Fri', title: 'A', location: 'Gym', sleepHours: 7, restingHr: null, climate: 'Normal', notes: '',
      exercises: [{ exerciseId: 'e', name: 'Row', repMin: 8, repMax: 12, unit: 'reps', targetRpe: 7, sets: [{ loadKg: 10, reps: 10, rpe: 7, pain: 0 }, { loadKg: 10, reps: 9, rpe: 8, pain: 1 }] }] }];
    expect(workoutsCsv(p).split('\n')).toHaveLength(3);
  });
});

describe('AC-9 default programme meets the 60+ prescription', () => {
  const prog = buildDefaultProgram();
  const all = Object.values(prog).flatMap((d) => d.exercises);
  it('AC-9.1 power work at least twice a week, 3–5 reps', () => {
    const power = all.filter((e) => /power/i.test(e.name));
    expect(power.length).toBeGreaterThanOrEqual(2);
    power.forEach((e) => expect(e.repMax).toBeLessThanOrEqual(5));
  });
  it('AC-9.2 planned aerobic minutes ≥ 150 a week at talk-test effort, plus one interval session', () => {
    const aerobic = all.filter((e) => e.unit === 'min' && !/warm-?up|mobility/i.test(e.name));
    const minutes = aerobic.reduce((s, e) => s + e.repMin * e.sets, 0);
    expect(minutes).toBeGreaterThanOrEqual(150);
    expect(all.filter((e) => e.tags?.includes('vigorous'))).toHaveLength(1);
    aerobic.filter((e) => !e.tags?.includes('vigorous')).forEach((e) => expect(e.targetRpe).toBeLessThanOrEqual(4));
  });
  it('AC-9.3 balance at least 3 days a week', () => {
    const days = Object.values(prog).filter((d) => d.exercises.some((e) => /balance|tandem/i.test(e.name)));
    expect(days.length).toBeGreaterThanOrEqual(3);
  });
  it('AC-9.4 isometric BP protocol: 4 × 2 min, 3 times a week', () => {
    const iso = all.filter((e) => /wall sit/i.test(e.name));
    expect(iso).toHaveLength(3);
    iso.forEach((e) => expect([e.sets, e.repMin]).toEqual([4, 120]));
  });
  it('AC-9.5 includes a hip hinge and a loaded carry', () => {
    expect(all.some((e) => /deadlift|hinge/i.test(e.name))).toBe(true);
    expect(all.some((e) => /carry/i.test(e.name))).toBe(true);
  });
  it('AC-9.6 a new profile with glaucoma is warned off the default Surya Namaskar', () => {
    const s = createFreshState();
    const p = s.profiles[0];
    p.conditions.glaucoma = true;
    const sn = p.program.Tue.exercises.find((e) => /surya/i.test(e.name))!;
    expect(exerciseWarnings(sn, p)[0].severity).toBe('avoid');
    expect(runAudit(p).activeCues.length).toBeGreaterThan(0);
  });
});
