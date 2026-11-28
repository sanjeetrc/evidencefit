// Ported from the throwaway rolldown scripts (see CLAUDE.md → Testing). Each check logs PASS/FAIL;
// the test fails if any check failed (the console output names which).
import { expect, it } from 'vitest';
import { parseRirAnswer, interpretGuidedStep } from '../voice/guided';
import { applyVoiceGlossary } from '../voice/glossary';

it('"to fail" answers', async () => {
  const cases: [string, number | null][] = [
    ['2 to fail', 2], ['two to fail', 2], ['22 fail', 2], ['2 2 fail', 2], ['2 too fail', 2], ['two two fail', 2],
    ['1 to fail', 1], ['one to fail', 1], ['12 fail', 1], ['won to fail', 1], ['1 rep left', 1], ['one in the tank', 1],
    ['0 to fail', 0], ['zero to fail', 0], ['02 fail', 0], ['to failure', 0], ['to fail', 0], ['failure', 0], ['fail', 0],
    ['too fail', 0], ['went to failure', 0], ['maxed out', 0], ['10 reps to failure', 0], ['12 reps to fail', 0],
    ['3 to fail', 3], ['three', 3], ['tree to fail', 3], ['32 fail', 3],
    ['4', 4], ['for', 4], ['four to fail', 4], ['5 to fail', 4], ['42 fail', 4],
    ['2', 2], ['0', 0], ['skip', null], ['none', null], ['no', null], ['banana', null], ['', null], ['15', null],
  ];
  let fail = 0;
  for (const [said, want] of cases) {
    const viaGlossary = applyVoiceGlossary(said, []);
    const a = parseRirAnswer(viaGlossary);
    const b = interpretGuidedStep(4, viaGlossary, {}).rir ?? null;
    const ok = a === want && b === want;
    if (!ok) fail++;
    console.log(ok ? 'ok  ' : 'FAIL', JSON.stringify(said).padEnd(24), '→', JSON.stringify(viaGlossary).padEnd(22), a, ok ? '' : `(want ${want})`);
  }
  console.log(fail ? fail + ' FAILED' : 'ALL ' + cases.length + ' PASSED');
  expect(fail, 'checks failed — see the FAIL lines above').toBe(0);
});
