/**
 * Offline reader for a whole circuit typed or dictated in plain words, e.g.
 *   "leg press 40 kg 3 by 12 RIR 2, then treadmill 20 minutes 4.8 km/h incline 1".
 * Runs entirely on the device. Speech is turned into text by the browser; this only reads the text.
 */
import { fromUnit } from './units';
import { getDayKeyFromDate } from './dates';
import type { LoadUnit, Location, LoggedExercise, Unit, Workout } from './types';
import { uid } from './state';

export interface ParsedEntry {
  name: string;
  sets: number;
  /** Reps, or seconds / minutes when unit says so. 0 = not given. */
  reps: number;
  unit: Unit;
  load: number | null;
  loadUnit: LoadUnit;
  rpe: number | null;
  pain: number;
  speedKmh: number | null;
  inclinePct: number | null;
  /** The words this entry was read from. */
  raw: string;
}

export interface ParseOutcome {
  entries: ParsedEntry[];
  /** Pieces that had a name but no reps or time, so they cannot be saved yet. */
  incomplete: ParsedEntry[];
}

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** "three sets of twelve" → "3 sets of 12"; "four point eight" → "4.8"; "one hundred twenty" → "120". */
export function wordsToNumbers(text: string): string {
  const isNumWord = (w: string) => w in UNITS || w in TENS || w === 'hundred';
  const line = (l: string) => {
    const words = l.split(/[ \t]+/);
    const out: string[] = [];
    for (let i = 0; i < words.length;) {
      const w = words[i].toLowerCase();
      if (!isNumWord(w)) { out.push(words[i]); i++; continue; }
      let cur = 0;
      while (i < words.length && isNumWord(words[i].toLowerCase())) {
        const t = words[i].toLowerCase();
        if (t in UNITS) cur += UNITS[t];
        else if (t in TENS) cur += TENS[t];
        else cur = (cur || 1) * 100;
        i++;
      }
      out.push(String(cur));
    }
    return out.join(' ');
  };
  return text.split('\n').map(line).join('\n')
    .replace(/(\d+)\s+point\s+(\d+)/gi, '$1.$2')
    .replace(/(\d+)\s+and\s+a\s+half/gi, (_, n) => `${n}.5`);
}

const KEYWORD = '(?:rir|rpe|pain|no pain|incline|effort|speed|at|with|for|reps|sets|kg|minutes|seconds|left|in)\\b';
const SPLIT = new RegExp(
  String.raw`\n|;|\.\s+(?=[a-z])|\bthen\b|\bnext\b|\bafter that\b` +
  String.raw`|(?<=\d|kg|kgs|lbs?|reps|minutes|mins|seconds|secs|%|h)\s*(?:,\s*(?:and\s+)?|\s+and\s+)(?!${KEYWORD})(?=[a-z]{3,})`,
  'i',
);

const FILLER = new Set(['i', 'did', 'do', 'done', 'at', 'of', 'for', 'with', 'and', 'the', 'a', 'an', 'on', 'set', 'sets', 'rep', 'reps', 'times',
  'then', 'weight', 'load', 'about', 'around', 'approx', 'approximately', 'roughly', 'speed', 'in', 'total', 'using', 'was', 'were', 'it', 'my', 'some', 'also', 'plus', 'x']);

const toNum = (s: string) => parseFloat(s);

function readEntry(chunk: string): ParsedEntry | null {
  let s = ` ${wordsToNumbers(chunk).toLowerCase().replace(/[,]/g, ' ')} `;
  const take = (re: RegExp): RegExpMatchArray | null => {
    const m = s.match(re);
    if (m) s = s.replace(m[0], ' ');
    return m;
  };
  const e: ParsedEntry = { name: '', sets: 0, reps: 0, unit: 'reps', load: null, loadUnit: 'kg', rpe: null, pain: 0, speedKmh: null, inclinePct: null, raw: chunk.trim() };

  const speed = take(/(\d+(?:\.\d+)?)\s*(?:km\/h|kmph|kph|km\s*an?\s*hour|km per hour|kilomet(?:er|re)s?\s*(?:per|an?)\s*hour)/);
  if (speed) e.speedKmh = toNum(speed[1]);
  const incline = take(/incline\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(?:%|percent)?|(\d+(?:\.\d+)?)\s*(?:%|percent)\s*incline/);
  if (incline) e.inclinePct = toNum(incline[1] ?? incline[2]);
  // "RIR 2" is tried before "2 in reserve", so "3x12 RIR 2" does not read 12 as the RIR.
  const rir = take(/\b(?:rir|reps? in reserve)\s*(?:of\s*)?(\d+)/) ?? take(/(\d+)\s*(?:rir|reps? in reserve|in reserve|in the tank|left in the tank)\b/);
  if (rir) e.rpe = Math.max(1, Math.min(10, 10 - toNum(rir[1])));
  const rpe = take(/(?:rpe|effort)\s*(?:of\s*)?(\d+(?:\.\d+)?)/);
  if (rpe) e.rpe = Math.max(1, Math.min(10, toNum(rpe[1])));
  if (take(/\bno pain\b|\bpain[- ]free\b/)) e.pain = 0;
  const pain = take(/\bpain\s*(?:of\s*|level\s*)?(\d+)(?:\s*(?:\/|out of)\s*10)?/) ?? take(/(\d+)\s*(?:(?:\/|out of)\s*10\s*)?pain/);
  if (pain) e.pain = Math.max(0, Math.min(10, toNum(pain[1])));
  if (take(/\bbody\s*weight\b|\bbodyweight\b|\bno weight\b/)) e.load = null;
  const load = take(/(\d+(?:\.\d+)?)\s*(kgs?|kilos?|kilograms?|lbs?|pounds?)\b/);
  if (load) { e.load = toNum(load[1]); e.loadUnit = /^(lb|pound)/.test(load[2]) ? 'lb' : 'kg'; }

  const sxr = take(/(\d+)\s*(?:x|×|\*|by|into|sets? of|rounds? of)\s*(\d+(?:\.\d+)?)\s*(reps?|repetitions?|times|sec(?:ond)?s?|secs|s\b|min(?:ute)?s?|mins?)?/);
  if (sxr) {
    e.sets = toNum(sxr[1]); e.reps = toNum(sxr[2]);
    const u = sxr[3] ?? '';
    if (/^s|^sec/.test(u)) e.unit = 'sec';
    else if (/^min/.test(u)) e.unit = 'min';
  }
  if (!e.sets) { const m = take(/(\d+)\s*(?:sets?|rounds?)\b/); if (m) e.sets = toNum(m[1]); }
  if (!e.reps) {
    const mins = take(/(\d+(?:\.\d+)?)\s*(?:min(?:ute)?s?|mins?)\b/);
    if (mins) { e.reps = toNum(mins[1]); e.unit = 'min'; }
    else {
      const secs = take(/(\d+)\s*(?:sec(?:ond)?s?|secs)\b/);
      if (secs) { e.reps = toNum(secs[1]); e.unit = 'sec'; }
      else { const r = take(/(\d+)\s*(?:reps?|repetitions?|times)\b/); if (r) e.reps = toNum(r[1]); }
    }
  }
  if (!e.reps) {
    // A lone number left over is most likely the reps ("push-ups 12").
    const bare = take(/\b(\d+)\b/);
    if (bare) e.reps = toNum(bare[1]);
  }
  e.name = s.replace(/[^a-z\-'\s()]/g, ' ').split(/\s+/).filter((w) => w && !FILLER.has(w)).join(' ').trim();
  if (!e.name && !e.reps) return null;
  if (!e.sets) e.sets = 1;
  e.sets = Math.min(20, Math.max(1, Math.round(e.sets)));
  e.reps = Math.min(600, Math.max(0, e.reps));
  if (e.unit === 'reps') e.reps = Math.round(e.reps);
  return e;
}

const tokens = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !FILLER.has(w)).map((w) => w.replace(/s$/, ''));

/** Picks the closest known exercise name (from the plan and past logs), or keeps the spoken name tidied up. */
export function matchName(spoken: string, known: string[]): string {
  const a = new Set(tokens(spoken));
  if (!a.size) return spoken ? capitalise(spoken) : 'Exercise';
  let best = ''; let bestScore = 0;
  for (const k of known) {
    const b = new Set(tokens(k.replace(/\(.*?\)/g, '')));
    if (!b.size) continue;
    let common = 0;
    a.forEach((t) => { if (b.has(t)) common++; });
    const score = common / Math.max(a.size, b.size);
    if (score > bestScore) { bestScore = score; best = k; }
  }
  return bestScore >= 0.5 ? best : capitalise(spoken);
}
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function parseCircuitText(text: string, knownNames: string[] = []): ParseOutcome {
  const entries: ParsedEntry[] = [];
  const incomplete: ParsedEntry[] = [];
  for (const chunk of wordsToNumbers(text).split(SPLIT)) {
    if (!chunk || !chunk.trim()) continue;
    const e = readEntry(chunk);
    if (!e) continue;
    e.name = matchName(e.name, knownNames);
    if (/treadmill|walk|cycl|bike|elliptical|rowing|row machine|stepper|cross.?trainer|jog/i.test(e.name) && e.unit === 'reps' && e.speedKmh !== null) e.unit = 'min';
    (e.reps > 0 ? entries : incomplete).push(e);
  }
  return { entries, incomplete };
}

export function describeEntry(e: ParsedEntry): string {
  const amount = e.unit === 'reps' ? `${e.reps} reps` : `${e.reps} ${e.unit}`;
  const parts = [e.sets > 1 ? `${e.sets} × ${amount}` : amount];
  if (e.load !== null) parts.push(`${e.load} ${e.loadUnit}`);
  if (e.speedKmh !== null) parts.push(`${e.speedKmh} km/h`);
  if (e.inclinePct !== null) parts.push(`incline ${e.inclinePct}%`);
  if (e.rpe !== null) parts.push(`RPE ${e.rpe}`);
  if (e.pain > 0) parts.push(`pain ${e.pain}/10`);
  return parts.join(' · ');
}

export function circuitToWorkout(entries: ParsedEntry[], opts: { date: string; location: Location; notes?: string }): Workout {
  const exercises: LoggedExercise[] = entries.map((e) => {
    const extra = [e.speedKmh !== null ? `${e.speedKmh} km/h` : '', e.inclinePct !== null ? `incline ${e.inclinePct}%` : ''].filter(Boolean).join(', ');
    return {
      exerciseId: uid(), name: e.name.slice(0, 120), repMin: e.reps, repMax: e.reps, unit: e.unit, targetRpe: 7, loadUnit: e.loadUnit,
      ...(extra ? { notes: extra } : {}),
      sets: Array.from({ length: e.sets }, () => ({
        loadKg: e.load === null ? 0 : Math.round(fromUnit(e.load, e.loadUnit) * 1000) / 1000,
        reps: e.reps, rpe: e.rpe, pain: e.pain,
      })),
    };
  });
  return {
    id: uid(), date: opts.date, dayKey: getDayKeyFromDate(opts.date), title: 'Circuit (typed or spoken)', location: opts.location,
    sleepHours: null, restingHr: null, climate: 'Normal', notes: (opts.notes ?? '').slice(0, 1000), exercises,
  };
}
