// Ported from the throwaway rolldown scripts (see CLAUDE.md → Testing). Each check logs PASS/FAIL;
// the test fails if any check failed (the console output names which).
import { expect, it } from 'vitest';
import { createFreshState, normalizeSafetyChecks, normalizeState } from '../lib/storage';
import { buildCoachBrief } from '../domain/coachBrief';
import { safetyCheckLine } from '../domain/safety';

it('pre-session safety check', async () => {
  let fail = 0;
  const eq = (label: string, got: unknown, want: unknown) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) { fail++; console.log('FAIL', label, '\n   got ', JSON.stringify(got), '\n   want', JSON.stringify(want)); }
  };

  // --- normalizer ---
  eq('missing → {}', normalizeSafetyChecks(undefined), {});
  eq('array → {}', normalizeSafetyChecks([1, 2]), {});
  eq('valid kept', normalizeSafetyChecks({ '2026-11-26': { at: '2026-11-26T06:00:00Z', flags: ['chest', 'dizzy'] } }),
    { '2026-11-26': { at: '2026-11-26T06:00:00Z', flags: ['chest', 'dizzy'] } });
  eq('bad date dropped', normalizeSafetyChecks({ 'yesterday': { at: 'x', flags: [] }, '2026-11-26': { at: 'x', flags: [] } }), { '2026-11-26': { at: 'x', flags: [] } });
  eq('non-object value dropped', normalizeSafetyChecks({ '2026-11-26': 'clear' }), {});
  eq('junk flags filtered + deduped', normalizeSafetyChecks({ '2026-11-26': { at: 5, flags: ['chest', 3, '', 'chest', null, 'x'.repeat(41)] } }),
    { '2026-11-26': { at: '', flags: ['chest'] } });
  eq('missing flags → []', normalizeSafetyChecks({ '2026-11-26': { at: 'a' } }), { '2026-11-26': { at: 'a', flags: [] } });

  // --- old data / backups (no safetyChecks field) still load ---
  const fresh = createFreshState();
  eq('new profile default', fresh.profiles[0].safetyChecks, {});
  const old = JSON.parse(JSON.stringify(fresh));
  delete old.profiles[0].safetyChecks;
  const n = normalizeState(old)!;
  eq('old backup loads', [n !== null, n.profiles[0].safetyChecks], [true, {}]);
  // Round trip keeps data unchanged
  const withChecks = JSON.parse(JSON.stringify(fresh));
  withChecks.profiles[0].safetyChecks = { '2026-11-25': { at: 't', flags: [] }, '2026-11-26': { at: 't2', flags: ['calf'] } };
  const rt = normalizeState(JSON.parse(JSON.stringify(normalizeState(withChecks))))!;
  eq('round trip', rt.profiles[0].safetyChecks, withChecks.profiles[0].safetyChecks);

  // --- brief lines ---
  eq('line clear', safetyCheckLine({ at: 't', flags: [] }), 'Safety check: clear');
  eq('line not done', safetyCheckLine(undefined), 'Safety check: not done');
  eq('line flagged', safetyCheckLine({ at: 't', flags: ['chest', 'calf'] }), 'Safety check: FLAGGED – Chest discomfort, pressure or tightness; Calf pain when walking');

  const p = rt.profiles[0];
  const entry = { id: 'e', name: 'Leg press', sets: 3, reps: 10, unit: 'reps' as const, load: null, loadUnit: 'kg' as const, rir: null, pain: 0 };
  const wk = (date: string) => ({ id: date, date, location: 'Gym' as const, sleepHours: null, climate: 'Normal' as const, notes: '', entries: [entry], estKcal: 100, muscles: [], benefits: [] });
  p.circuitLogs = [wk('2026-11-26'), wk('2026-11-25'), wk('2026-11-24')];
  const brief = buildCoachBrief(p, { days: 14, includeHealth: true, today: '2026-11-26' });
  // The check is no longer asked in the app: days without one get no line (older checks still show).
  eq('brief per day', brief.split('\n').filter((l) => l.includes('Safety check')).map((l) => l.trim()), [
    'Safety check: FLAGGED – Calf pain when walking', 'Safety check: clear',
  ]);

  console.log(fail ? `${fail} FAILED` : 'ALL SAFETY TESTS PASSED');
  expect(fail, 'checks failed — see the FAIL lines above').toBe(0);
});
