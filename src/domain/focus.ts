/**
 * "Next suggested focus", as in the older app: what was trained in the last 48 hours
 * decides today's focus, with a Gym and a Home option. Strength work for a muscle group
 * is usually spaced 48–72 h apart in older adults, so a group is "ready" after 2 days.
 */
import { daysBetween } from './dates';
import type { Profile } from './types';

export type Region = 'Legs' | 'Push' | 'Pull' | 'Core';
export const READY_AFTER_DAYS = 2;

const RULES: [Region, RegExp][] = [
  ['Legs', /squat|leg press|lunge|step-?up|deadlift|hinge|hip thrust|glute|bridge|calf|leg curl|hamstring|leg extension|sit-?to-?stand|chair stand|wall sit/i],
  ['Push', /push-?up|push-?down|bench|chest|shoulder press|overhead press|dip\b|tricep|press-?up/i],
  ['Pull', /row\b|rows\b|pull|lat\b|pulldown|biceps|bicep|(?<!leg |hamstring )curl|face pull|band pull/i],
  ['Core', /plank|dead ?bug|bird-?dog|pallof|carry|farmer|suitcase|\bcore\b|\babs\b/i],
];

/** Muscle groups a named exercise loads (empty for walks, balance and mobility). */
export function regionsOf(name: string): Region[] {
  return RULES.filter(([, re]) => re.test(name)).map(([r]) => r);
}

/** Days since each group was last trained (null = not in the log). */
export function daysSinceByRegion(profile: Profile, today: string): Record<Region, number | null> {
  const out: Record<Region, number | null> = { Legs: null, Push: null, Pull: null, Core: null };
  for (const w of profile.workouts) {
    if (w.date > today) continue;
    const d = daysBetween(w.date, today);
    for (const e of w.exercises) {
      if (e.cardio || !e.sets.some((s) => s.reps > 0)) continue;
      for (const r of regionsOf(e.name)) if (out[r] === null || d < (out[r] as number)) out[r] = d;
    }
  }
  return out;
}

export interface FocusSuggestion {
  since: Record<Region, number | null>;
  headline: string;
  gym: string;
  home: string;
  why: string;
}

/** The older app's five rules: what was worked 0–1 days ago (the 48-hour window) decides today's focus. */
export function suggestFocus(profile: Profile, today: string): FocusSuggestion {
  const since = daysSinceByRegion(profile, today);
  const recent = (r: Region) => since[r] !== null && (since[r] as number) < READY_AFTER_DAYS;
  const legs = recent('Legs'); const push = recent('Push'); const pull = recent('Pull');
  const base = { since };
  if (!legs && !push && !pull) return { ...base,
    headline: 'Full-body foundation + cardio',
    gym: '25 min incline treadmill walk + leg press (3×10) + push-ups (3 sets) + seated cable row (3×12)',
    home: '4 rounds Surya Namaskar + bodyweight squats (3×15) + dumbbell rows (3×12) + 90° wall sits (4×45–60 s)',
    why: 'No muscle group is inside its 48-hour recovery window, so you are fresh for a balanced full-body circuit.' };
  if (legs && push && !pull) return { ...base,
    headline: 'Back (pull) + mobility + easy cardio',
    gym: 'Seated cable row (3×12) + lat pulldown (3×12) + biceps curls + 25 min easy walk (talk-test pace)',
    home: '4–5 rounds Surya Namaskar + dumbbell rows (3×12) + dumbbell curls (3×12) + 30 min brisk walk',
    why: 'Legs and pushing muscles were loaded recently. Give them 48 hours to rebuild while you work your back and posture.' };
  if (legs && !push) return { ...base,
    headline: 'Upper body (push and pull) + core',
    gym: 'Push-ups or chest press (3×10–12) + seated cable row (3×12) + triceps push-down (3×12) + core',
    home: 'Push-ups (3 sets) + dumbbell rows (3×12) + dumbbell curls (3×12) + core + 20 min easy walk',
    why: 'Your legs are recovering from a recent session. Upper-body strength and core keep momentum without leg fatigue.' };
  if (!legs && (push || pull)) return { ...base,
    headline: 'Lower body + balance + incline walk',
    gym: 'Leg press (3×10–12) + hamstring curl (3×12) + 25 min incline treadmill walk',
    home: 'Bodyweight squats (3×15) + 90° wall sits (4×60 s) + single-leg balance near a counter + 15 min stepper',
    why: 'Your upper body is recovering. Today suits leg strength, bone loading and aerobic work.' };
  return { ...base,
    headline: 'Active recovery: mobility, balance and an easy walk',
    gym: '25–30 min easy treadmill walk (talk-test pace) + gentle stretching',
    home: '4–5 rounds slow Surya Namaskar + 90° wall sits + 30 min morning or evening walk',
    why: 'Upper and lower body were both worked in the last 48 hours. Keep the blood flowing without adding heavy joint load.' };
}

export const restedLabel = (d: number | null): string =>
  d === null ? 'not logged yet' : d === 0 ? 'trained today' : d === 1 ? 'trained yesterday' : `rested ${d} days`;

export interface QuickExercise { name: string; sets: number; reps: number; unit: 'reps' | 'sec' | 'min' }
const q = (name: string, sets: number, reps: number, unit: QuickExercise['unit'] = 'reps'): QuickExercise => ({ name, sets, reps, unit });
/** One-tap exercises, as in the older app. Loads come from your last log of the same exercise. */
export const QUICK_ADD: Record<'Gym' | 'Home' | 'Mobility', QuickExercise[]> = {
  Gym: [q('Incline treadmill walk', 1, 25, 'min'), q('Leg press', 3, 10), q('Hamstring curl', 3, 12), q('Push-ups', 3, 20),
    q('Triceps push-down', 3, 15), q('Seated cable row', 3, 12), q('Lat pulldown', 3, 12), q('Machine chest press', 3, 10)],
  Home: [q('Bodyweight squats', 3, 15), q('Dumbbell biceps curl', 3, 12), q('Dumbbell row', 3, 12), q('Aerobic stepper', 1, 15, 'min'),
    q('Core / abs', 3, 15), q('Brisk walk', 1, 30, 'min')],
  Mobility: [q('Surya Namaskar', 4, 10), q('Cat-cow', 2, 8), q('Neck mobility', 2, 5), q('Shoulder mobility', 2, 10), q('Thoracic rotation', 2, 8),
    q('Hip circles', 2, 10), q('Ankle circles', 2, 10), q('Wall angels', 2, 10), q('Hip flexor stretch', 2, 30, 'sec'), q('Hamstring stretch', 2, 30, 'sec'),
    q('Calf stretch', 2, 30, 'sec'), q('Chest stretch', 2, 30, 'sec'), q("Child's pose", 2, 30, 'sec'), q('Wall sit (90° isometric)', 4, 60, 'sec'),
    q('Single-leg balance', 3, 30, 'sec'), q('Tandem walk', 2, 10)],
};
