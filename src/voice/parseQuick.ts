import { uid } from '../lib/ids';
import type { CircuitEntry, LoadUnit, Unit } from '../types';

// ===== Offline Natural-Language Quick Parser =====
const WORD_NUMS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

export function replaceWordNums(s: string): string {
  return s
    .replace(/\b(1|2|3|4)2\s*fail(?:ure)?\b/gi, '$1 to fail') // fixes voice "22 fail" -> "2 to fail"
    .replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi, (m) => String(WORD_NUMS[m.toLowerCase()] ?? m));
}

// RIR is only 0–5; "12 reps to failure" means 12 reps at RIR 0, not RIR 12.
const RIR_RE = String.raw`\b[0-5]\s*(?:reps?\s*)?(?:to\s*fail(?:ure)?|rir|in\s*(?:the\s*)?tank)|\brir\s*[0-5]`;
const LOAD_UNITS = String.raw`(?:lbs?|pounds?|kgs?|kilos?)`;
const TIME_UNITS = String.raw`(?:min|mins|minutes?|sec|secs|seconds?)`;
const NOT_LOAD_OR_TIME = String.raw`(?!\s*(?:${LOAD_UNITS}|${TIME_UNITS})\b)`;
const UNIT_ONLY = /^(?:\d+(?:\.\d+)?|[x×]|sets?|reps?|rounds?|min(?:ute)?s?|sec(?:ond)?s?|lbs?|pounds?|kgs?|kilos?|to|fail(?:ure)?|rir|of|and|with|at|weight|used|\s)+$/i;

/**
 * Split a dictated/typed circuit into one segment per exercise.
 * Splits on newline, ";", "," (not inside parentheses), "then", "next", and "and <number>".
 * Fragments with no exercise name ("10 reps") are merged into their neighbour.
 */
export function splitSegments(text: string): string[] {
  const parts = text
    .split(/[\n;]|,(?![^(]*\))|\b(?:and then|then|next)\b|\band\b(?=\s+\d)/i)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  let carry = '';
  for (const p of parts) {
    if (UNIT_ONLY.test(p)) {
      if (out.length) out[out.length - 1] += ` ${p}`; // "leg press 100 lb, 10 reps" -> merge back
      else carry += ` ${p}`; // "3 sets and 10 reps of chest press" -> carry forward
      continue;
    }
    out.push(`${carry} ${p}`.trim());
    carry = '';
  }
  if (carry.trim() && !out.length) out.push(carry.trim());
  return out;
}

const SPEED_RE = /(?:speed\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(?:km\/?h|kmph|kph|km per hour|kilometers? per hour|kilometres? per hour)?|(\d+(?:\.\d+)?)\s*(?:km\/?h|kmph|kph|km per hour|kilometers? per hour|kilometres? per hour))/i;
const INCLINE_RE = /(?:incline|gradient|grade)\s*(?:of\s*|at\s*)?(\d+(?:\.\d+)?)\s*(?:%|percent)?|(\d+(?:\.\d+)?)\s*(?:%|percent)(?:\s*(?:incline|gradient|grade))?/i;

const MPH_RE = /(?:speed\s*(?:of\s*)?)?(\d+(?:\.\d+)?)\s*(?:mph|miles?\s*(?:per|an)\s*hour)/i;
const KM_PER_MILE = 1.609;

/** Pull "5.5 kmph" / "speed 5" / "4 mph" (→ km/h) and "incline 8" / "8%" out of a treadmill line. */
function extractTreadmill(text: string): { rest: string; speedKmh: number | null; inclinePct: number | null } {
  let rest = text;
  let speedKmh: number | null = null;
  let inclinePct: number | null = null;
  const mph = rest.match(MPH_RE);
  const sp = mph ?? rest.match(SPEED_RE);
  if (sp) {
    const v = mph ? Number(mph[1]) * KM_PER_MILE : Number(sp[1] ?? sp[2]);
    if (v > 0 && v <= 25) speedKmh = Math.round(v * 10) / 10;
    rest = rest.replace(sp[0], ' ');
  }
  const inc = rest.match(INCLINE_RE);
  if (inc) {
    const v = Number(inc[1] ?? inc[2]);
    if (v >= 0 && v <= 30) inclinePct = Math.round(v * 2) / 2;
    rest = rest.replace(inc[0], ' ');
  }
  return { rest: rest.replace(/\s+/g, ' ').trim(), speedKmh, inclinePct };
}

/** Phrases that are sets, reps, time or RIR, masked out before looking for a bare load. */
const MASK_RES = [
  new RegExp(RIR_RE, 'gi'),
  /\d+\s*[x×]\s*\d+/gi,
  /\d+\s*(?:sets?|rounds?)\s*(?:of\s*)?\d+\b(?!\s*(?:lbs?|pounds?|kgs?|kilos?)\b)(?:\s*reps?\b)?/gi,
  /sets?\s*(?:of\s*)?\d+|\d+\s*(?:sets?|rounds?)\b/gi,
  /reps?\s*(?:of\s*)?\d+|\d+\s*reps?\b/gi,
  /\d+\s*(?:min|mins|minutes?|sec|secs|seconds?)\b/gi,
];

/**
 * A bare number after the name (or after the "#" that masks sets×reps) that isn't a time, %, degree,
 * reps/sets count, "to fail"/RIR or pain score.
 */
const BARE_LOAD_RE = /([a-z)#])(?<!\b(?:rir|pain))\s+(?:at\s+|@\s*)?(\d+(?:\.\d+)?)(?![\d.])(?!\s*(?:[°%x×]|reps?\b|sets?\b|rounds?\b|mins?\b|minutes?\b|secs?\b|seconds?\b|km|kph|kmph|to\s*fail|fail|rir\b|in\s*(?:the\s*)?tank))/i;

/** `defaultUnit` is the entry's weight unit unless kg/lb is said explicitly. */
export function parseQuickLine(raw: string, defaultUnit: LoadUnit = 'lb'): CircuitEntry | null {
  let text = replaceWordNums(raw.trim());
  if (!text) return null;

  const treadmill = /tread\s*mill/i.test(text);
  let speedKmh: number | null = null;
  let inclinePct: number | null = null;
  if (treadmill) {
    ({ rest: text, speedKmh, inclinePct } = extractTreadmill(text));
    // Keep the word "incline" in the name if it was used as a description ("incline treadmill walk").
  }

  let sets = 1;
  let reps = 10;
  let unit: Unit = 'reps';
  let load: number | null = null;
  let loadUnit: LoadUnit = defaultUnit;
  let rir: number | null = null;
  let usedLeadNum = false;
  let usedTrailNum = false;
  let gotSetsAndReps: boolean; // both given explicitly ("3x10", "3 sets 12 reps", "3 sets of 12")

  const sxr = text.match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (sxr) {
    sets = Math.min(20, Math.max(1, Number(sxr[1])));
    reps = Math.min(600, Math.max(1, Number(sxr[2])));
    gotSetsAndReps = true;
  } else {
    const setsM = text.match(/sets?\s*(?:of\s*)?(\d+)|(\d+)\s*sets?|(\d+)\s*rounds?/i);
    if (setsM) sets = Math.min(20, Math.max(1, Number(setsM[1] || setsM[2] || setsM[3])));

    const minM = text.match(/(\d+)\s*(?:min|mins|minutes?)\b/i);
    const secM = text.match(/(\d+)\s*(?:sec|secs|seconds?)\b/i);
    const textNoRir = text.replace(new RegExp(RIR_RE, 'gi'), '');
    const repM = textNoRir.match(/reps?\s*(?:of\s*)?(\d+)|(\d+)\s*reps?\b/i);
    const setsOfM = textNoRir.match(new RegExp(String.raw`\d+\s*(?:sets?|rounds?)\s*(?:of\s*)?(\d+)\b${NOT_LOAD_OR_TIME}`, 'i'));

    if (minM) { reps = Number(minM[1]); unit = 'min'; }
    else if (secM) { reps = Number(secM[1]); unit = 'sec'; }
    else if (repM) { reps = Number(repM[1] || repM[2]); }
    else if (setsOfM) { reps = Number(setsOfM[1]); } // "3 sets of 12"
    else {
      const lead = text.match(/^(\d+)\s+(?=[a-z])/i); // "60 push-ups"
      const trail = text.match(/[a-z)]\s+(\d+)\s*$/i); // "push-ups 20"
      if (lead) { reps = Number(lead[1]); usedLeadNum = true; }
      else if (trail) { reps = Number(trail[1]); usedTrailNum = true; }
    }
    reps = Math.min(600, Math.max(1, reps));
    gotSetsAndReps = !!setsM && !!(repM || setsOfM);
  }

  const wtM = text.match(new RegExp(String.raw`(?:weight\s*(?:used)?\s*)?(\d+(?:\.\d+)?)\s*(${LOAD_UNITS})\b`, 'i'));
  if (wtM) {
    load = Number(wtM[1]);
    loadUnit = /^lb|pound/i.test(wtM[2]) ? 'lb' : 'kg';
  } else if (gotSetsAndReps && !treadmill) {
    // "chest press 50 3x10" / "lat pulldown 60 3 sets 12 reps": with sets and reps given, a bare number next
    // to the name is the weight, in the default unit. Without this it ended up in the name ("Chest press 50").
    // Sets/reps/time/RIR phrases are masked with same-length "   #" so match positions still fit `text`
    // (the "#" is last, so "3x10 50" keeps all of "3x10" when the 50 is cut out).
    const masked = MASK_RES.reduce((t, re) => t.replace(re, (s) => '#'.padStart(s.length, ' ')), text);
    const m = BARE_LOAD_RE.exec(masked);
    if (m && Number(m[2]) > 0 && Number(m[2]) <= 1000) {
      load = Number(m[2]);
      text = `${text.slice(0, m.index + 1)} ${text.slice(m.index + m[0].length)}`;
    }
  }

  const rirM = text.match(/\b([0-5])\s*(?:reps?\s*)?(?:to\s*fail(?:ure)?|rir|in\s*(?:the\s*)?tank)|\brir\s*([0-5])/i);
  if (rirM) rir = Math.min(4, Number(rirM[1] ?? rirM[2])); // UI and AI path both use 0–4
  else if (/\bto\s*fail(?:ure)?\b/i.test(text)) rir = 0;

  let name = text
    .replace(/^(?:did|done|completed)\s+/i, '')
    .replace(usedLeadNum ? /^\d+\s+/ : /$^/, '')
    .replace(usedTrailNum ? /\s+\d+\s*$/ : /$^/, '')
    .replace(/(\d+)\s*[x×]\s*(\d+)/gi, '')
    .replace(new RegExp(String.raw`\d+\s*(?:sets?|rounds?)\s*(?:of\s*)?\d+\b${NOT_LOAD_OR_TIME}(?:\s*reps?\b)?`, 'gi'), '')
    .replace(/sets?\s*(?:of\s*)?\d+|\d+\s*sets?|\d+\s*rounds?/gi, '')
    .replace(new RegExp(String.raw`(?:weight\s*(?:used)?\s*)?\d+(?:\.\d+)?\s*${LOAD_UNITS}\b`, 'gi'), '')
    .replace(new RegExp(RIR_RE, 'gi'), '')
    .replace(/\d+\s*(?:min|mins|minutes?|sec|secs|seconds?|reps?)\b|reps?\s*(?:of\s*)?\d+/gi, '')
    .replace(/\bto\s*fail(?:ure)?\b/gi, '')
    .replace(/\b(and|with|at|of|for)\b/gi, ' ')
    .replace(/[,;]+|(?:^|\s)[-.]+|[-.]+(?=\s|$)/g, ' ') // keep in-word hyphens ("Push-ups") and decimals
    .replace(/\s+/g, ' ')
    .trim();

  if (!name) name = 'Circuit exercise';
  name = name.charAt(0).toUpperCase() + name.slice(1);

  const entry: CircuitEntry = { id: uid(), name, sets, load, loadUnit, reps, unit, rir, pain: 0 };
  if (treadmill) {
    // A bare number on a treadmill line is minutes ("treadmill 25").
    if (entry.unit === 'reps' && !/\breps?\b/i.test(text)) entry.unit = 'min';
    entry.rir = null;
    if (speedKmh !== null) entry.speedKmh = speedKmh;
    if (inclinePct !== null) entry.inclinePct = inclinePct;
  }
  return entry;
}

/** Full offline pipeline for an already glossary-cleaned text. */
export function parseQuickText(cleaned: string, defaultUnit: LoadUnit = 'lb'): CircuitEntry[] {
  return splitSegments(cleaned).map((line) => parseQuickLine(line, defaultUnit)).filter((x): x is CircuitEntry => x !== null);
}
