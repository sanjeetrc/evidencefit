import { PROGRAM_VERSION, buildDefaultProgram, upgradeProgram } from './program';
import { daysAgoISO, formatDateISO, getDayKeyFromDate, isValidISODate } from './dates';
import { fromUnit } from './units';
import {
  AppState, Benchmark, CARDIO_ACTIVITIES, CONDITION_KEYS, CardioActivity, CardioDetail, TIMES_OF_DAY, TimeOfDay, ChatMessage, DAYS_OF_WEEK, DayKey, DayPlan, LoadUnit, LoggedExercise, LoggedSet,
  MEDICATION_KEYS, Profile, Program, ProgramExercise, ProteinItem, RED_FLAG_KEYS, Unit, Workout,
} from './types';

export const STORAGE_KEY = 'evidencefit_app_state_v1'; // unchanged so existing prototype data loads
export const DEFAULT_MODEL = 'gemini-3-flash-preview'; // prototype's choice; editable in Settings
export const MAX_CHAT_MESSAGES = 60;

export const uid = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const falseMap = <K extends string>(keys: readonly K[]) =>
  Object.fromEntries(keys.map((k) => [k, false])) as Record<K, boolean>;

export const recommendedProteinTarget = (age: number, weightKg: number) =>
  Math.round(weightKg * (age >= 60 ? 1.4 : 1.6));

export const createBlankProfile = (name = 'My profile', age = 60, weightKg = 70): Profile => ({
  id: uid(),
  name,
  age,
  weightKg,
  mealPattern: '3-meal',
  proteinTargetG: recommendedProteinTarget(age, weightKg),
  isActiveRegularly: true,
  baselineRestingHr: null,
  conditions: falseMap(CONDITION_KEYS),
  redFlags: falseMap(RED_FLAG_KEYS),
  medications: falseMap(MEDICATION_KEYS),
  clearedForVigorous: false,
  programVersion: PROGRAM_VERSION,
  program: buildDefaultProgram(),
  workouts: [],
  proteinLogs: {},
  benchmarks: [],
  chatHistory: [],
});

export const createFreshState = (name?: string, age?: number, weightKg?: number): AppState => {
  const p = createBlankProfile(name, age, weightKg);
  return {
    version: 2,
    isDemoLoaded: false,
    activeProfileId: p.id,
    aiCoach: { enabled: false, apiKey: '', model: DEFAULT_MODEL, consentAt: null },
    lastBackupAt: null,
    profiles: [p],
  };
};

// ---------------------------------------------------------------------------
// Validation and migration. Anything read from storage or a backup file is
// untrusted: coerce every field, drop what cannot be repaired, never throw.
// ---------------------------------------------------------------------------

const num = (v: unknown, fallback: number, min = -Infinity, max = Infinity): number => {
  const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const numOrNull = (v: unknown, min = -Infinity, max = Infinity): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};
const str = (v: unknown, fallback = '', maxLen = 500): string =>
  (typeof v === 'string' ? v : v === null || v === undefined ? fallback : String(v)).slice(0, maxLen);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const loadUnit = (v: unknown): LoadUnit | undefined => (v === 'lb' ? 'lb' : v === 'kg' ? 'kg' : undefined);
const unit = (v: unknown): Unit => (v === 'sec' || v === 'min' ? v : 'reps');
const boolMap = <K extends string>(keys: readonly K[], v: unknown) =>
  Object.fromEntries(keys.map((k) => [k, isObj(v) ? Boolean(v[k]) : false])) as Record<K, boolean>;

export const clampRpe = (v: unknown) => numOrNull(v, 1, 10);
export const clampPain = (v: unknown) => num(v, 0, 0, 10);

function parseProgramExercise(v: unknown): ProgramExercise | null {
  if (!isObj(v)) return null;
  const repMin = num(v.repMin, 10, 0, 600);
  return {
    id: str(v.id) || uid(),
    name: str(v.name, 'Exercise', 120) || 'Exercise',
    sets: num(v.sets, 3, 1, 10),
    repMin,
    repMax: Math.max(repMin, num(v.repMax, repMin, 0, 600)),
    unit: unit(v.unit),
    targetRpe: num(v.targetRpe, 7, 1, 10),
    restSec: num(v.restSec, 60, 0, 600),
    notes: str(v.notes),
    incrementKg: numOrNull(v.incrementKg, 0.25, 20) ?? undefined,
    loadUnit: loadUnit(v.loadUnit),
    perSide: typeof v.perSide === 'boolean' ? v.perSide : undefined,
    tags: Array.isArray(v.tags) ? (v.tags.filter((t) => typeof t === 'string') as ProgramExercise['tags']) : undefined,
    why: typeof v.why === 'string' ? v.why : undefined,
    tier: typeof v.tier === 'string' ? (v.tier as ProgramExercise['tier']) : undefined,
  };
}

function parseProgram(v: unknown): Program {
  const fallback = buildDefaultProgram();
  if (!isObj(v)) return fallback;
  const out = {} as Program;
  for (const d of DAYS_OF_WEEK) {
    const day = v[d];
    if (!isObj(day)) { out[d] = fallback[d]; continue; }
    const loc = day.location;
    out[d] = {
      title: str(day.title, fallback[d].title, 120),
      location: loc === 'Gym' || loc === 'Home' || loc === 'Outdoor' || loc === 'Rest' ? loc : 'Home',
      exercises: arr(day.exercises).map(parseProgramExercise).filter((e): e is ProgramExercise => e !== null),
    } satisfies DayPlan;
  }
  return out;
}

function parseSet(v: unknown): LoggedSet | null {
  if (!isObj(v)) return null;
  return { loadKg: num(v.loadKg, 0, 0, 1000), reps: num(v.reps, 0, 0, 1000), rpe: clampRpe(v.rpe), pain: clampPain(v.pain), ...(v.side === 'L' || v.side === 'R' ? { side: v.side } : {}), notes: str(v.notes) };
}

function parseCardio(v: unknown): CardioDetail | undefined {
  if (!isObj(v)) return undefined;
  return {
    activity: CARDIO_ACTIVITIES.includes(v.activity as CardioActivity) ? (v.activity as CardioActivity) : 'Walk',
    surface: str(v.surface, 'Road', 40) || 'Road',
    timeOfDay: TIMES_OF_DAY.includes(v.timeOfDay as TimeOfDay) ? (v.timeOfDay as TimeOfDay) : 'Morning',
    distanceKm: numOrNull(v.distanceKm, 0, 300),
    speedKmh: numOrNull(v.speedKmh, 0, 80),
  };
}

function parseLoggedExercise(v: unknown): LoggedExercise | null {
  if (!isObj(v)) return null;
  const sets = arr(v.sets).map(parseSet).filter((s): s is LoggedSet => s !== null);
  if (!sets.length) return null;
  const repMin = num(v.repMin, 8, 0, 600);
  return {
    exerciseId: str(v.exerciseId) || uid(),
    name: str(v.name, 'Exercise', 120) || 'Exercise',
    repMin,
    repMax: Math.max(repMin, num(v.repMax, 12, 0, 600)),
    unit: unit(v.unit),
    targetRpe: num(v.targetRpe, 7.5, 1, 10),
    incrementKg: numOrNull(v.incrementKg, 0.25, 20) ?? undefined,
    loadUnit: loadUnit(v.loadUnit),
    tags: Array.isArray(v.tags) ? (v.tags as LoggedExercise['tags']) : undefined,
    painSite: str(v.painSite, '', 60) || undefined,
    notes: str(v.notes, '', 200) || undefined,
    cardio: parseCardio(v.cardio),
    sets,
  };
}

/**
 * Converts one session from the Gemini Canvas app ({ date, location, entries: [{ name, sets: count,
 * reps, load, loadUnit, rir, pain, unit, speedKmh, inclinePct }] }) into this app's workout shape.
 * RIR (reps in reserve) maps to RPE as 10 − RIR. Output is still validated by parseWorkout.
 */
export function circuitLogToWorkout(c: unknown, defaultUnit: LoadUnit = 'kg'): unknown {
  if (!isObj(c) || !isValidISODate(c.date)) return null;
  const location = c.location === 'Gym' || c.location === 'Home' || c.location === 'Outdoor' ? c.location : 'Home';
  const exercises = arr(c.entries).filter(isObj).map((e) => {
    const u = unit(e.unit);
    const lu: LoadUnit = e.loadUnit === 'lb' || e.loadUnit === 'kg' ? e.loadUnit : defaultUnit;
    const load = numOrNull(e.load, 0, 2000);
    const reps = num(e.reps, 0, 0, 600);
    const rir = numOrNull(e.rir, 0, 10);
    const count = Math.round(num(e.sets, 1, 1, 20));
    const speed = numOrNull(e.speedKmh, 0, 80);
    const incline = numOrNull(e.inclinePct, 0, 40);
    const extra = [speed !== null ? `${speed} km/h` : '', incline !== null ? `incline ${incline}%` : ''].filter(Boolean).join(', ');
    return {
      exerciseId: str(e.id) || uid(),
      name: str(e.name, 'Exercise', 120),
      repMin: reps, repMax: reps, unit: u, targetRpe: 7, loadUnit: lu,
      notes: extra,
      sets: Array.from({ length: count }, () => ({
        loadKg: load === null ? 0 : Math.round(fromUnit(load, lu) * 1000) / 1000,
        reps, rpe: rir === null ? null : 10 - rir, pain: num(e.pain, 0, 0, 10),
      })),
    };
  });
  return {
    id: str(c.id) || uid(), date: c.date, dayKey: getDayKeyFromDate(c.date),
    title: `${location} session (Gemini app)`, location,
    sleepHours: c.sleepHours, restingHr: c.restingHr ?? null, climate: c.climate, notes: str(c.notes, '', 1000), exercises,
  };
}

function parseWorkout(v: unknown): Workout | null {
  if (!isObj(v) || !isValidISODate(v.date)) return null;
  const dayKey = DAYS_OF_WEEK.includes(v.dayKey as DayKey) ? (v.dayKey as DayKey) : 'Mon';
  const loc = v.location;
  return {
    id: str(v.id) || uid(),
    date: v.date,
    dayKey,
    title: str(v.title, 'Session', 120),
    location: loc === 'Gym' || loc === 'Home' || loc === 'Outdoor' || loc === 'Rest' ? loc : 'Home',
    sleepHours: numOrNull(v.sleepHours, 0, 16),
    restingHr: numOrNull(v.restingHr, 25, 140),
    climate: v.climate === 'Hot/Humid' ? 'Hot/Humid' : 'Normal',
    notes: str(v.notes, '', 1000),
    exercises: arr(v.exercises).map(parseLoggedExercise).filter((e): e is LoggedExercise => e !== null),
  };
}

function parseProteinLogs(v: unknown): Record<string, ProteinItem[]> {
  if (!isObj(v)) return {};
  const out: Record<string, ProteinItem[]> = {};
  for (const [date, items] of Object.entries(v)) {
    if (!isValidISODate(date)) continue;
    const parsed = arr(items)
      .filter(isObj)
      .map((it): ProteinItem => {
        const base = { id: str(it.id) || uid(), mealSlot: str(it.mealSlot, 'Lunch', 30), name: str(it.name, 'Item', 120), grams: num(it.grams, 0, 0, 300) };
        const count = numOrNull(it.count, 1, 50);
        const gramsEach = numOrNull(it.gramsEach, 0.5, 100);
        if (count === null || gramsEach === null || typeof it.food !== 'string') return base;
        return { ...base, count: Math.round(count), gramsEach, food: str(it.food, '', 40), size: str(it.size, '', 30), noun: str(it.noun, 'piece', 30), nounPlural: str(it.nounPlural, 'pieces', 30) };
      })
      .filter((it) => it.grams > 0);
    if (parsed.length) out[date] = parsed;
  }
  return out;
}

function parseBenchmark(v: unknown): Benchmark | null {
  if (!isObj(v) || !isValidISODate(v.date)) return null;
  return {
    id: str(v.id) || uid(),
    date: v.date,
    chairStand30s: numOrNull(v.chairStand30s, 0, 100),
    tugSec: numOrNull(v.tugSec, 0, 120),
    singleLegOpenSec: numOrNull(v.singleLegOpenSec, 0, 600),
    singleLegClosedSec: numOrNull(v.singleLegClosedSec, 0, 600),
    walk6MinNotes: str(v.walk6MinNotes),
    gripHangSec: numOrNull(v.gripHangSec, 0, 600),
  };
}

function parseChat(v: unknown): ChatMessage[] {
  return arr(v)
    .filter(isObj)
    .map((m) => ({
      id: str(m.id) || uid(),
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      text: str(m.text, '', 20_000),
      timestamp: str(m.timestamp, '', 40),
      isFallback: Boolean(m.isFallback),
    }))
    .slice(-MAX_CHAT_MESSAGES);
}

export function parseProfile(v: unknown): Profile | null {
  if (!isObj(v)) return null;
  const age = num(v.age, 60, 14, 105);
  const weightKg = num(v.weightKg, 70, 30, 250);
  return {
    id: str(v.id) || uid(),
    name: str(v.name, 'Profile', 60) || 'Profile',
    age,
    weightKg,
    mealPattern: v.mealPattern === '2-meal' ? '2-meal' : '3-meal',
    proteinTargetG: num(v.proteinTargetG, recommendedProteinTarget(age, weightKg), 0, 400),
    isActiveRegularly: v.isActiveRegularly === undefined ? true : Boolean(v.isActiveRegularly),
    baselineRestingHr: numOrNull(v.baselineRestingHr, 30, 120),
    conditions: boolMap(CONDITION_KEYS, v.conditions),
    redFlags: boolMap(RED_FLAG_KEYS, v.redFlags),
    medications: boolMap(MEDICATION_KEYS, v.medications),
    clearedForVigorous: Boolean(v.clearedForVigorous),
    programVersion: PROGRAM_VERSION,
    program: upgradeProgram(parseProgram(v.program), num(v.programVersion, 1, 0, 1000)),
    workouts: [
      ...arr(v.workouts).map(parseWorkout),
      // The Gemini Canvas version of the app stores sessions as `circuitLogs`.
      ...arr(v.circuitLogs).map((c) => parseWorkout(circuitLogToWorkout(c, v.defaultLoadUnit === 'lb' ? 'lb' : 'kg'))),
    ].filter((w): w is Workout => w !== null),
    proteinLogs: parseProteinLogs(v.proteinLogs),
    benchmarks: arr(v.benchmarks).map(parseBenchmark).filter((b): b is Benchmark => b !== null),
    chatHistory: parseChat(v.chatHistory),
  };
}

export type ParseResult = { ok: true; state: AppState; migratedFrom: number | null } | { ok: false; error: string };

/** Accepts v1 (prototype) and v2 state. Never throws. */
export function parseState(raw: unknown): ParseResult {
  if (!isObj(raw)) return { ok: false, error: 'Not a backup file (no data object).' };
  const profiles = arr(raw.profiles).map(parseProfile).filter((p): p is Profile => p !== null);
  if (!profiles.length) return { ok: false, error: 'Backup contains no profiles.' };
  const version = num(raw.version, 1);
  const ai = isObj(raw.aiCoach) ? raw.aiCoach : {};
  const activeId = str(raw.activeProfileId);
  const state: AppState = {
    version: 2,
    isDemoLoaded: Boolean(raw.isDemoLoaded),
    activeProfileId: profiles.some((p) => p.id === activeId) ? activeId : profiles[0].id,
    aiCoach: {
      // v1 stored a bare key and sent data without consent; require fresh opt-in.
      enabled: version >= 2 ? Boolean(ai.enabled) && Boolean(ai.consentAt) : false,
      apiKey: str(ai.apiKey ?? raw.customApiKey, '', 200),
      model: str(ai.model, DEFAULT_MODEL, 60) || DEFAULT_MODEL,
      consentAt: version >= 2 && typeof ai.consentAt === 'string' ? ai.consentAt : null,
    },
    lastBackupAt: typeof raw.lastBackupAt === 'string' ? raw.lastBackupAt : null,
    profiles,
  };
  return { ok: true, state, migratedFrom: version < 2 ? version : null };
}

/** Backups never contain the API key. */
export const toBackup = (s: AppState): AppState => ({ ...s, aiCoach: { ...s.aiCoach, apiKey: '', enabled: false } });

/** Merges an imported state's key-less AI settings with the device's existing key. */
export const keepLocalKey = (imported: AppState, current: AppState): AppState => ({
  ...imported,
  aiCoach: { ...current.aiCoach },
});

export function isDuplicateWorkout(existing: Workout[], w: Pick<Workout, 'date' | 'title' | 'exercises'>): boolean {
  const sig = (x: Pick<Workout, 'exercises'>) =>
    JSON.stringify(x.exercises.map((e) => [e.name, e.sets.map((s) => [s.loadKg, s.reps, s.rpe, s.pain])]));
  return existing.some((e) => e.date === w.date && e.title === w.title && sig(e) === sig(w));
}

// ---------------------------------------------------------------------------
// Demo data (only on explicit request)
// ---------------------------------------------------------------------------

export function createDemoState(today = new Date()): AppState {
  const d = (n: number) => daysAgoISO(n, today);
  const p = createBlankProfile('Demo (63)', 63, 72);
  p.id = 'prof_demo';
  p.mealPattern = '2-meal';
  p.conditions.hypertension = true;
  p.medications.betaBlockers = true;
  p.proteinTargetG = 100;
  const lp = (date: string, reps: number[], rpe: number[], load = 60, sleep = 7): Workout => ({
    id: uid(), date, dayKey: 'Mon', title: 'Gym A', location: 'Gym', sleepHours: sleep, restingHr: null, climate: 'Hot/Humid', notes: '',
    exercises: [{ exerciseId: 'lp', name: 'Leg press', repMin: 8, repMax: 12, unit: 'reps', targetRpe: 7.5, incrementKg: 5,
      sets: reps.map((r, i) => ({ loadKg: load, reps: r, rpe: rpe[i], pain: 0 })) },
      { exerciseId: 'walk', name: 'Incline treadmill walk (talk-test pace)', repMin: 20, repMax: 25, unit: 'min', targetRpe: 4,
        sets: [{ loadKg: 0, reps: 22, rpe: 4, pain: 0 }] }],
  });
  p.workouts = [
    lp(d(16), [10, 10, 11], [7, 7.5, 7.5]),
    lp(d(10), [12, 12, 12], [7, 7, 7.5]),
    lp(d(4), [12, 12, 12], [7, 7, 7]),
  ];
  p.proteinLogs = Object.fromEntries(
    [6, 5, 4, 3, 2, 1].map((n) => [d(n), [
      { id: uid(), mealSlot: 'Lunch', name: 'Fish / pomfret 100 g', grams: 25 },
      { id: uid(), mealSlot: 'Lunch', name: 'Cooked dal (1 katori)', grams: 8 },
      { id: uid(), mealSlot: 'Dinner', name: 'Paneer 100 g', grams: 18 },
      { id: uid(), mealSlot: 'Dinner', name: '2 whole eggs', grams: 12 },
    ]])
  );
  p.benchmarks = [
    { id: uid(), date: d(42), chairStand30s: 13, tugSec: 8.4, singleLegOpenSec: 22, singleLegClosedSec: 7, walk6MinNotes: '520 m', gripHangSec: 25 },
    { id: uid(), date: d(5), chairStand30s: 16, tugSec: 7.2, singleLegOpenSec: 34, singleLegClosedSec: 11, walk6MinNotes: '565 m', gripHangSec: 34 },
  ];
  return { ...createFreshState(), isDemoLoaded: true, activeProfileId: p.id, profiles: [p] };
}

export const todayISO = () => formatDateISO();
