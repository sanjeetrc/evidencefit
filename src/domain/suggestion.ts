import { daysBetween } from '../lib/dates';
import type { LoggedWorkout, MuscleGroup, TomorrowPlan } from '../types';

// ===== Tomorrow's Smart Suggestion Engine =====
export function buildTomorrowSuggestion(logs: LoggedWorkout[], todayISO: string): TomorrowPlan {
  const recent48h = logs.filter((w) => daysBetween(w.date, todayISO) <= 1 && daysBetween(w.date, todayISO) >= 0);
  const recent7d = logs.filter((w) => daysBetween(w.date, todayISO) <= 6 && daysBetween(w.date, todayISO) >= 0);

  const resting = new Set<MuscleGroup>();
  recent48h.forEach((w) => w.muscles.forEach((m) => {
    if (m !== 'Cardio' && m !== 'Mobility') resting.add(m);
  }));

  const hit7d = new Set<MuscleGroup>();
  recent7d.forEach((w) => w.muscles.forEach((m) => hit7d.add(m)));

  const corePillars: MuscleGroup[] = ['Quads', 'Hamstrings', 'Chest', 'Back', 'Core', 'Cardio', 'Mobility'];
  const neglected = corePillars.filter((m) => !hit7d.has(m));

  const legsTired = resting.has('Quads') || resting.has('Hamstrings') || resting.has('Glutes');
  const pushTired = resting.has('Chest') || resting.has('Triceps') || resting.has('Shoulders');
  const pullTired = resting.has('Back') || resting.has('Biceps');

  if (recent48h.length === 0) {
    return {
      headline: 'Full-Body Foundation + Cardio',
      restingMuscles: [],
      neglectedMuscles: neglected,
      gymSuggestion: '25 min incline treadmill walk + Leg press (3×10) + Push-ups (3 sets) + Seated cable row (3×12).',
      homeSuggestion: '4 rounds Surya Namaskar + Bodyweight squats (3×15) + Dumbbell rows (3×12) + 90° Wall sits (4×45–60s).',
      rationale: 'No muscles are in a 48-hour recovery window, so you are fresh for a balanced full-body circuit.',
    };
  }

  if (legsTired && pushTired && !pullTired) {
    return {
      headline: 'Back (Pull) + Mobility + Easy Cardio',
      restingMuscles: [...resting],
      neglectedMuscles: neglected,
      gymSuggestion: 'Seated cable row (3×12) + Lat pulldown (3×12) + Bicep curls + 25 min easy walk (talk-test pace).',
      homeSuggestion: '4–5 rounds Surya Namaskar + Dumbbell rows (3×12) + Dumbbell curls (3×12) + 30 min brisk walk.',
      rationale: 'You loaded legs and pushing muscles recently—give them 48 hours to rebuild while balancing your back and posture.',
    };
  }

  if (legsTired && !pushTired) {
    return {
      headline: 'Upper Body (Push & Pull) + Core',
      restingMuscles: [...resting],
      neglectedMuscles: neglected,
      gymSuggestion: 'Push-ups or Chest press (3×10–12) + Seated cable row (3×12) + Tricep push-down (3×12) + Core.',
      homeSuggestion: 'Push-ups (3 sets) + Dumbbell rows (3×12) + Dumbbell curls (3×12) + Abs / Core + 20 min easy walk.',
      rationale: 'Lower body is recovering from your recent session; upper-body strength and core keep momentum high without leg fatigue.',
    };
  }

  if (!legsTired && (pushTired || pullTired)) {
    return {
      headline: 'Lower Body + Balance + Incline Walk',
      restingMuscles: [...resting],
      neglectedMuscles: neglected,
      gymSuggestion: 'Leg press (3×10–12) + Hamstring curl (3×12) + 25 min incline treadmill walk.',
      homeSuggestion: 'Bodyweight squats (3×15) + 90° Wall sits (4×60s) + Single-leg balance near a counter + 15 min stepper.',
      rationale: 'Upper body is recovering; today is ideal for leg strength, bone loading, and cardiovascular work.',
    };
  }

  return {
    headline: 'Active Recovery: Mobility, Balance & Easy Walk',
    restingMuscles: [...resting],
    neglectedMuscles: neglected,
    gymSuggestion: '25–30 min easy treadmill walk (talk-test pace) + gentle stretching.',
    homeSuggestion: '4–5 rounds slow Surya Namaskar + 90° Wall sits (isometric BP support) + 30 min morning/evening walk.',
    rationale: 'Both upper and lower body were worked in the last 48 hours—keep blood flowing without adding heavy joint load.',
  };
}
