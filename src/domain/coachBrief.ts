import { daysAgoISO, formatDateISO, shortDateLabel } from '../lib/dates';
import type { CircuitEntry, LoggedWorkout, MuscleGroup, Profile, SafetyCheck } from '../types';
import { formatRir } from '../voice/guided';
import { CONDITION_ITEMS, MEDICATION_ITEMS } from './health';
import { safetyCheckLine } from './safety';

// ===== Coach brief: plain text to paste into Claude (or any chat assistant) =====

export interface CoachBriefOptions {
  days: number;
  /** Include ticked conditions and medications. */
  includeHealth: boolean;
  /** Override "today" (YYYY-MM-DD), for tests. */
  today?: string;
}

const ALL_MUSCLES: MuscleGroup[] = ['Quads', 'Hamstrings', 'Glutes', 'Chest', 'Triceps', 'Back', 'Biceps', 'Shoulders', 'Core', 'Cardio'];

const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** "Leg press: 3×10 @ 100 lb, 2 to fail" / "Treadmill: 25 min @ 5 km/h, 8% incline". */
export function describeEntry(e: CircuitEntry): string {
  const volume =
    e.unit === 'min' ? (e.sets === 1 ? `${e.reps} min` : `${e.sets}×${e.reps} min`)
      : e.unit === 'sec' ? `${e.sets}×${e.reps} sec`
        : `${e.sets}×${e.reps}`;
  const extras: string[] = [];
  if (e.speedKmh) extras.push(`@ ${fmtNum(e.speedKmh)} km/h`);
  if (e.speedKmh && e.inclinePct != null) extras.push(`${fmtNum(e.inclinePct)}% incline`);
  if (e.load) extras.push(`@ ${fmtNum(e.load)} ${e.loadUnit}`);
  const head = [volume, extras.shift()].filter(Boolean).join(' ');
  const tail = [...extras, formatRir(e.rir)].filter(Boolean);
  const pain = e.pain > 0 ? ` — pain ${e.pain}/10` : '';
  return `${e.name}: ${[head, ...tail].join(', ')}${pain}`;
}

function describeWorkout(w: LoggedWorkout, safety: Record<string, SafetyCheck> | undefined): string[] {
  const head = [
    shortDateLabel(w.date),
    w.location,
    w.sleepHours != null ? `sleep ${fmtNum(w.sleepHours)} h` : '',
    w.climate === 'Hot/Humid' ? 'hot/humid' : 'normal weather',
    `~${w.estKcal} kcal`,
  ].filter(Boolean).join(' · ');
  // The daily safety check is no longer asked in the app; older checks still show when present.
  const check = safety?.[w.date];
  const lines = [head, ...(check ? [`  ${safetyCheckLine(check)}`] : []), ...w.entries.map((e) => `  - ${describeEntry(e)}`)];
  if (w.notes.trim()) lines.push(`  Notes: "${w.notes.trim().replace(/\s+/g, ' ')}"`);
  return lines;
}

export function buildCoachBrief(profile: Profile, opts: CoachBriefOptions): string {
  const days = Math.max(1, Math.round(opts.days));
  const today = opts.today ?? formatDateISO();
  const from = daysAgoISO(days - 1, new Date(`${today}T12:00:00`));
  const workouts = profile.circuitLogs
    .filter((w) => w.date >= from && w.date <= today)
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));

  const out: string[] = [];
  out.push(
    'I use a workout-logging app called EvidenceFit. Please act as my evidence-based strength & conditioning coach.',
    'Use the data below; tag key advice as [Strong Consensus], [Emerging Evidence] or [Coaching Convention]; never diagnose.',
    '',
    'PROFILE',
    `- Age ${profile.age}, weight ${fmtNum(profile.weightKg)} kg, ${profile.mealPattern === '3-meal' ? '3' : '2'} meals/day, protein target ${profile.proteinTargetG} g/day`,
  );
  if (opts.includeHealth) {
    const conditions = CONDITION_ITEMS.filter((c) => profile.conditions[c.key]).map((c) => c.label);
    const meds = MEDICATION_ITEMS.filter((m) => profile.medications[m.key]).map((m) => m.label);
    out.push(`- Conditions: ${conditions.length ? conditions.join(', ') : 'none'}`);
    out.push(`- Medications: ${meds.length ? meds.join(', ') : 'none'}`);
  }

  out.push('', `LAST ${days} DAYS (${shortDateLabel(from)} – ${shortDateLabel(today)}) — ${workouts.length} workout${workouts.length === 1 ? '' : 's'}`);
  if (!workouts.length) out.push(`No workouts logged in the last ${days} days.`);
  for (const w of workouts) out.push(...describeWorkout(w, profile.safetyChecks));

  // ----- Summary -----
  const muscleCount = new Map<MuscleGroup, number>();
  for (const w of workouts) for (const m of new Set(w.muscles)) muscleCount.set(m, (muscleCount.get(m) ?? 0) + 1);
  const trained = [...muscleCount.entries()].sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m} ${n}×`);
  const untrained = ALL_MUSCLES.filter((m) => !muscleCount.has(m));
  const pains = workouts.flatMap((w) => w.entries.filter((e) => e.pain > 0).map((e) => `${e.name} ${e.pain}/10 (${shortDateLabel(w.date)})`));

  let proteinDays = 0;
  let proteinTotal = 0;
  let proteinHit = 0;
  for (const [date, items] of Object.entries(profile.proteinLogs)) {
    if (date < from || date > today || !items.length) continue;
    const g = items.reduce((s, i) => s + (Number(i.grams) || 0), 0);
    proteinDays += 1;
    proteinTotal += g;
    if (g >= profile.proteinTargetG) proteinHit += 1;
  }

  out.push('', 'SUMMARY');
  if (workouts.length) {
    out.push(`- Muscles trained (workouts): ${trained.length ? trained.join(', ') : 'none recorded'}`);
    out.push(`- Not trained in ${days} days: ${untrained.length ? untrained.join(', ') : 'none — all groups covered'}`);
  }
  out.push(`- Pain reported: ${pains.length ? pains.join('; ') : 'none'}`);
  out.push(proteinDays
    ? `- Protein: average ${Math.round(proteinTotal / proteinDays)} g/day vs ${profile.proteinTargetG} g target; hit target ${proteinHit} of ${proteinDays} logged day${proteinDays === 1 ? '' : 's'}`
    : '- Protein: not logged in this period');

  out.push('', 'MY QUESTION:', '');
  return out.join('\n');
}
