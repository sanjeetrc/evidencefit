import { uid } from '../lib/ids';
import { isTreadmill } from './exercise';
import type { CircuitEntry, LoadUnit, LoggedWorkout, Unit } from '../types';

// ===== Exercise library: built-in choices + the user's own history =====

export const EXERCISE_CATEGORIES = ['Legs', 'Push', 'Pull', 'Arms & Shoulders', 'Core', 'Cardio', 'Mobility & Balance'] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

export interface LibraryExercise {
  name: string;
  category: ExerciseCategory;
  /** Other ways people say it (used for voice matching and search). */
  aliases?: string[];
  sets: number;
  reps: number;
  unit: Unit;
  /** Weight unit comes from the profile's default (lb unless changed in Settings). */
  defaultLoad?: number;
}

const ex = (name: string, category: ExerciseCategory, o: Partial<LibraryExercise> = {}): LibraryExercise =>
  ({ name, category, sets: 3, reps: 12, unit: 'reps', ...o });
const timed = (name: string, category: ExerciseCategory, minutes: number, aliases?: string[]): LibraryExercise =>
  ex(name, category, { sets: 1, reps: minutes, unit: 'min', aliases });
const hold = (name: string, category: ExerciseCategory, seconds: number, aliases?: string[]): LibraryExercise =>
  ex(name, category, { reps: seconds, unit: 'sec', aliases });

export const EXERCISE_LIBRARY: LibraryExercise[] = [
  // Legs
  ex('Leg press', 'Legs', { reps: 10, defaultLoad: 100, aliases: ['leg press machine'] }),
  ex('Leg extension', 'Legs', { aliases: ['leg extensions', 'quad extension'] }),
  ex('Hamstring curl', 'Legs', { defaultLoad: 50, aliases: ['leg curl', 'hamstring curls', 'lying leg curl', 'seated leg curl'] }),
  ex('Bodyweight squats', 'Legs', { reps: 15, aliases: ['squats', 'squat', 'air squats'] }),
  ex('Goblet squat', 'Legs', { reps: 10, aliases: ['goblet squats', 'dumbbell squat'] }),
  ex('Sit-to-stand (chair)', 'Legs', { reps: 10, aliases: ['sit to stand', 'chair stand', 'chair stands', 'chair squats', 'chair squat'] }),
  ex('Lunges', 'Legs', { reps: 10, aliases: ['lunge', 'static lunges', 'reverse lunges'] }),
  ex('Walking lunges', 'Legs', { reps: 10, aliases: ['walking lunge'] }),
  ex('Step-ups', 'Legs', { reps: 10, aliases: ['step ups', 'step up', 'box step ups'] }),
  ex('Glute bridge', 'Legs', { reps: 15, aliases: ['glute bridges', 'bridges', 'hip bridge'] }),
  ex('Hip thrust', 'Legs', { reps: 10, aliases: ['hip thrusts', 'barbell hip thrust'] }),
  ex('Calf raises', 'Legs', { reps: 15, aliases: ['calf raise', 'heel raises', 'standing calf raise'] }),
  hold('Wall sit', 'Legs', 60, ['wall sits', 'wall squat']),
  ex('Romanian deadlift', 'Legs', { reps: 10, aliases: ['rdl', 'romanian deadlifts', 'stiff leg deadlift'] }),
  ex('Deadlift', 'Legs', { reps: 8, aliases: ['deadlifts', 'trap bar deadlift'] }),
  ex('Hip abduction machine', 'Legs', { aliases: ['hip abduction', 'abductor', 'abductor machine', 'outer thigh machine'] }),
  ex('Hip adduction machine', 'Legs', { aliases: ['hip adduction', 'adductor', 'adductor machine', 'inner thigh machine'] }),
  ex('Smith machine squat', 'Legs', { reps: 10, aliases: ['smith squat'] }),
  ex('Hack squat', 'Legs', { reps: 10, aliases: ['hack squats'] }),

  // Push
  ex('Push-ups', 'Push', { reps: 15, aliases: ['push ups', 'pushups', 'push up'] }),
  ex('Wall push-ups', 'Push', { reps: 15, aliases: ['wall push ups', 'wall pushups'] }),
  ex('Incline push-ups', 'Push', { reps: 12, aliases: ['incline push ups', 'bench push ups'] }),
  ex('Knee push-ups', 'Push', { reps: 12, aliases: ['knee push ups', 'kneeling push ups'] }),
  ex('Machine chest press', 'Push', { reps: 10, defaultLoad: 50, aliases: ['chest press', 'chest press machine', 'seated chest press'] }),
  ex('Bench press', 'Push', { reps: 10, aliases: ['barbell bench press', 'flat bench'] }),
  ex('Dumbbell chest press', 'Push', { reps: 10, aliases: ['dumbbell bench press', 'db chest press'] }),
  ex('Incline dumbbell press', 'Push', { reps: 10, aliases: ['incline press', 'incline bench press'] }),
  ex('Chest fly (pec deck)', 'Push', { aliases: ['pec deck', 'chest fly', 'chest flies', 'fly machine', 'pec fly'] }),
  ex('Tricep push-down', 'Push', { reps: 15, defaultLoad: 30, aliases: ['tricep pushdown', 'triceps push down', 'triceps pushdown', 'rope pushdown'] }),
  ex('Bench dips', 'Push', { reps: 10, aliases: ['dips', 'tricep dips', 'chair dips'] }),
  ex('Overhead tricep extension', 'Push', { aliases: ['tricep extension', 'triceps extension', 'overhead extension'] }),

  // Pull
  ex('Lat pulldown', 'Pull', { defaultLoad: 60, aliases: ['lat pull down', 'lat pulldowns', 'pulldown'] }),
  ex('Seated cable row', 'Pull', { defaultLoad: 60, aliases: ['cable row', 'seated row', 'low row'] }),
  ex('Dumbbell row', 'Pull', { defaultLoad: 10, aliases: ['one arm row', 'single arm row', 'db row', 'dumbbell rows'] }),
  ex('Machine row', 'Pull', { aliases: ['row machine', 'chest supported row'] }),
  ex('Assisted pull-ups', 'Pull', { reps: 8, aliases: ['pull ups', 'pull-ups', 'pullups', 'chin ups', 'assisted pull ups', 'assisted chin ups'] }),
  ex('Face pulls', 'Pull', { reps: 15, aliases: ['face pull'] }),
  ex('Resistance band row', 'Pull', { reps: 15, aliases: ['band row', 'band rows', 'theraband row'] }),
  ex('Back extension', 'Pull', { reps: 12, aliases: ['back extensions', 'hyperextension', 'superman', 'supermans'] }),
  ex('Reverse fly', 'Pull', { reps: 12, aliases: ['rear delt fly', 'reverse flies', 'rear delt machine'] }),

  // Arms & Shoulders
  ex('Dumbbell bicep curl', 'Arms & Shoulders', { defaultLoad: 5, aliases: ['bicep curl', 'biceps curl', 'bicep curls', 'curls', 'dumbbell curl'] }),
  ex('Hammer curl', 'Arms & Shoulders', { aliases: ['hammer curls'] }),
  ex('Cable bicep curl', 'Arms & Shoulders', { aliases: ['cable curl', 'cable curls'] }),
  ex('Shoulder press', 'Arms & Shoulders', { reps: 10, aliases: ['overhead press', 'military press', 'dumbbell shoulder press', 'shoulder press machine'] }),
  ex('Lateral raise', 'Arms & Shoulders', { aliases: ['lateral raises', 'side raise', 'side raises', 'side lateral raise'] }),
  ex('Front raise', 'Arms & Shoulders', { aliases: ['front raises'] }),
  ex('Shrugs', 'Arms & Shoulders', { aliases: ['shrug', 'shoulder shrugs', 'dumbbell shrugs'] }),
  ex('Farmer carry', 'Arms & Shoulders', { reps: 40, unit: 'sec', aliases: ["farmer's walk", 'farmers walk', 'farmer walk', 'farmers carry', 'suitcase carry'] }),
  ex('Wrist curls', 'Arms & Shoulders', { reps: 15, aliases: ['wrist curl', 'grip training'] }),

  // Core
  hold('Plank', 'Core', 30, ['planks', 'front plank', 'forearm plank']),
  hold('Side plank', 'Core', 20, ['side planks']),
  ex('Bird dog', 'Core', { reps: 10, aliases: ['bird dogs', 'birddog'] }),
  ex('Dead bug', 'Core', { reps: 10, aliases: ['dead bugs', 'deadbug'] }),
  ex('Crunches', 'Core', { reps: 15, aliases: ['crunch', 'sit ups', 'sit-ups', 'situps', 'ab crunch'] }),
  ex('Leg raises', 'Core', { reps: 12, aliases: ['leg raise', 'lying leg raise'] }),
  ex('Pallof press', 'Core', { reps: 10, aliases: ['pallof'] }),
  ex('Russian twist', 'Core', { reps: 15, aliases: ['russian twists'] }),
  ex('Core / Abs', 'Core', { reps: 15, aliases: ['abs', 'core', 'ab workout', 'core workout'] }),

  // Cardio
  timed('Brisk walk', 'Cardio', 30, ['walk', 'walking', 'morning walk', 'evening walk', 'outdoor walk']),
  timed('Incline treadmill walk', 'Cardio', 25, ['incline walk', 'incline treadmill', 'treadmill incline']),
  timed('Treadmill', 'Cardio', 20, ['treadmill walk', 'treadmill walking']),
  timed('Stationary bike', 'Cardio', 20, ['exercise bike', 'cycle', 'cycling', 'bike', 'spin bike', 'recumbent bike']),
  timed('Elliptical', 'Cardio', 20, ['cross trainer', 'elliptical trainer']),
  timed('Aerobic stepper', 'Cardio', 15, ['stepper', 'step machine']),
  timed('Rowing machine', 'Cardio', 15, ['rower', 'rowing', 'ergometer']),
  timed('Stair climber', 'Cardio', 10, ['stairs', 'stair climbing', 'stairmaster', 'stair master']),
  timed('Swimming', 'Cardio', 20, ['swim', 'laps']),
  timed('Jogging', 'Cardio', 20, ['jog', 'running', 'run']),
  timed('Aqua aerobics', 'Cardio', 30, ['water aerobics', 'aqua']),

  // Mobility & Balance
  ex('Surya Namaskar', 'Mobility & Balance', { sets: 4, reps: 10, aliases: ['sun salutation', 'sun salutations', 'surya namaskara'] }),
  timed('Yoga', 'Mobility & Balance', 20, ['yoga session', 'asanas']),
  timed('Stretching', 'Mobility & Balance', 10, ['stretch', 'stretches', 'cool down stretch']),
  timed('Pranayama', 'Mobility & Balance', 10, ['breathing exercise', 'breathing exercises', 'anulom vilom']),
  hold('Single-leg balance', 'Mobility & Balance', 30, ['single leg balance', 'one leg balance', 'one leg stand', 'balance']),
  ex('Tandem walk', 'Mobility & Balance', { sets: 2, reps: 10, aliases: ['heel to toe walk', 'heel toe walk'] }),
  timed('Tai chi', 'Mobility & Balance', 15, ['taichi']),
  ex('Shoulder mobility', 'Mobility & Balance', { sets: 2, reps: 10, aliases: ['arm circles', 'shoulder circles', 'shoulder rolls'] }),
  // Home mobility drills (moving) and stretches (held)
  ex('Cat-cow', 'Mobility & Balance', { sets: 2, reps: 8, aliases: ['cat cow', 'cat and cow', 'cat camel'] }),
  ex('Neck mobility', 'Mobility & Balance', { sets: 2, reps: 5, aliases: ['neck rolls', 'neck turns', 'neck rotation', 'neck stretch'] }),
  ex('Thoracic rotation', 'Mobility & Balance', { sets: 2, reps: 8, aliases: ['open book', 'upper back rotation', 'thoracic twist', 'trunk rotation'] }),
  ex('Hip circles', 'Mobility & Balance', { sets: 2, reps: 10, aliases: ['hip rotations', 'hip rolls'] }),
  ex('Leg swings', 'Mobility & Balance', { sets: 2, reps: 10, aliases: ['leg swing'] }),
  ex('Ankle circles', 'Mobility & Balance', { sets: 2, reps: 10, aliases: ['ankle rotations', 'ankle mobility'] }),
  ex('Wall angels', 'Mobility & Balance', { sets: 2, reps: 10, aliases: ['wall angel', 'wall slides'] }),
  ex('Hip flexor stretch', 'Mobility & Balance', { sets: 2, reps: 30, unit: 'sec', aliases: ['kneeling hip flexor stretch', 'hip flexor'] }),
  ex('Hamstring stretch', 'Mobility & Balance', { sets: 2, reps: 30, unit: 'sec', aliases: ['seated hamstring stretch', 'toe touch stretch'] }),
  ex('Calf stretch', 'Mobility & Balance', { sets: 2, reps: 30, unit: 'sec', aliases: ['wall calf stretch'] }),
  ex('Chest stretch', 'Mobility & Balance', { sets: 2, reps: 30, unit: 'sec', aliases: ['doorway stretch', 'pec stretch'] }),
  ex('Child’s pose', 'Mobility & Balance', { sets: 2, reps: 30, unit: 'sec', aliases: ["child's pose", 'childs pose', 'balasana'] }),
  ex('Knee-to-chest stretch', 'Mobility & Balance', { sets: 2, reps: 20, unit: 'sec', aliases: ['knee to chest', 'knees to chest'] }),
  ex('Seated spinal twist', 'Mobility & Balance', { sets: 2, reps: 20, unit: 'sec', aliases: ['spinal twist', 'seated twist'] }),
];

// ----- Matching helpers -----
export const normExercise = (s: string) =>
  s.toLowerCase().replace(/[’']/g, '').replace(/[-_/()°,.]/g, ' ').replace(/\s+/g, ' ').trim();

interface Candidate { name: string; aliases?: string[] }

/**
 * Best known exercise mentioned in `text`: the longest name/alias found as whole words
 * ("incline treadmill" beats "treadmill", "walking lunges" beats "walk").
 * Candidates earlier in the list win ties, so pass the user's own names first.
 */
export function bestExerciseMatch(text: string, candidates: Candidate[]): string | null {
  const norm = ` ${normExercise(text)} `;
  const compact = norm.replace(/\s+/g, '');
  let best: { name: string; len: number } | null = null;
  for (const c of candidates) {
    for (const key of [c.name, ...(c.aliases ?? [])]) {
      const k = normExercise(key);
      if (!k) continue;
      const hit = norm.includes(` ${k} `) || (k.length >= 6 && compact.includes(k.replace(/\s+/g, '')));
      if (hit && (!best || k.length > best.len)) best = { name: c.name, len: k.length };
    }
  }
  return best?.name ?? null;
}

// ----- The user's own exercises, from saved circuits -----
export interface HistoryExercise {
  name: string;
  count: number;
  lastDate: string;
  /** Most recent logged values (used to "repeat last time"). */
  last: CircuitEntry;
}

/** Distinct exercises from history, most recently done first (then most frequent). */
export function exercisesFromHistory(logs: LoggedWorkout[]): HistoryExercise[] {
  const map = new Map<string, HistoryExercise>();
  for (const w of logs) {
    for (const e of w.entries) {
      const key = normExercise(e.name);
      if (!key) continue;
      const cur = map.get(key);
      if (!cur) map.set(key, { name: e.name.trim(), count: 1, lastDate: w.date, last: e });
      else {
        cur.count += 1;
        if (w.date >= cur.lastDate) { cur.lastDate = w.date; cur.last = e; cur.name = e.name.trim(); }
      }
    }
  }
  return [...map.values()].sort((a, b) => b.lastDate.localeCompare(a.lastDate) || b.count - a.count);
}

/** Search the user's exercises + the library. Every typed word must appear in the name or an alias. */
export function searchExercises(query: string, history: HistoryExercise[], limit = 10): string[] {
  const words = normExercise(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  const matches = (keys: string[]) => {
    const hay = keys.map(normExercise).join(' | ');
    return words.every((w) => hay.includes(w));
  };
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (name: string) => {
    const k = normExercise(name);
    if (!seen.has(k)) { seen.add(k); out.push(name); }
  };
  history.filter((h) => matches([h.name])).forEach((h) => push(h.name));
  EXERCISE_LIBRARY.filter((x) => matches([x.name, ...(x.aliases ?? [])])).forEach((x) => push(x.name));
  return out.slice(0, limit);
}

export const findLibraryExercise = (name: string): LibraryExercise | undefined => {
  const k = normExercise(name);
  return EXERCISE_LIBRARY.find((x) => normExercise(x.name) === k);
};

/** New draft entry for an exercise: last time's values (and unit) if done before, else library defaults in `defaultUnit`. */
export function entryForExercise(name: string, history: HistoryExercise[], defaultUnit: LoadUnit = 'lb'): CircuitEntry {
  const k = normExercise(name);
  const prev = history.find((h) => normExercise(h.name) === k);
  if (prev) return { ...prev.last, id: uid(), name: prev.name, pain: 0 };
  const lib = findLibraryExercise(name);
  if (lib) {
    const entry: CircuitEntry = {
      id: uid(), name: lib.name, sets: lib.sets, reps: lib.reps, unit: lib.unit,
      load: lib.defaultLoad ?? null, loadUnit: defaultUnit,
      // "To fail" means nothing for a stretch or balance drill.
      rir: lib.unit === 'reps' && lib.category !== 'Mobility & Balance' ? 2 : null, pain: 0,
    };
    // Treadmill starting values (editable on the card): a typical walk.
    if (isTreadmill(lib.name)) {
      entry.speedKmh = /incline/i.test(lib.name) ? 4.5 : 5;
      entry.inclinePct = /incline/i.test(lib.name) ? 8 : 0;
    }
    return entry;
  }
  return { id: uid(), name: name.trim().slice(0, 100), sets: 3, reps: 10, unit: 'reps', load: null, loadUnit: defaultUnit, rir: null, pain: 0 };
}

/** Short summary for a chip, e.g. "3×10 · 100 lb" or "25 min · 5 km/h · 8%". */
export function entrySummary(e: Pick<CircuitEntry, 'sets' | 'reps' | 'unit' | 'load' | 'loadUnit' | 'speedKmh' | 'inclinePct'>): string {
  const time = e.sets === 1 && e.unit === 'min' ? `${e.reps} min` : `${e.sets}×${e.reps}${e.unit === 'reps' ? '' : ` ${e.unit}`}`;
  const parts = [time];
  if (e.load) parts.push(`${e.load} ${e.loadUnit}`);
  if (e.speedKmh) parts.push(`${e.speedKmh} km/h`);
  if (e.inclinePct != null && e.speedKmh) parts.push(`${e.inclinePct}% incline`);
  return parts.join(' · ');
}
