import type { CircuitEntry, MuscleGroup, QuickPreset, Unit } from '../types';

// ===== Exercise Knowledge: Muscles, Benefits, Calories, Quick-Add =====
export const QUICK_PRESETS: QuickPreset[] = [
  // Gym
  { name: 'Incline treadmill walk', group: 'Gym', sets: 1, reps: 25, unit: 'min' },
  { name: 'Leg press', group: 'Gym', sets: 3, reps: 10, unit: 'reps', defaultLoad: 100 },
  { name: 'Hamstring curl', group: 'Gym', sets: 3, reps: 12, unit: 'reps', defaultLoad: 50 },
  { name: 'Push-ups', group: 'Gym', sets: 3, reps: 20, unit: 'reps' },
  { name: 'Tricep push-down', group: 'Gym', sets: 3, reps: 15, unit: 'reps', defaultLoad: 30 },
  { name: 'Seated cable row', group: 'Gym', sets: 3, reps: 12, unit: 'reps', defaultLoad: 60 },
  { name: 'Lat pulldown', group: 'Gym', sets: 3, reps: 12, unit: 'reps', defaultLoad: 60 },
  { name: 'Machine chest press', group: 'Gym', sets: 3, reps: 10, unit: 'reps', defaultLoad: 50 },
  // Home
  { name: 'Bodyweight squats', group: 'Home', sets: 3, reps: 15, unit: 'reps' },
  { name: 'Dumbbell bicep curl', group: 'Home', sets: 3, reps: 12, unit: 'reps', defaultLoad: 5 },
  { name: 'Dumbbell row', group: 'Home', sets: 3, reps: 12, unit: 'reps', defaultLoad: 10 },
  { name: 'Aerobic stepper', group: 'Home', sets: 1, reps: 15, unit: 'min' },
  { name: 'Core / Abs', group: 'Home', sets: 3, reps: 15, unit: 'reps' },
  { name: 'Brisk walk', group: 'Home', sets: 1, reps: 30, unit: 'min' },
  // Home — mobility, stretches & holds (values match EXERCISE_LIBRARY, except the wall sit's long-standing 4×60 s)
  ...([
    ['Surya Namaskar', 4, 10, 'reps'],
    ['Cat-cow', 2, 8, 'reps'],
    ['Neck mobility', 2, 5, 'reps'],
    ['Shoulder mobility', 2, 10, 'reps'],
    ['Thoracic rotation', 2, 8, 'reps'],
    ['Hip circles', 2, 10, 'reps'],
    ['Ankle circles', 2, 10, 'reps'],
    ['Wall angels', 2, 10, 'reps'],
    ['Hip flexor stretch', 2, 30, 'sec'],
    ['Hamstring stretch', 2, 30, 'sec'],
    ['Calf stretch', 2, 30, 'sec'],
    ['Chest stretch', 2, 30, 'sec'],
    ['Child’s pose', 2, 30, 'sec'],
    ['Wall sit (90° isometric)', 4, 60, 'sec'],
    ['Single-leg balance', 3, 30, 'sec'],
    ['Tandem walk', 2, 10, 'reps'],
  ] as const).map(([name, sets, reps, unit]): QuickPreset => ({ name, group: 'Home', section: 'Mobility', sets, reps, unit })),
];

export function inferMusclesAndBenefits(name: string, unit: Unit): { muscles: MuscleGroup[]; benefits: string[]; met: number } {
  const n = name.toLowerCase();
  const muscles = new Set<MuscleGroup>();
  const benefits = new Set<string>();
  let met = 4.0;

  if (/treadmill|walk|cycl|bike|elliptical|stepper|cardio|\brun|jog|swim|row(ing)? machine|\brower\b|stair|aerobic|aqua/.test(n) && !/lunge|farmer|carry/.test(n)) {
    muscles.add('Cardio');
    if (/incline|stepper|hill|stair/.test(n)) {
      muscles.add('Quads');
      muscles.add('Glutes');
      met = 5.2;
      benefits.add('Cardiovascular endurance & visceral fat burn');
    } else {
      met = 4.2;
      benefits.add('Aerobic base & heart health');
    }
  }
  if (/leg press|squat|lunge|step-?up|leg extension|sit-?to-?stand|calf|heel raise/.test(n)) {
    muscles.add('Quads');
    muscles.add('Glutes');
    met = Math.max(met, 4.8);
    benefits.add('Lower-body strength & bone loading');
  }
  if (/hamstring|leg curl|rdl|deadlift|glute bridge|hip hinge|hip thrust|abduct|adduct/.test(n)) {
    muscles.add('Hamstrings');
    muscles.add('Glutes');
    met = Math.max(met, 4.6);
    benefits.add('Posterior-chain strength & hip stability');
  }
  if (/wall sit|isometric/.test(n)) {
    muscles.add('Quads');
    met = 3.5;
    benefits.add('Isometric blood pressure support & quad endurance');
  }
  if (/push-?up|chest press|bench press|dumbbell press|incline press|\bdips?\b|pec|chest fl(y|ies)/.test(n)) {
    muscles.add('Chest');
    muscles.add('Triceps');
    muscles.add('Shoulders');
    met = Math.max(met, 4.2);
    benefits.add('Upper-body pushing strength');
  }
  if (/tricep|push-?down|kickback|skull/.test(n)) {
    muscles.add('Triceps');
    met = 3.5;
    benefits.add('Arm strength & elbow stability');
  }
  if (/\brow|pulldown|pull-?up|chin-?up|face pull|y-?t-?w/.test(n) && !/rowing machine|\brower\b/.test(n)) {
    muscles.add('Back');
    muscles.add('Biceps');
    met = Math.max(met, 4.2);
    benefits.add('Posture, upper-back strength & shoulder health');
  }
  if (/bicep|curl/.test(n) && !/hamstring|leg curl/.test(n)) {
    muscles.add('Biceps');
    met = 3.5;
    benefits.add('Arm & grip strength');
  }
  if (/overhead|shoulder press|military press|lateral raise|front raise|shrug|reverse fl|rear delt/.test(n)) {
    muscles.add('Shoulders');
    muscles.add('Triceps');
    met = 4.0;
    benefits.add('Overhead strength & shoulder mobility');
  }
  if (/surya|yoga|stretch|mobility|pranayama|breathing|tai ?chi|cat[- ]?cow|neck|thoracic|rotation|circles?\b|leg swing|wall angel|child.?s pose|knee[- ]to[- ]chest|spinal twist|open book/.test(n)) {
    muscles.add('Mobility');
    muscles.add('Core');
    met = 3.8;
    benefits.add('Joint mobility, spinal flow & active recovery');
  }
  if (/\babs?\b|core|plank|crunch|bird[- ]?dog|dead[- ]?bug|pallof|leg raise|russian twist|sit-?ups?\b/.test(n)) {
    muscles.add('Core');
    met = 3.5;
    benefits.add('Trunk stability & lower-back protection');
  }
  if (/back extension|hyperextension|superman/.test(n)) {
    muscles.add('Back');
    muscles.add('Glutes');
    met = Math.max(met, 3.5);
    benefits.add('Lower-back endurance & posture');
  }
  if (/farmer|carry/.test(n)) {
    muscles.add('Core');
    muscles.add('Shoulders');
    met = Math.max(met, 4.0);
    benefits.add('Grip strength & posture under load');
  }
  if (/balance|single-?leg|tandem|tai ?chi/.test(n)) {
    muscles.add('Mobility');
    met = 2.4;
    benefits.add('Balance & fall prevention');
  }

  if (muscles.size === 0) {
    muscles.add(unit === 'min' ? 'Cardio' : 'Core');
    benefits.add(unit === 'min' ? 'General aerobic conditioning' : 'General muscular conditioning');
  }

  return { muscles: [...muscles], benefits: [...benefits], met };
}

export const isTreadmill = (name: string) => /tread\s*mill/i.test(name);

/**
 * Treadmill MET from speed and incline (ACSM metabolic equations).
 *   Walking (< 7.5 km/h): VO2 = 3.5 + 0.1·S + 1.8·S·G
 *   Running (≥ 7.5 km/h): VO2 = 3.5 + 0.2·S + 0.9·S·G
 * S = speed in m/min, G = incline as a fraction; MET = VO2 / 3.5.
 * Assumes no handrail support (holding on lowers the real burn noticeably).
 */
export function treadmillMet(speedKmh: number, inclinePct: number): number {
  const s = (speedKmh * 1000) / 60;
  const g = Math.max(0, inclinePct) / 100;
  const vo2 = speedKmh < 7.5 ? 3.5 + 0.1 * s + 1.8 * s * g : 3.5 + 0.2 * s + 0.9 * s * g;
  return vo2 / 3.5;
}

export function estimateEntryKcal(entry: CircuitEntry, weightKg: number): number {
  const w = weightKg > 0 ? weightKg : 70;
  if (entry.sets <= 0 || entry.reps <= 0) return 0;
  let { met } = inferMusclesAndBenefits(entry.name, entry.unit);
  const speed = entry.speedKmh ?? null;
  // Speed-based MET (ACSM walking/running equations) for the treadmill and for outdoor walks or jogs.
  if (speed && (isTreadmill(entry.name) || /\b(walk|jog|run)/i.test(entry.name))) {
    met = treadmillMet(speed, entry.inclinePct ?? 0);
  } else if (entry.rir !== null) {
    if (entry.rir <= 2) met *= 1.1;
    else if (entry.rir >= 4 && entry.unit === 'reps') met *= 0.9;
  }
  let minutes: number;
  if (entry.unit === 'min') {
    minutes = entry.sets * entry.reps;
  } else if (entry.unit === 'sec') {
    minutes = entry.sets * Math.max(0.5, entry.reps / 60);
  } else if (/surya/i.test(entry.name)) {
    minutes = entry.sets * entry.reps * 0.45;
  } else {
    minutes = entry.sets * Math.min(2.8, Math.max(1.2, entry.reps * 0.08 + 0.9));
  }
  return Math.max(1, Math.round(met * w * (minutes / 60)));
}

export function analyseCircuit(entries: CircuitEntry[], weightKg: number) {
  const muscles = new Set<MuscleGroup>();
  const benefits = new Set<string>();
  let totalKcal = 0;
  for (const e of entries) {
    if (e.sets <= 0 || e.reps <= 0) continue;
    const info = inferMusclesAndBenefits(e.name, e.unit);
    info.muscles.forEach((m) => muscles.add(m));
    info.benefits.forEach((b) => benefits.add(b));
    totalKcal += estimateEntryKcal(e, weightKg);
  }
  return {
    estKcal: totalKcal,
    muscles: [...muscles],
    benefits: [...benefits],
  };
}
