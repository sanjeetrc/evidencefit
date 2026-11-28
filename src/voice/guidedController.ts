import type { CircuitEntry, GlossaryRule, LoadUnit } from '../types';
import { applyVoiceGlossary } from './glossary';
import { buildGuidedEntry, interpretGuidedStep, nextGuidedStep } from './guided';
import { getSR, SPEECH_LANG, type SpeechRec, type SpeechRecCtor } from './speech';

// ===== 5-step guided voice: framework-free controller (React wiring lives in useGuidedVoice) =====
//
// Android Chrome rule this controller is built around:
//   Only ONE recognition session may be alive at a time, and abort() is processed asynchronously
//   by the shared speech service. Aborting a session that is already finishing (it has delivered
//   its result) can land late and kill the NEXT session — which then shows "Listening" but never
//   hears anything. So:
//     1. never abort(); end an unwanted session with stop() and ignore its result;
//     2. never touch a session that already produced a result or an error — let it end itself;
//     3. never start a new session until the previous one has fired onend (or a short timeout).
//
// UX rule: "Listening" is only shown once the mic is actually capturing (onaudiostart). Speaking
// during the start-up gap is the most common reason a short answer like "four" gets lost.

export interface GuidedView {
  step: number | null;
  draft: Partial<CircuitEntry>;
  heard: string;
  /** Mic requested but not capturing yet. */
  starting: boolean;
  /** Mic capturing — safe to speak. */
  listening: boolean;
}

export const EMPTY_GUIDED_VIEW: GuidedView = { step: null, draft: {}, heard: '', starting: false, listening: false };

export interface GuidedCallbacks {
  onView: (patch: Partial<GuidedView>) => void;
  getGlossary: () => GlossaryRule[];
  toast: (msg: string) => void;
  onComplete: (entry: CircuitEntry) => void;
  /** Optional event trace for troubleshooting (enabled with ?voicedebug). */
  onDebug?: (msg: string) => void;
  /** The user's own past exercise names, so voice keeps their wording ("Hack squat (narrow)"). */
  getOwnExercises?: () => string[];
  /** Weight unit when none is spoken (the profile's default; lb if absent). */
  getDefaultUnit?: () => LoadUnit;
}

export interface GuidedTimings {
  startDelayMs: number;
  firstStartDelayMs: number;
  releaseTimeoutMs: number;
  /** If a browser never fires onaudiostart, show "Listening" after this long anyway. */
  audioStartFallbackMs: number;
}

const DEFAULT_TIMINGS: GuidedTimings = { startDelayMs: 250, firstStartDelayMs: 300, releaseTimeoutMs: 1000, audioStartFallbackMs: 1500 };

interface Session {
  rec: SpeechRec;
  /** Delivered a result or an error: the browser is already closing it. */
  finishing: boolean;
  gotResult: boolean;
  errored: boolean;
  ended: boolean;
  released: Promise<void>;
  markEnded: () => void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const NOT_LISTENING: Partial<GuidedView> = { starting: false, listening: false };

export function createGuidedController(
  cb: GuidedCallbacks,
  resolveSR: () => SpeechRecCtor | null = getSR,
  timings: GuidedTimings = DEFAULT_TIMINGS,
) {
  let gen = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let session: Session | null = null;
  let step: number | null = null;
  let draft: Partial<CircuitEntry> = {};
  const dbg = (msg: string) => cb.onDebug?.(msg);

  const newSession = (rec: SpeechRec): Session => {
    let resolve: () => void = () => {};
    const released = new Promise<void>((r) => { resolve = r; });
    const s: Session = {
      rec, finishing: false, gotResult: false, errored: false, ended: false, released,
      markEnded: () => { if (!s.ended) { s.ended = true; resolve(); } },
    };
    return s;
  };

  /** Detach the current session; resolves once the browser has released the mic. */
  const retire = (): Promise<void> => {
    const s = session;
    session = null;
    if (!s || s.ended) return Promise.resolve();
    s.rec.onresult = null;
    s.rec.onerror = null;
    s.rec.onaudiostart = null;
    s.rec.onspeechstart = null;
    s.rec.onend = () => s.markEnded();
    if (!s.finishing) {
      // Still listening (Retry / Skip / Cancel / typed answer mid-listen). Use stop(), never abort():
      // a late abort can land after this session ended on its own and kill the next one instead.
      dbg('stopping previous mic session');
      try { s.rec.stop(); } catch { s.markEnded(); }
    }
    return Promise.race([s.released, sleep(timings.releaseTimeoutMs)]);
  };

  const invalidate = (): Promise<void> => {
    gen += 1;
    clearTimeout(timer);
    return retire();
  };

  const stop = (): Promise<void> => {
    const released = invalidate();
    step = null;
    draft = {};
    cb.onView({ ...EMPTY_GUIDED_VIEW });
    return released;
  };

  const finish = (d: Partial<CircuitEntry>) => {
    const entry = buildGuidedEntry(d, cb.getDefaultUnit?.() ?? 'lb');
    void stop();
    cb.onComplete(entry);
  };

  /** Apply an answer (spoken or typed) to the current step and advance. */
  const advance = (forStep: number, forDraft: Partial<CircuitEntry>, rawText: string) => {
    const cleaned = applyVoiceGlossary(rawText.trim(), cb.getGlossary());
    cb.onView({ heard: cleaned, ...NOT_LISTENING });
    const updated = interpretGuidedStep(forStep, cleaned, forDraft, cb.getOwnExercises?.() ?? [], cb.getDefaultUnit?.() ?? 'lb');
    const next = nextGuidedStep(forStep, updated);
    if (next === null) finish(updated);
    else run(next, updated, 0);
  };

  const run = (nextStep: number, nextDraft: Partial<CircuitEntry>, retryCount = 0, delayMs = timings.startDelayMs) => {
    const released = invalidate();
    const myGen = gen;
    const live = () => myGen === gen;
    step = nextStep;
    draft = nextDraft;
    cb.onView({ step: nextStep, draft: nextDraft, ...NOT_LISTENING });

    const SR = resolveSR();
    if (!SR) {
      // No speech support: the step stays open for tapping/typing.
      if (nextStep === 0 && retryCount === 0) cb.toast('Voice input not supported in this browser — tap or type each answer.');
      return;
    }

    const waited = new Promise<void>((r) => { timer = setTimeout(r, delayMs); });
    void Promise.all([released, waited]).then(() => {
      if (!live()) return;
      const rec = new SR();
      rec.lang = SPEECH_LANG;
      rec.interimResults = false;
      rec.continuous = false;
      const s = newSession(rec);
      let capturing = false;

      const markCapturing = (why: string) => {
        if (capturing || !live() || s.finishing) return;
        capturing = true;
        dbg(why);
        cb.onView({ starting: false, listening: true });
      };

      rec.onaudiostart = () => markCapturing('mic capturing — speak now');
      rec.onspeechstart = () => dbg('speech detected');

      rec.onresult = (ev) => {
        if (!live() || s.gotResult) return;
        s.finishing = true;
        s.gotResult = true;
        const parts: string[] = [];
        for (let i = 0; i < ev.results.length; i++) if (ev.results[i][0]) parts.push(ev.results[i][0].transcript);
        const text = parts.join(' ').trim();
        dbg(`heard "${text}"`);
        advance(nextStep, nextDraft, text);
      };

      rec.onerror = (ev) => {
        s.finishing = true;
        if (!live()) return;
        dbg(`error: ${ev.error}`);
        cb.onView(NOT_LISTENING);
        if (ev.error === 'aborted') return; // onend decides (allows one retry)
        s.errored = true;
        if (ev.error === 'no-speech' && retryCount < 1) { run(nextStep, nextDraft, retryCount + 1); return; }
        cb.toast(ev.error === 'no-speech' ? 'Didn’t catch that — tap a number, type it, or tap Retry.' : `Mic error: ${ev.error}`);
      };

      rec.onend = () => {
        s.finishing = true;
        s.markEnded();
        if (!live()) return;
        dbg(s.gotResult ? 'session ended' : 'session ended without a result');
        cb.onView(NOT_LISTENING);
        // Ended with no result and no real error (common on Android): one automatic retry.
        if (!s.gotResult && !s.errored && retryCount < 1) run(nextStep, nextDraft, retryCount + 1);
        else if (!s.gotResult && !s.errored) cb.toast('Didn’t catch that — tap a number, type it, or tap Retry.');
      };

      session = s;
      try {
        rec.start();
        dbg(`step ${nextStep + 1}: mic starting${retryCount ? ' (auto-retry)' : ''}`);
        cb.onView({ starting: true, listening: false });
        setTimeout(() => markCapturing('no audiostart event — assuming mic is on'), timings.audioStartFallbackMs);
      } catch (e) {
        session = null;
        s.markEnded();
        dbg(`start failed: ${e instanceof Error ? e.message : String(e)}`);
        cb.onView(NOT_LISTENING);
        cb.toast('Mic busy — tap Retry.');
      }
    });
  };

  return {
    start: () => {
      cb.onView({ heard: '' });
      run(0, {}, 0, timings.firstStartDelayMs);
    },
    stop,
    retry: () => { if (step !== null) run(step, draft, 0); },
    skip: () => {
      if (step === null) return;
      const next = nextGuidedStep(step, draft);
      if (next === null) finish(draft);
      else run(next, draft, 0);
    },
    pickExercise: (name: string) => run(nextGuidedStep(0, { name }) ?? 1, { name }, 0),
    /** Typed or tapped answer for the current step (same parsing as speech). */
    answer: (text: string) => {
      if (step === null || !text.trim()) return;
      dbg(`typed/tapped "${text.trim()}"`);
      advance(step, draft, text);
    },
  };
}

export type GuidedController = ReturnType<typeof createGuidedController>;
