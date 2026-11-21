import { DayPlan, Program, ProgramExercise, RiskTag } from './types';

/**
 * Default week for a 60+ trainee in a hot climate, keeping the prototype's
 * structure (3 gym days, 2 home days, active Saturday, rest Sunday).
 *
 * Masters priority order (power/leg strength → balance → aerobic → muscle → bone).
 * Weekly targets met: power 3x, balance 3x + daily option, aerobic ≈170 min,
 * one interval session, isometric BP protocol 3x, 6–11 hard sets per pattern.
 */

let seq = 0;
const ex = (p: Omit<ProgramExercise, 'id' | 'notes' | 'restSec' | 'sets'> & Partial<ProgramExercise>): ProgramExercise => ({
  id: `ex_${++seq}`,
  sets: 3,
  restSec: 90,
  notes: '',
  ...p,
});

const warmUp = () =>
  ex({
    name: 'General warm-up (march, arm circles, easy cycle)',
    sets: 1, repMin: 5, repMax: 8, unit: 'min', targetRpe: 4, restSec: 0,
    notes: 'Rise gradually to RPE 4–5.',
    tier: 'Coaching Convention',
  });

const gymA = (): DayPlan => ({
  title: 'Gym A — Power, legs, hinge, push-pull, carry, easy walk',
  location: 'Gym',
  exercises: [
    warmUp(),
    ex({
      name: 'Fast sit-to-stand (power)', repMin: 5, repMax: 5, unit: 'reps', targetRpe: 6, restSec: 90,
      notes: 'Stand up as fast as you safely can; sit down slowly. Stop the set if speed drops.',
      why: 'Power declines faster than strength after 60 and predicts falls and function.', tier: 'Strong Consensus',
    }),
    ex({
      name: 'Leg press', repMin: 8, repMax: 12, unit: 'reps', targetRpe: 7.5, incrementKg: 5,
      notes: 'Exhale on the push. Lower back stays on the pad.', tags: ['heavyBrace'],
      why: 'Leg strength is the top priority for independence.', tier: 'Strong Consensus',
    }),
    ex({
      name: 'Dumbbell Romanian deadlift (hip hinge)', repMin: 8, repMax: 10, unit: 'reps', targetRpe: 7, incrementKg: 1,
      notes: 'Hinge at the hips, flat back, dumbbells close to the legs. Never to failure.',
      why: 'Loads hips and spine for bone; trains the hinge used in lifting.', tier: 'Strong Consensus',
    }),
    ex({
      name: 'Incline push-up (bench)', repMin: 8, repMax: 12, unit: 'reps', targetRpe: 7.5, restSec: 75,
      notes: 'Lower the bench height as you progress.',
    }),
    ex({
      name: 'Seated cable row', sets: 2, repMin: 10, repMax: 12, unit: 'reps', targetRpe: 7.5, restSec: 75, incrementKg: 2.5,
      notes: 'Chest tall; pull elbows to the ribs.',
    }),
    ex({
      name: "Farmer's carry", repMin: 30, repMax: 45, unit: 'sec', targetRpe: 7, restSec: 75, incrementKg: 1,
      notes: 'Walk tall, steady steps; grip and trunk strength.', tags: ['fallRisk'],
      why: 'Grip and loaded walking are strong markers of functional capacity.', tier: 'Coaching Convention',
    }),
    ex({
      name: 'Incline treadmill walk (talk-test pace)', sets: 1, repMin: 20, repMax: 25, unit: 'min', targetRpe: 4, restSec: 0,
      notes: 'You can speak full sentences. RPE 3–4 out of 10.',
      why: '150+ min a week of conversational aerobic work.', tier: 'Strong Consensus',
    }),
  ],
});

const gymB = (): DayPlan => ({
  title: 'Gym B — Step-up power, strength, intervals',
  location: 'Gym',
  exercises: [
    warmUp(),
    ex({
      name: 'Fast step-up (power, each leg)', repMin: 5, repMax: 5, unit: 'reps', targetRpe: 6, restSec: 90,
      notes: 'Low box, hand on a rail if needed. Drive up quickly, step down slowly.', tags: ['fallRisk'],
      tier: 'Strong Consensus',
    }),
    ex({
      name: 'Goblet box squat', repMin: 8, repMax: 12, unit: 'reps', targetRpe: 7.5, incrementKg: 2,
      notes: 'Sit back to a box at a height you control.',
    }),
    ex({ name: 'Seated hamstring curl', repMin: 10, repMax: 12, unit: 'reps', targetRpe: 7.5, restSec: 75, incrementKg: 2.5, notes: 'Controlled tempo.' }),
    ex({ name: 'Machine chest press', repMin: 8, repMax: 12, unit: 'reps', targetRpe: 7.5, incrementKg: 2.5, notes: 'Exhale as you press.' }),
    ex({ name: 'Lat pulldown', repMin: 10, repMax: 12, unit: 'reps', targetRpe: 7.5, restSec: 75, incrementKg: 2.5, notes: 'Pull to the upper chest.' }),
    ex({
      name: 'Pallof press (anti-rotation)', sets: 2, repMin: 10, repMax: 12, unit: 'reps', targetRpe: 6.5, restSec: 45,
      notes: 'Resist the twist; breathe normally.',
    }),
    ex({
      name: 'Intervals: 4 × 4 min on cycle, 3 min easy between', sets: 1, repMin: 25, repMax: 28, unit: 'min', targetRpe: 7.5, restSec: 0,
      notes: 'Hard but steady (RPE 7–8 of 10). Cycle or incline walk, not running. Indoors in heat.',
      tags: ['vigorous'],
      why: 'One interval session a week is the most efficient lever for VO2max.', tier: 'Strong Consensus',
    }),
  ],
});

const home = (): DayPlan => ({
  title: 'Home — Mobility, dumbbells, isometric BP, balance, brisk walk',
  location: 'Home',
  exercises: [
    ex({
      name: 'Surya Namaskar (slow flow)', sets: 1, repMin: 4, repMax: 8, unit: 'reps', targetRpe: 5, restSec: 45,
      notes: 'Smooth breathing. Swap for standing mobility if any head-down position is unsafe for you.',
      tags: ['headDown', 'spinalFlexion'],
    }),
    ex({ name: 'Dumbbell one-arm row', sets: 2, repMin: 10, repMax: 12, unit: 'reps', targetRpe: 7.5, restSec: 60, incrementKg: 1, notes: 'Free hand on a sturdy chair.' }),
    ex({ name: 'Seated dumbbell overhead press', sets: 2, repMin: 10, repMax: 12, unit: 'reps', targetRpe: 7.5, restSec: 60, incrementKg: 1, notes: 'Exhale as you press. Stop short of any shoulder pinch.' }),
    ex({ name: 'Dumbbell biceps curl', sets: 2, repMin: 10, repMax: 12, unit: 'reps', targetRpe: 7.5, restSec: 60, incrementKg: 1, notes: 'No swinging.' }),
    ex({
      name: 'Wall sit, isometric (BP protocol)', sets: 4, repMin: 120, repMax: 120, unit: 'sec', targetRpe: 6.5, restSec: 90,
      notes: 'Moderate effort: set the depth so 2 min is hard but doable. Breathe continuously.',
      why: 'Isometric training is the most effective exercise mode for lowering resting blood pressure.', tier: 'Strong Consensus',
    }),
    ex({
      name: 'Single-leg balance near a counter', repMin: 30, repMax: 45, unit: 'sec', targetRpe: 5, restSec: 30,
      notes: 'Each leg. Progress: head turns → eyes closed (hand hovering over counter).', tags: ['fallRisk'],
      why: 'Balance must be trained weekly, not just tested.', tier: 'Strong Consensus',
    }),
    ex({ name: 'Bird-dog', sets: 2, repMin: 8, repMax: 10, unit: 'reps', targetRpe: 6, restSec: 45, notes: 'Each side. Neutral spine, slow exhale on the reach.' }),
    ex({
      name: 'Brisk walk (early morning or evening)', sets: 1, repMin: 30, repMax: 30, unit: 'min', targetRpe: 4, restSec: 0,
      notes: 'Talk-test pace. Avoid midday heat; carry water.',
    }),
  ],
});

export const buildDefaultProgram = (): Program => ({
  Mon: gymA(),
  Tue: home(),
  Wed: gymB(),
  Thu: home(),
  Fri: gymA(),
  Sat: {
    title: 'Active Saturday — Long walk, wall sit, balance, mobility',
    location: 'Outdoor',
    exercises: [
      ex({ name: 'Long easy walk', sets: 1, repMin: 40, repMax: 45, unit: 'min', targetRpe: 3.5, restSec: 0, notes: 'Before 8 am or after sunset in hot weather.' }),
      ex({ name: 'Wall sit, isometric (BP protocol)', sets: 4, repMin: 120, repMax: 120, unit: 'sec', targetRpe: 6.5, restSec: 90, notes: 'Third weekly BP session.', tier: 'Strong Consensus' }),
      ex({ name: 'Tandem stance / heel-to-toe walk', sets: 3, repMin: 30, repMax: 30, unit: 'sec', targetRpe: 5, restSec: 30, notes: 'Along a wall or counter.', tags: ['fallRisk'] }),
      ex({ name: 'Hip and thoracic mobility', sets: 1, repMin: 10, repMax: 10, unit: 'min', targetRpe: 3, restSec: 0, notes: 'Gentle range of motion.' }),
    ],
  },
  Sun: { title: 'Rest — optional 5 min balance', location: 'Rest', exercises: [] },
});

/** Infers risk tags for exercises the user types in, by name. */
export const inferRiskTags = (name: string): RiskTag[] => {
  const n = name.toLowerCase();
  const tags = new Set<RiskTag>();
  if (/surya|downward dog|forward fold|toe touch|headstand|inversion|decline/.test(n)) tags.add('headDown');
  if (/sit-?up|crunch|toe touch|jefferson|good ?morning|surya|forward fold/.test(n)) tags.add('spinalFlexion');
  if (/jump|plyo|hop|bound|skip|sprint|run/.test(n)) tags.add('highImpact');
  if (/single-?leg|balance|step-?up|lunge|bosu|tandem|carry/.test(n)) tags.add('fallRisk');
  if (/interval|hiit|sprint|4 ?[x×] ?4|tabata/.test(n)) tags.add('vigorous');
  if (/deadlift|squat|leg press|1rm|max/.test(n) && !/box squat|goblet/.test(n)) tags.add('heavyBrace');
  return [...tags];
};
