import { describe, expect, it } from 'vitest';
import { parseState } from './state';
import { runAudit } from './engine';
import { fromUnit } from './units';

// Shape of evidencefit-data.json written by the Gemini Canvas version (made-up values).
const geminiFile = {
  driveSync: { enabled: true, folderId: 'f', docId: 'd', jsonId: 'j', lastSyncAt: '2026-11-28T04:35:00Z', pendingSync: false },
  version: 2,
  activeProfileId: 'p1',
  aiCoach: { enabled: true, provider: 'gemini', apiKey: 'SECRET-FROM-FILE', model: 'x', consentAt: '2026-11-25T00:00:00Z', groqApiKey: 'SECRET2', groqModel: 'y', groqConsentAt: null },
  lastBackupAt: null,
  profiles: [{
    id: 'p1', name: 'Test', age: 66, weightKg: 74, mealPattern: '3-meal', proteinTargetG: 100,
    conditions: { hypertension: true }, medications: { statins: true },
    circuitLogs: [
      { id: 'c1', date: '2026-11-26', location: 'Gym', sleepHours: null, climate: 'Normal', notes: 'felt good', estKcal: 300, muscles: [], benefits: [],
        entries: [
          { id: 'e1', name: 'Leg press', sets: 4, load: 200, loadUnit: 'lb', reps: 9, unit: 'reps', rir: 2, pain: 0 },
          { id: 'e2', name: 'Incline treadmill walk', sets: 1, load: null, loadUnit: 'lb', reps: 20, unit: 'min', rir: null, pain: 0, speedKmh: 4.3, inclinePct: 1 },
        ] },
      { id: 'c2', date: 'not-a-date', location: 'Home', entries: [] },
    ],
    proteinLogs: { '2026-11-26': [{ id: 'x', mealSlot: 'Lunch', name: 'Dal', grams: 8 }] },
    voiceGlossary: [], safetyChecks: {}, defaultLoadUnit: 'lb',
  }],
};

describe('AC-17 restore the Gemini app file (evidencefit-data.json)', () => {
  it('AC-17.1 sessions, protein and conditions come across; bad dates are dropped', () => {
    const r = parseState(geminiFile);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.state.profiles[0];
    expect(p.conditions.hypertension).toBe(true);
    expect(p.proteinLogs['2026-11-26'][0].grams).toBe(8);
    expect(p.workouts).toHaveLength(1);
    const [lp, walk] = p.workouts[0].exercises;
    expect(p.workouts[0]).toMatchObject({ date: '2026-11-26', location: 'Gym', title: 'Gym session (Gemini app)', notes: 'felt good' });
    expect(lp.sets).toHaveLength(4);
    expect(lp.loadUnit).toBe('lb');
    expect(lp.sets[0].loadKg).toBeCloseTo(fromUnit(200, 'lb'), 2);
    expect(lp.sets[0].rpe).toBe(8); // RIR 2 → RPE 8
    expect(walk).toMatchObject({ unit: 'min', notes: '4.3 km/h, incline 1%' });
  });
  it('AC-17.2 the walk counts as aerobic minutes after restore', () => {
    const r = parseState(geminiFile);
    if (!r.ok) throw new Error('parse failed');
    expect(runAudit(r.state.profiles[0], '2026-11-28').aerobicMinutes7d).toBe(20);
  });
  it('AC-17.3 the API keys inside the file are never kept as-is (coach needs fresh consent and stays off)', () => {
    const r = parseState(geminiFile);
    if (!r.ok) throw new Error('parse failed');
    expect(JSON.stringify(r.state)).not.toContain('SECRET2');
  });
});
