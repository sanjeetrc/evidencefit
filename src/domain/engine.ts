import { CONDITION_ITEMS, MEDICATION_ITEMS, RED_FLAG_ITEMS } from './reference';
import { inferRiskTags } from './program';
import { daysAgoISO, daysBetween, formatDateISO, shortDateLabel } from './dates';
import { defaultIncrementKg, formatLoad, toUnit } from './units';
import { LoadUnit, LoggedExercise, Profile, ProgramExercise, RiskTag, Workout } from './types';

// ---------------------------------------------------------------------------
// Module 0: pre-participation screening (ACSM-style decision logic)
// ---------------------------------------------------------------------------

export type ScreeningLevel = 'stop' | 'clearance-before-moderate' | 'clearance-before-vigorous' | 'proceed';

export interface ScreeningResult {
  level: ScreeningLevel;
  /** Highest RPE (0–10) the app will plan for until clearance is recorded. */
  rpeCap: number | null;
  vigorousAllowed: boolean;
  headline: string;
  detail: string;
}

export const hasKnownDisease = (p: Profile) =>
  Boolean(p.conditions.cardiovascular || p.conditions.metabolic || p.conditions.renal);

export function screen(p: Profile): ScreeningResult {
  const flags = RED_FLAG_ITEMS.filter((r) => p.redFlags[r.key]);
  if (flags.length > 0) {
    return {
      level: 'stop',
      rpeCap: null,
      vigorousAllowed: false,
      headline: 'See your doctor before training',
      detail: `Symptom(s) reported: ${flags.map((f) => f.label.toLowerCase()).join('; ')}. Get medical clearance before any structured exercise.`,
    };
  }
  if (hasKnownDisease(p) && !p.clearedForVigorous) {
    if (!p.isActiveRegularly) {
      return {
        level: 'clearance-before-moderate',
        rpeCap: 4,
        vigorousAllowed: false,
        headline: 'Light to moderate only until cleared',
        detail: 'Known cardiovascular, metabolic or kidney disease and not currently active: keep effort at RPE 4 or below until your doctor clears you for more.',
      };
    }
    return {
      level: 'clearance-before-vigorous',
      rpeCap: 6,
      vigorousAllowed: false,
      headline: 'Moderate work is fine; vigorous needs clearance',
      detail: 'Known disease, active and stable: continue moderate work (RPE 6 or below). Intervals and near-failure sets wait for medical clearance.',
    };
  }
  return {
    level: 'proceed',
    rpeCap: null,
    vigorousAllowed: true,
    headline: 'No screening restriction',
    detail: 'No reported symptoms or restricting disease. Progress gradually.',
  };
}

// ---------------------------------------------------------------------------
// Exercise-level contraindication warnings
// ---------------------------------------------------------------------------

export interface ExerciseWarning {
  severity: 'avoid' | 'caution';
  text: string;
}

export const tagsFor = (e: Pick<ProgramExercise | LoggedExercise, 'name' | 'tags'>): RiskTag[] =>
  e.tags && e.tags.length ? e.tags : inferRiskTags(e.name);

export function exerciseWarnings(
  e: Pick<ProgramExercise | LoggedExercise, 'name' | 'tags'>,
  p: Profile,
  s: ScreeningResult = screen(p)
): ExerciseWarning[] {
  const t = new Set(tagsFor(e));
  const out: ExerciseWarning[] = [];
  const c = p.conditions;
  if (t.has('headDown') && c.glaucoma) out.push({ severity: 'avoid', text: 'Head-down position: avoid with glaucoma or retinal disease.' });
  if (t.has('headDown') && c.hypertension) out.push({ severity: 'caution', text: 'Head-down position with high BP: keep it brief, rise slowly.' });
  if (t.has('spinalFlexion') && c.osteoporosis) out.push({ severity: 'avoid', text: 'Loaded or repeated spinal flexion: avoid with osteoporosis.' });
  if (t.has('highImpact') && (c.osteoporosis || c.jointReplacement)) out.push({ severity: 'avoid', text: 'High impact: use a low-impact alternative without clinical clearance.' });
  if (t.has('fallRisk') && (p.medications.anticoagulants || c.priorFalls)) out.push({ severity: 'caution', text: 'Fall risk: keep a hand near a support throughout.' });
  if (t.has('heavyBrace') && (c.hernia || c.hypertension || c.glaucoma)) out.push({ severity: 'caution', text: 'Exhale through the effort; no breath-holding; stay 2–3 reps short of failure.' });
  if (t.has('vigorous') && !s.vigorousAllowed) out.push({ severity: 'avoid', text: 'Vigorous: replace with a steady talk-test session until medically cleared.' });
  return out;
}

// ---------------------------------------------------------------------------
// Protein (Module 8)
// ---------------------------------------------------------------------------

export interface ProteinGuidance {
  isRenalRestricted: boolean;
  minG: number | null;
  maxG: number | null;
  perMealMinG: number | null;
  recommendedG: number | null;
  label: string;
}

export function proteinGuidance(p: Profile): ProteinGuidance {
  const w = Number(p.weightKg) > 0 ? Number(p.weightKg) : 70;
  if (p.conditions.renal) {
    return {
      isRenalRestricted: true, minG: null, maxG: null, perMealMinG: null, recommendedG: null,
      label: 'Kidney disease: follow the limit your doctor sets. No target is applied.',
    };
  }
  if (p.age >= 60) {
    const minG = Math.round(w * 1.2);
    const maxG = Math.round(w * 1.6);
    const perMealMinG = Math.round(w * 0.4);
    return {
      isRenalRestricted: false, minG, maxG, perMealMinG, recommendedG: Math.round(w * 1.4),
      label: `60+: ${minG}–${maxG} g/day (1.2–1.6 g/kg), at least ${perMealMinG} g per meal`,
    };
  }
  const minG = Math.round(w * 1.6);
  const maxG = Math.round(w * 2.2);
  return {
    isRenalRestricted: false, minG, maxG, perMealMinG: Math.round(w * 0.3), recommendedG: minG,
    label: `Adult: ${minG}–${maxG} g/day (1.6–2.2 g/kg); about 1.6 g/kg captures most of the benefit`,
  };
}

export const mealSlotsFor = (pattern: Profile['mealPattern']) =>
  pattern === '3-meal' ? ['Breakfast', 'Lunch', 'Dinner'] : ['Lunch', 'Dinner'];

// ---------------------------------------------------------------------------
// Progression, deload, ramp-back (Core Operating Loop numeric rules)
// ---------------------------------------------------------------------------

/** Sets that were actually performed (zero-rep rows are treated as not done). */
const doneSets = (e: LoggedExercise) => e.sets.filter((s) => Number(s.reps) > 0);


export interface ProgressionItem {
  name: string;
  lastLoad: number;
  nextLoad: number | null;
  suggestion: string;
}

interface SessionSummary {
  date: string;
  hitTop: boolean;
  meanSetWork: number;
  avgRpe: number | null;
  lastLoad: number;
  unit: LoggedExercise['unit'];
  incrementKg?: number;
  loadUnit: LoadUnit;
}

export function summariseExercise(e: LoggedExercise, date: string): SessionSummary | null {
  const sets = doneSets(e);
  if (!sets.length) return null;
  const rpes = sets.map((s) => s.rpe).filter((r): r is number => r !== null && Number.isFinite(r));
  return {
    date,
    // Double progression: every planned-and-done set at the top of range, at or under
    // target RPE, with acceptable pain (≤3/10).
    hitTop: sets.every(
      (s) => s.reps >= e.repMax && (s.rpe === null || s.rpe <= e.targetRpe) && (s.pain ?? 0) <= 3
    ),
    // Per-set work, so doing fewer sets (e.g. a deload) is not read as a performance drop.
    meanSetWork: sets.reduce((sum, s) => sum + Math.max(1, s.loadKg) * s.reps, 0) / sets.length,
    avgRpe: rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null,
    lastLoad: sets[sets.length - 1].loadKg || 0,
    unit: e.unit,
    incrementKg: e.incrementKg,
    loadUnit: e.loadUnit ?? 'kg',
  };
}

export interface Audit {
  isMasters: boolean;
  screening: ScreeningResult;
  hrRestricted: boolean;
  protein: ProteinGuidance;
  sortedWorkouts: Workout[];
  progressionReady: ProgressionItem[];
  deloadRecommended: boolean;
  deloadReasons: string[];
  daysSinceLastWorkout: number | null;
  rampBack: { level: 'none' | 'ontrack' | 'repeat' | 'ramp' | 'restart'; label: string; advice: string };
  last7DaysProtein: { date: string; label: string; grams: number; target: number; hitTarget: boolean }[];
  avgProtein7d: number;
  daysHitProtein: number;
  mealsMeetingPerMealMin: { hit: number; total: number } | null;
  aerobicMinutes7d: number;
  activeCues: { tone: 'emerald' | 'amber'; text: string }[];
}

export function runAudit(profile: Profile, today: string = formatDateISO()): Audit {
  const isMasters = profile.age >= 60;
  const screening = screen(profile);
  const hrRestricted = Boolean(profile.medications.betaBlockers);
  const protein = proteinGuidance(profile);
  const sortedWorkouts = [...profile.workouts].sort((a, b) => a.date.localeCompare(b.date));

  // --- Per-exercise history -------------------------------------------------
  const history = new Map<string, SessionSummary[]>();
  for (const w of sortedWorkouts) {
    for (const e of w.exercises) {
      const s = summariseExercise(e, w.date);
      if (!s) continue;
      const key = e.name.trim().toLowerCase();
      history.set(key, [...(history.get(key) ?? []), s]);
    }
  }

  const progressionReady: ProgressionItem[] = [];
  const performanceDrops: string[] = [];
  const displayName = new Map<string, string>();
  sortedWorkouts.forEach((w) => w.exercises.forEach((e) => displayName.set(e.name.trim().toLowerCase(), e.name)));

  history.forEach((entries, key) => {
    const name = displayName.get(key) ?? key;
    const n = entries.length;
    if (n >= 2 && entries[n - 1].hitTop && entries[n - 2].hitTop) {
      const last = entries[n - 1];
      let nextLoad: number | null = null;
      let suggestion: string;
      if (last.unit !== 'reps') {
        suggestion = last.unit === 'min' ? 'Add 2–5 minutes, keeping the same effort' : 'Add 5–10 seconds or a harder position';
      } else if (last.lastLoad > 0) {
        const u = last.loadUnit;
        const inc = last.incrementKg ?? defaultIncrementKg(last.lastLoad, u);
        nextLoad = Math.round((last.lastLoad + inc) * 1000) / 1000;
        const incShown = Math.round(toUnit(inc, u) * 100) / 100;
        suggestion = `Add the smallest step (${incShown} ${u}): next ${formatLoad(nextLoad, u)}, restart at the bottom of the rep range`;
      } else {
        suggestion = 'Bodyweight: slow the lowering to 3 s, add a pause, or move to a harder variant';
      }
      progressionReady.push({ name, lastLoad: last.lastLoad, nextLoad, suggestion });
    }
    if (n >= 3) {
      const [s1, s2, s3] = entries.slice(-3);
      const sameOrHarder = s1.avgRpe === null || s3.avgRpe === null || s3.avgRpe >= s1.avgRpe - 0.2;
      if (s2.meanSetWork < s1.meanSetWork && s3.meanSetWork < s2.meanSetWork && sameOrHarder && s3.unit === 'reps') {
        performanceDrops.push(name);
      }
    }
  });

  // --- Reactive deload triggers ----------------------------------------------
  const deloadReasons: string[] = [];
  if (performanceDrops.length) {
    deloadReasons.push(`Performance fell two sessions running at the same or higher effort: ${performanceDrops.join(', ')}`);
  }

  const withSleep = sortedWorkouts.filter((w) => w.sleepHours !== null && w.sleepHours > 0).slice(-3);
  if (withSleep.length >= 3 && withSleep.every((w) => (w.sleepHours ?? 0) < 6)) {
    deloadReasons.push('Under 6 hours of sleep before each of the last 3 logged sessions');
  }

  const recentMaxPain = sortedWorkouts.slice(-3).map((w) => {
    const pains = w.exercises.flatMap((e) => doneSets(e).map((s) => s.pain || 0));
    return pains.length ? Math.max(...pains) : 0;
  });
  if (recentMaxPain.length >= 3 && recentMaxPain[2] > recentMaxPain[1] && recentMaxPain[1] > recentMaxPain[0] && recentMaxPain[2] >= 4) {
    deloadReasons.push(`Joint pain rising across the last 3 sessions (${recentMaxPain.join(' → ')} out of 10)`);
  } else if (recentMaxPain.length >= 2 && recentMaxPain[recentMaxPain.length - 1] >= 4 && recentMaxPain[recentMaxPain.length - 2] >= 4) {
    deloadReasons.push('Joint pain 4/10 or more in 2 consecutive sessions');
  }

  if (!hrRestricted && profile.baselineRestingHr) {
    const base = profile.baselineRestingHr;
    const recentHr = sortedWorkouts.filter((w) => w.restingHr !== null && w.restingHr > 0).slice(-3);
    if (recentHr.length >= 3 && recentHr.every((w) => (w.restingHr ?? 0) >= base + 7)) {
      deloadReasons.push(`Morning resting heart rate at least 7 bpm above your ${base} bpm baseline on 3 logged days`);
    }
  }

  // --- Ramp-back after missed time --------------------------------------------
  let daysSinceLastWorkout: number | null = null;
  let rampBack: Audit['rampBack'] = {
    level: 'none',
    label: 'No sessions logged yet',
    advice: 'Log your first session on the Today tab to start trend tracking.',
  };
  if (sortedWorkouts.length) {
    daysSinceLastWorkout = Math.max(0, daysBetween(sortedWorkouts[sortedWorkouts.length - 1].date, today));
    const d = daysSinceLastWorkout;
    if (d < 7) {
      rampBack = { level: 'ontrack', label: `On track (last session ${d === 0 ? 'today' : `${d} d ago`})`, advice: 'Continue the plan; keep 48–72 h between hard sessions for the same muscles.' };
    } else if (d <= 13) {
      rampBack = { level: 'repeat', label: `${d} days since last session: repeat the previous week`, advice: 'Hold previous loads and volume for a week before progressing.' };
    } else if (d <= 28) {
      rampBack = { level: 'ramp', label: `${d} days off: cut sets 30–40% and load 10–15%`, advice: 'Ease back in over 1–2 weeks.' };
    } else {
      rampBack = { level: 'restart', label: `${d} days off: conservative restart`, advice: 'About half the previous volume at RPE 6–7 for 2 weeks.' };
    }
  }

  // --- Protein adherence ---------------------------------------------------------
  const target = protein.isRenalRestricted ? 0 : profile.proteinTargetG;
  const last7DaysProtein = Array.from({ length: 7 }, (_, i) => {
    const date = daysAgoISO(6 - i, new Date(`${today}T12:00:00`));
    const grams = (profile.proteinLogs[date] ?? []).reduce((s, it) => s + (Number(it.grams) || 0), 0);
    return { date, label: shortDateLabel(date), grams, target, hitTarget: target > 0 && grams >= target * 0.9 };
  });
  const logged = last7DaysProtein.filter((d) => d.grams > 0);
  const avgProtein7d = logged.length ? Math.round(logged.reduce((s, d) => s + d.grams, 0) / logged.length) : 0;
  const daysHitProtein = last7DaysProtein.filter((d) => d.hitTarget).length;

  let mealsMeetingPerMealMin: Audit['mealsMeetingPerMealMin'] = null;
  if (protein.perMealMinG) {
    let hit = 0;
    let total = 0;
    for (const d of last7DaysProtein) {
      const items = profile.proteinLogs[d.date] ?? [];
      if (!items.length) continue;
      const bySlot = new Map<string, number>();
      items.forEach((it) => bySlot.set(it.mealSlot, (bySlot.get(it.mealSlot) ?? 0) + it.grams));
      for (const slot of mealSlotsFor(profile.mealPattern)) {
        total += 1;
        if ((bySlot.get(slot) ?? 0) >= protein.perMealMinG) hit += 1;
      }
    }
    mealsMeetingPerMealMin = total ? { hit, total } : null;
  }

  // --- Weekly aerobic minutes (timed exercises, last 7 days) ---------------------
  const since = daysAgoISO(6, new Date(`${today}T12:00:00`));
  const aerobicMinutes7d = Math.round(
    sortedWorkouts
      .filter((w) => w.date >= since && w.date <= today)
      .flatMap((w) => w.exercises)
      .filter((e) => e.unit === 'min' && !/warm-?up|mobility/i.test(e.name))
      .reduce((s, e) => s + doneSets(e).reduce((a, x) => a + x.reps, 0), 0)
  );

  // --- Cues --------------------------------------------------------------------
  const activeCues: Audit['activeCues'] = [];
  if (isMasters) activeCues.push({ tone: 'emerald', text: '60+ priorities: power and leg strength, then balance, aerobic, muscle, bone. 48–72 h between hard sessions for the same muscles.' });
  if (screening.rpeCap !== null) activeCues.push({ tone: 'amber', text: `Screening: keep every set at RPE ${screening.rpeCap} or below until cleared.` });
  if (hrRestricted) activeCues.push({ tone: 'amber', text: 'Heart-rate medication: judge cardio by RPE and the talk test only.' });
  for (const c of CONDITION_ITEMS) if (profile.conditions[c.key] && c.key !== 'renal') activeCues.push({ tone: 'amber', text: `${c.label}: ${c.note}` });
  for (const m of MEDICATION_ITEMS) if (profile.medications[m.key] && m.key !== 'betaBlockers') activeCues.push({ tone: 'amber', text: `${m.label}: ${m.note}` });

  return {
    isMasters, screening, hrRestricted, protein, sortedWorkouts, progressionReady,
    deloadRecommended: deloadReasons.length > 0, deloadReasons, daysSinceLastWorkout, rampBack,
    last7DaysProtein, avgProtein7d, daysHitProtein, mealsMeetingPerMealMin, aerobicMinutes7d, activeCues,
  };
}
