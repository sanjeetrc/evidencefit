import { bestExerciseMatch, EXERCISE_LIBRARY } from '../domain/exerciseLibrary';
import { uid } from '../lib/ids';
import type { CircuitEntry, LoadUnit } from '../types';

// ===== 5-step Guided Voice Mode: pure helpers (no React, no Speech API) =====
// Hints ask for short phrases ("4 sets") rather than a lone number: single short words
// are often missed by speech recognition. Number buttons in the UI cover the rest.
export const GUIDED_PROMPTS = [
  { label: 'Exercise', hint: 'Say the exercise (e.g. “Leg press”), tap one below, or type to search' },
  { label: 'Weight', hint: 'Say e.g. “100 pounds” or “20 kilos”, or tap Bodyweight' },
  { label: 'Sets', hint: 'Say e.g. “4 sets”, or tap a number' },
  { label: 'Reps or minutes', hint: 'Say e.g. “10 reps” or “25 minutes”, or tap' },
  { label: 'To fail', hint: 'Reps left in the tank: say e.g. “2 to fail”, “failure” (0), or “skip” — or tap' },
  // Treadmill-only steps (ids 5, 6): see guidedRoute().
  { label: 'Speed', hint: 'Say the speed, e.g. “5 kilometres per hour” or “5.5 speed”, or tap' },
  { label: 'Incline', hint: 'Say the incline, e.g. “incline 8” or “flat”, or tap' },
] as const;

const TREADMILL_MINUTES_HINT = 'Say how long, e.g. “25 minutes”, or tap';

const STANDARD_ROUTE = [0, 1, 2, 3, 4];
const TREADMILL_ROUTE = [0, 5, 6, 3];
const isTreadmillName = (name: string | undefined) => !!name && /tread\s*mill/i.test(name);

/** The ordered step ids for this draft: treadmill asks speed → incline → minutes instead of weight/sets/to-fail. */
export const guidedRoute = (draft: Partial<CircuitEntry>): number[] =>
  isTreadmillName(draft.name) ? TREADMILL_ROUTE : STANDARD_ROUTE;

/** Next step id after `step`, or null when the entry is complete. */
export function nextGuidedStep(step: number, draft: Partial<CircuitEntry>): number | null {
  const route = guidedRoute(draft);
  const i = route.indexOf(step);
  return i >= 0 && i < route.length - 1 ? route[i + 1] : null;
}

/** 1-based position and total for "Step 2 of 4". */
export function guidedProgress(step: number, draft: Partial<CircuitEntry>): { n: number; total: number } {
  const route = guidedRoute(draft);
  return { n: Math.max(0, route.indexOf(step)) + 1, total: route.length };
}

/** Label + hint for a step (minutes step reads differently for treadmill). */
export function guidedPrompt(step: number, draft: Partial<CircuitEntry>): { label: string; hint: string } {
  if (step === 3 && isTreadmillName(draft.name)) return { label: 'Minutes', hint: TREADMILL_MINUTES_HINT };
  return GUIDED_PROMPTS[step] ?? GUIDED_PROMPTS[0];
}

/** Tap-to-answer chips for a step. */
export function guidedQuickAnswers(step: number, draft: Partial<CircuitEntry>): [string, string][] {
  if (step === 3 && isTreadmillName(draft.name)) {
    return [10, 15, 20, 25, 30, 40, 45].map((n): [string, string] => [`${n} min`, `${n} minutes`]);
  }
  return GUIDED_QUICK_ANSWERS[step] ?? [];
}

/** Tap-to-answer shortcuts per step: [label, answer text fed through the same parser as speech]. */
export const GUIDED_QUICK_ANSWERS: Record<number, [string, string][]> = {
  1: [['Bodyweight', 'bodyweight']],
  2: [1, 2, 3, 4, 5, 6].map((n) => [String(n), `${n} sets`]),
  3: [
    ...[5, 8, 10, 12, 15, 20].map((n): [string, string] => [String(n), `${n} reps`]),
    ...[10, 20, 30].map((n): [string, string] => [`${n} min`, `${n} minutes`]),
  ],
  4: [['0 (fail)', '0'], ['1', '1'], ['2', '2'], ['3', '3'], ['4+', '4'], ['Skip', 'skip']],
  5: [3, 3.5, 4, 4.5, 5, 5.5, 6, 7, 8, 10].map((n) => [String(n), `${n} km/h`]),
  6: [['Flat (0)', '0'], ...[2, 4, 6, 8, 10, 12, 15].map((n): [string, string] => [`${n}%`, `${n} percent`])],
};

/** Speed in km/h from speech: "5.5", "five point five", "5 and a half", "3 miles per hour" (→ km/h). */
export function parseSpeedAnswer(raw: string): number | null {
  let s = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  s = s.replace(new RegExp(`\\b(${Object.keys(BASE_NUM_WORDS).join('|')})\\b`, 'g'), (m) => BASE_NUM_WORDS[m] ?? m);
  s = s.replace(/(\d+)\s*(?:point|dot)\s*(\d)/g, '$1.$2').replace(/(\d+)\s*(?:and a half|½)/g, '$1.5');
  const m = s.match(/\d+(?:\.\d+)?/);
  if (!m) return null;
  let v = Number(m[0]);
  if (/\b(mph|miles?)\b/.test(s)) v *= 1.609;
  // "55" for "5.5" is a common mishearing; real treadmill speeds top out around 20 km/h.
  if (v > 25 && v < 100 && Number.isInteger(v)) v = v / 10;
  if (!(v > 0) || v > 25) return null;
  return Math.round(v * 10) / 10;
}

/** Incline % from speech: "incline 8", "8 percent", "flat"/"zero"/"no incline" → 0. */
export function parseInclineAnswer(raw: string): number | null {
  const s = raw.toLowerCase();
  if (/\b(flat|none|no incline|level)\b/.test(s)) return 0;
  const n = parseSpokenNum(s.replace(/(\d+)\s*(?:point|dot)\s*(\d)/g, '$1.$2'));
  if (n === null || n > 30) return null;
  return Math.round(n * 2) / 2;
}

/**
 * Map a spoken/typed exercise to a known name.
 * Order: the user's own past exercise names (exact wording kept) → built-in library (names + aliases,
 * longest match wins) → fuzzy fallbacks for common speech slips → whatever was said, capitalised.
 */
export function matchKnownExercise(text: string, ownNames: string[] = []): string {
  const norm = text.toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
  const best = bestExerciseMatch(text, [...ownNames.map((name) => ({ name })), ...EXERCISE_LIBRARY]);
  if (best === 'Treadmill' && /incline/.test(norm)) return 'Incline treadmill walk';
  if (best) return best;
  if (/(leg|legs|like|lake|neck|black)\s*press|\bleg\s*(trace|dress)\b/.test(norm)) return 'Leg press';
  // "walk" alone is handled by the library ("Brisk walk"); "walking lunges" is its own entry.
  if (/tread|incline/.test(norm)) return /incline/.test(norm) ? 'Incline treadmill walk' : 'Treadmill';
  if (/bench|bunch|branch/.test(norm)) return 'Bench press';
  if (/chest|chess/.test(norm)) return 'Machine chest press';
  if (/push\s*up/.test(norm)) return 'Push-ups';
  if (/hamstring/.test(norm)) return 'Hamstring curl';
  if (/tricep/.test(norm)) return 'Tricep push-down';
  if (/lat\s*pull|pulldown/.test(norm)) return 'Lat pulldown';
  if (/cable\s*row|seated\s*row/.test(norm)) return 'Seated cable row';
  if (/bicep/.test(norm)) return 'Dumbbell bicep curl';
  if (/surya|syria|namaskar/.test(norm)) return 'Surya Namaskar';
  if (/wall\s*(sit|seat|set)/.test(norm)) return 'Wall sit';
  if (/squat|squad/.test(norm)) return 'Bodyweight squats';
  if (/stepper|steeper/.test(norm)) return 'Aerobic stepper';
  const cleaned = text.trim();
  return (cleaned.charAt(0).toUpperCase() + cleaned.slice(1)).slice(0, 100);
}

const BASE_NUM_WORDS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
};
// Homophones ("to"→2, "for"→4) are only safe when a bare small number is expected (sets, RIR).
const HOMOPHONES: Record<string, string> = { to: '2', too: '2', for: '4' };

export function parseSpokenNum(raw: string, allowHomophones = false): number | null {
  const words = allowHomophones ? { ...BASE_NUM_WORDS, ...HOMOPHONES } : BASE_NUM_WORDS;
  const re = new RegExp(`\\b(${Object.keys(words).join('|')})\\b`, 'g');
  const norm = raw.toLowerCase().replace(re, (m) => words[m] ?? m);
  const m = norm.match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

// Number words + common speech-to-text mishearings for 0–5 (used only for the "to fail" answer).
const RIR_WORDS: Record<string, number> = {
  zero: 0, nil: 0,
  one: 1, won: 1,
  two: 2, to: 2, too: 2, tu: 2,
  three: 3, tree: 3, free: 3,
  four: 4, for: 4, fore: 4,
  five: 5,
};
const FAILURE_WORDS = /\b(fail|failed|failure|failing|max(?:ed)?|all out|couldn'?t|could not)\b/;

/**
 * Reps-in-reserve from a "to fail" answer. Returns null when unclear (never guesses "failure").
 *   "2 to fail" / "22 fail" / "2 2 fail" → 2   "one to fail" / "12 fail" → 1   "02 fail" → 0
 *   "to failure" / "failure" / "maxed out" → 0  "10 reps to failure" → 0      "tree" → 3
 *   "skip" / "none" / "no" / gibberish → null    values above 4 → 4 ("4+ easy")
 */
export function parseRirAnswer(raw: string): number | null {
  const s = raw.toLowerCase().replace(/[-–]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s || /\b(skip|none|no|not sure|don'?t know|pass)\b/.test(s)) return null;
  const clamp = (n: number) => Math.min(4, Math.max(0, Math.round(n)));
  const mentionsFailure = FAILURE_WORDS.test(s);

  // "<digit> to fail" heard as "22 fail", "2 2 fail", "2 to fail", "2 too fail"
  const glued = s.match(/\b([0-9])\s*(?:2|to|too|two)\s*fail/);
  if (glued) return clamp(Number(glued[1]));

  const digits = s.match(/\b(\d+)\b/);
  if (digits) {
    const n = Number(digits[1]);
    if (n <= 5) return clamp(n);
    // "10 reps to failure" answers "did you reach failure?" — yes → 0. A big number alone is unclear.
    return mentionsFailure ? 0 : null;
  }

  // Words: drop the "to fail" connector first so its "to" isn't read as two.
  const words = s.replace(/\b(?:to|too)\s+(?=fail|failure|failing)/g, ' ');
  const w = words.match(new RegExp(`\\b(${Object.keys(RIR_WORDS).join('|')})\\b`));
  if (w) return clamp(RIR_WORDS[w[1]]);

  return mentionsFailure ? 0 : null;
}

export const formatRir = (rir: number | null | undefined): string =>
  rir == null ? '' : rir === 0 ? 'to failure' : rir >= 4 ? '4+ in reserve' : `${rir} to fail`;

/** Apply one spoken answer (already glossary-cleaned) to the guided draft. */
export function interpretGuidedStep(step: number, cleaned: string, draft: Partial<CircuitEntry>, ownExerciseNames: string[] = [], defaultUnit: LoadUnit = 'lb'): Partial<CircuitEntry> {
  const lower = cleaned.toLowerCase();
  const next: Partial<CircuitEntry> = { ...draft };

  if (step === 0) {
    next.name = matchKnownExercise(cleaned, ownExerciseNames);
  } else if (step === 1) {
    if (/\b(skip|none|no|bodyweight|zero)\b/i.test(lower)) {
      next.load = null;
    } else {
      const n = parseSpokenNum(cleaned);
      next.load = n && n > 0 ? n : null;
      // Only a spoken unit overrides the default ("40 kilos" → kg, plain "40" → default unit).
      next.loadUnit = /\b(lb|lbs|pound|pounds)\b|£/i.test(cleaned) ? 'lb' : /\b(kg|kgs|kilo|kilos|kilograms?)\b/i.test(cleaned) ? 'kg' : defaultUnit;
    }
  } else if (step === 2) {
    const n = parseSpokenNum(cleaned, true);
    next.sets = n ? Math.min(20, Math.max(1, Math.round(n))) : 1;
  } else if (step === 3) {
    const n = parseSpokenNum(cleaned);
    if (isTreadmillName(next.name)) {
      // Treadmill: always minutes ("1 hour" → 60).
      const mins = n ? (/\bhours?\b/i.test(cleaned) ? n * 60 : n) : 20;
      next.reps = Math.min(600, Math.max(1, Math.round(mins)));
      next.unit = 'min';
      next.sets = 1;
    } else {
      next.reps = n ? Math.min(600, Math.max(1, Math.round(n))) : 10;
      next.unit = /\b(min|minute|minutes)\b/i.test(cleaned) ? 'min' : /\b(sec|second|seconds)\b/i.test(cleaned) ? 'sec' : 'reps';
    }
  } else if (step === 4) {
    next.rir = parseRirAnswer(cleaned);
  } else if (step === 5) {
    next.speedKmh = parseSpeedAnswer(cleaned);
  } else if (step === 6) {
    next.inclinePct = parseInclineAnswer(cleaned);
  }
  return next;
}

export function buildGuidedEntry(d: Partial<CircuitEntry>, defaultUnit: LoadUnit = 'lb'): CircuitEntry {
  const treadmill = isTreadmillName(d.name);
  const entry: CircuitEntry = {
    id: uid(),
    name: d.name || 'Exercise',
    sets: d.sets ?? 1,
    load: treadmill ? null : d.load ?? null,
    loadUnit: d.loadUnit ?? defaultUnit,
    reps: d.reps ?? (treadmill ? 20 : 10),
    unit: d.unit ?? (treadmill ? 'min' : 'reps'),
    rir: treadmill ? null : d.rir ?? null,
    pain: 0,
  };
  if (treadmill) {
    if (d.speedKmh) entry.speedKmh = d.speedKmh;
    if (d.inclinePct != null) entry.inclinePct = d.inclinePct;
  }
  return entry;
}
