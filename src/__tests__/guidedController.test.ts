// Ported from the throwaway rolldown scripts (see CLAUDE.md → Testing). Each check logs PASS/FAIL;
// the test fails if any check failed (the console output names which).
import { expect, it } from 'vitest';
import { createGuidedController, EMPTY_GUIDED_VIEW, type GuidedView } from '../voice/guidedController';
import type { SpeechRec } from '../voice/speech';

it('guided voice controller vs simulated Android speech', async () => {
  // ---- Simulated Android speech service ----
  // Model: one active session at a time; start() throws if another is alive;
  // abort() is processed late and kills whatever session is active at that moment.
  type Script = (string | null)[]; // null = user stays silent (session ends with no result)
  function makeService(answers: Script, opts = { speakAfterMs: 300, abortLagMs: 400 }) {
    const svc = { active: null as FakeRec | null, starts: 0, killedWrong: 0, aborts: 0 };
    class FakeRec implements SpeechRec {
      lang = ''; interimResults = false; continuous = false;
      onresult: SpeechRec['onresult'] = null; onerror: SpeechRec['onerror'] = null; onend: SpeechRec['onend'] = null;
      onaudiostart: SpeechRec['onaudiostart'] = null;
      ended = false;
      start() {
        if (svc.active && !svc.active.ended) throw new Error('InvalidStateError: already started');
        svc.active = this; svc.starts++;
        setTimeout(() => { if (!this.ended) this.onaudiostart?.(); }, 100);
        setTimeout(() => {
          if (this.ended || svc.active !== this) return;
          const text = answers.shift();
          if (text == null) { this.end(); return; }
          this.onresult?.({ results: Object.assign([{ isFinal: true, length: 1, 0: { transcript: text } }]) });
          setTimeout(() => this.end(), 30);
        }, opts.speakAfterMs);
      }
      stop() { setTimeout(() => this.end(), 30); }
      abort() {
        svc.aborts++;
        setTimeout(() => {
          const victim = svc.active;
          if (!victim || victim.ended) return;
          if (victim !== this) svc.killedWrong++;
          victim.onerror?.({ error: 'aborted' });
          victim.end();
        }, opts.abortLagMs);
      }
      end() { if (this.ended) return; this.ended = true; if (svc.active === this) svc.active = null; this.onend?.(); }
    }
    return { svc, SR: FakeRec };
  }

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let failed = 0;
  const check = (label: string, ok: boolean, detail = '') => { console.log(ok ? 'ok  ' : 'FAIL', label, detail); if (!ok) failed++; };

  function harness(answers: Script) {
    const { svc, SR } = makeService(answers);
    let view: GuidedView = { ...EMPTY_GUIDED_VIEW };
    const done: Record<string, unknown>[] = []; const toasts: string[] = [];
    const ctrl = createGuidedController({
      onView: (p) => { view = { ...view, ...p }; },
      getGlossary: () => [], toast: (m) => toasts.push(m), onComplete: (e) => done.push(e as unknown as Record<string, unknown>),
    }, () => SR);
    return { ctrl, svc, done, toasts, view: () => view };
  }

  // 1. Full flow — the reported bug path
  {
    const h = harness(['leg press', '100 pounds', '3', '10', '2 to fail']);
    h.ctrl.start();
    await wait(5000);
    const e = h.done[0];
    check('NEW: all 5 steps complete', !!e && e.name === 'Leg press' && e.load === 100 && e.loadUnit === 'lb' && e.sets === 3 && e.reps === 10 && e.rir === 2, JSON.stringify(e ?? h.view()));
    check('NEW: no abort() used, no session killed', h.svc.aborts === 0 && h.svc.killedWrong === 0, `aborts=${h.svc.aborts} killedWrong=${h.svc.killedWrong}`);
    check('NEW: guided closed afterwards', h.view().step === null);
  }

  // 2. Previous sequencing (abort the answered recognizer, start next after 250 ms) under the same model
  {
    const { svc, SR } = makeService(['leg press', '100 pounds', '3', '10', '2 to fail']);
    let step = 0; let rec: SpeechRec | null = null;
    const run = (s: number) => {
      if (rec) { const r = rec; r.onresult = r.onerror = r.onend = null; r.abort(); }
      rec = null; step = s;
      setTimeout(() => {
        const r = new SR(); rec = r;
        r.onresult = () => { if (s < 4) run(s + 1); else step = 99; };
        r.start();
      }, 250);
    };
    run(0);
    await wait(5000);
    check('OLD sequencing reproduces the reported bug (stuck on step 2 "Weight")', step === 1 && svc.killedWrong > 0, `step=${step + 1} killedWrong=${svc.killedWrong}`);
  }

  // 3. Cancel during the start delay must not resurrect the session
  {
    const h = harness(['leg press', '100 lb', '3', '10', '2']);
    h.ctrl.start(); await wait(100); await h.ctrl.stop(); await wait(2000);
    check('Cancel before mic opens: nothing starts', h.svc.starts === 0 && h.view().step === null, `starts=${h.svc.starts}`);
  }

  // 4. Cancel while listening
  {
    const h = harness(['leg press', '100 lb', '3', '10', '2']);
    h.ctrl.start(); await wait(450); await h.ctrl.stop(); await wait(2000);
    check('Cancel mid-listen: session ends, nothing restarts', h.svc.starts === 1 && h.svc.active === null && h.view().step === null && h.done.length === 0, `starts=${h.svc.starts}`);
  }

  // 5. Retry while listening: stop, wait for release, restart, flow continues
  {
    const h = harness(['leg press', '100 lb', '3', '10', '2']);
    h.ctrl.start(); await wait(400);
    h.ctrl.retry();
    await wait(6000);
    check('Retry mid-listen then full flow completes', h.done.length === 1 && h.done[0].name === 'Leg press' && h.svc.killedWrong === 0, JSON.stringify(h.done[0] ?? h.view()));
  }

  // 6. Silent end on a step: one automatic retry, then continues
  {
    const h = harness(['leg press', null, '80 kg', '3', '10', '2']);
    h.ctrl.start(); await wait(6000);
    const e = h.done[0];
    check('Silent step auto-retries once', !!e && e.load === 80, JSON.stringify(e ?? h.view()));
  }

  // 7. Skip while listening on step 2 (Weight)
  {
    const h = harness(['leg press', '3', '10', '2']);
    h.ctrl.start(); await wait(700);
    const onWeight = h.view().step === 1;
    h.ctrl.skip();
    await wait(5000);
    const e = h.done[0];
    check('Skip weight mid-listen, rest completes', onWeight && !!e && e.load === null && e.sets === 3 && e.reps === 10 && e.rir === 2, `onWeight=${onWeight} ${JSON.stringify(e ?? h.view())}`);
  }

  // 8. Rapid double Retry taps never run two sessions at once (start() would throw → "Mic busy" toast)
  {
    const h = harness(['leg press', '100 lb', '3', '10', '2']);
    h.ctrl.start(); await wait(450);
    h.ctrl.retry(); h.ctrl.retry(); h.ctrl.retry();
    await wait(6000);
    check('Triple Retry: no overlap, flow completes', h.done.length === 1 && !h.toasts.some((t) => /busy/i.test(t)), `done=${h.done.length} toasts=${h.toasts.join('|')}`);
  }
  // 9. Badge: "starting" until the mic is really capturing, then "listening"
  {
    const h = harness(['leg press', '100 lb', '3', '10', '2']);
    h.ctrl.start(); await wait(350);
    const s1 = { ...h.view() };
    await wait(150);
    const s2 = { ...h.view() };
    await h.ctrl.stop();
    check('Starting → Listening only after audiostart', s1.starting && !s1.listening && !s2.starting && s2.listening, JSON.stringify({ s1, s2 }));
  }

  // 10. The reported case: Sets not recognised (silence) → tap "4" chip → flow continues by voice
  {
    const h = harness(['leg press', '100 pounds', null, null, '10 reps', '2 to fail']);
    h.ctrl.start();
    await wait(4000); // sets step: silent, auto-retry, silent again → paused + toast
    const stuck = h.view().step === 2 && !h.view().listening;
    h.ctrl.answer('4 sets'); // tap "4"
    await wait(3000);
    const e = h.done[0];
    check('Sets missed twice → toast, then tapped 4 → completes', stuck && h.toasts.some((t) => /tap a number/.test(t)) && !!e && e.sets === 4 && e.reps === 10 && e.rir === 2,
      `stuck=${stuck} toasts=${h.toasts.join('|')} ${JSON.stringify(e ?? h.view())}`);
  }

  // 11. Typing an answer while the mic is listening stops it cleanly and advances
  {
    const h = harness(['leg press', '100 lb', '3', '10', '2']);
    h.ctrl.start(); await wait(450); // step 0 listening, user types instead
    h.ctrl.answer('wall sit');
    await wait(6000);
    const e = h.done[0];
    check('Typed answer mid-listen: no overlap, continues', !!e && e.name === 'Wall sit' && h.svc.killedWrong === 0 && !h.toasts.some((t) => /busy/i.test(t)), JSON.stringify(e ?? h.view()));
  }

  // 12. Browser without speech support: every step answerable by tap/typing
  {
    let view: GuidedView = { ...EMPTY_GUIDED_VIEW }; const done: Record<string, unknown>[] = []; const toasts: string[] = [];
    const ctrl = createGuidedController({ onView: (p) => { view = { ...view, ...p }; }, getGlossary: () => [], toast: (m) => toasts.push(m), onComplete: (e) => done.push(e as unknown as Record<string, unknown>) }, () => null);
    ctrl.start(); ctrl.answer('Leg press'); ctrl.answer('bodyweight'); ctrl.answer('3 sets'); ctrl.answer('25 minutes'); ctrl.answer('skip');
    await wait(50);
    const e = done[0];
    check('No speech API: tap/type through all 5 steps', !!e && e.name === 'Leg press' && e.load === null && e.sets === 3 && e.reps === 25 && e.unit === 'min' && e.rir === null && toasts.length === 1, JSON.stringify(e ?? view));
  }
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  expect(failed, 'checks failed — see the FAIL lines above').toBe(0);
});
