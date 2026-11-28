import { analyseCircuit } from '../domain/exercise';
import { recommendedProteinTarget } from '../domain/protein';
import {
  CONDITION_KEYS, MEDICATION_KEYS,
  type AiCoachSettings, type AppState, type ChatMessage, type CircuitEntry, type ConditionKey, type DriveSyncSettings, type GlossaryRule,
  type LoadUnit, type LoggedWorkout, type MedicationKey, type MuscleGroup, type Profile, type ProteinItem, type SafetyCheck,
} from '../types';
import { isISODate } from './dates';
import { uid } from './ids';

// ⚠ Do not rename these keys — existing users' data lives under them.
export const STORAGE_KEY = 'evidencefit_app_state_v1';
export const DRAFT_KEY = 'evidencefit_circuit_draft_v2';
export const PRE_RESTORE_KEY = 'evidencefit_pre_restore_v1';
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
export const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';

export const createDefaultAiSettings = (): AiCoachSettings => ({
  enabled: false, provider: 'gemini',
  apiKey: '', model: DEFAULT_MODEL, consentAt: null,
  groqApiKey: '', groqModel: DEFAULT_GROQ_MODEL, groqConsentAt: null,
});

export const falseMap = <K extends string>(keys: readonly K[]) =>
  Object.fromEntries(keys.map((k) => [k, false])) as Record<K, boolean>;

export const createBlankProfile = (name = 'My profile', age = 65, weightKg = 72): Profile => ({
  id: uid(),
  name,
  age,
  weightKg,
  mealPattern: '2-meal',
  proteinTargetG: recommendedProteinTarget(age, weightKg),
  conditions: falseMap(CONDITION_KEYS),
  medications: falseMap(MEDICATION_KEYS),
  circuitLogs: [],
  proteinLogs: {},
  chatHistory: [],
  voiceGlossary: [],
  safetyChecks: {},
  defaultLoadUnit: 'lb',
});

export const createFreshState = (name?: string, age?: number, weightKg?: number): AppState => {
  const p = createBlankProfile(name, age, weightKg);
  return {
    version: 2,
    activeProfileId: p.id,
    aiCoach: createDefaultAiSettings(),
    lastBackupAt: null,
    profiles: [p],
  };
};

// ===== Normalizers: everything read from storage or a backup file goes through these =====
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const finite = (v: unknown): number | null => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

export const isEntry = (e: CircuitEntry | null): e is CircuitEntry => e !== null;

/** `defaultUnit` is used only when the entry has no valid unit (e.g. AI output that omits it). */
export function normalizeEntry(x: unknown, defaultUnit: LoadUnit = 'lb'): CircuitEntry | null {
  if (!isObj(x)) return null;
  const name = String(x.name ?? '').trim();
  if (!name) return null;
  const load = finite(x.load);
  const rir = finite(x.rir);
  const speed = finite(x.speedKmh);
  const incline = finite(x.inclinePct);
  const entry: CircuitEntry = {
    id: typeof x.id === 'string' && x.id ? x.id : uid(),
    name: name.slice(0, 100),
    sets: Math.min(20, Math.max(1, Math.round(finite(x.sets) ?? 1))),
    load: load !== null && load > 0 ? load : null,
    loadUnit: x.loadUnit === 'kg' || x.loadUnit === 'lb' ? x.loadUnit : defaultUnit,
    reps: Math.min(600, Math.max(1, Math.round(finite(x.reps) ?? 10))),
    unit: x.unit === 'min' || x.unit === 'sec' ? x.unit : 'reps',
    rir: rir === null ? null : Math.min(4, Math.max(0, Math.round(rir))),
    pain: Math.min(10, Math.max(0, Math.round(finite(x.pain) ?? 0))),
  };
  // Treadmill extras: only stored when present, so other entries keep their exact old shape.
  if (speed !== null && speed > 0) entry.speedKmh = Math.min(25, Math.round(speed * 10) / 10);
  if (incline !== null) entry.inclinePct = Math.min(30, Math.max(0, Math.round(incline * 2) / 2));
  return entry;
}

export function normalizeWorkout(x: unknown, weightKg: number): LoggedWorkout | null {
  if (!isObj(x) || !isISODate(x.date)) return null;
  const entries = (Array.isArray(x.entries) ? x.entries : []).map((e) => normalizeEntry(e)).filter(isEntry);
  if (!entries.length) return null;
  const derived = analyseCircuit(entries, weightKg); // only fills fields missing from old/hand-edited data
  return {
    id: typeof x.id === 'string' && x.id ? x.id : uid(),
    date: x.date,
    location: x.location === 'Home' || x.location === 'Outdoor' ? x.location : 'Gym',
    sleepHours: finite(x.sleepHours),
    climate: x.climate === 'Hot/Humid' ? 'Hot/Humid' : 'Normal',
    notes: typeof x.notes === 'string' ? x.notes : '',
    entries,
    estKcal: finite(x.estKcal) ?? derived.estKcal,
    muscles: Array.isArray(x.muscles) ? (x.muscles.filter((m) => typeof m === 'string') as MuscleGroup[]) : derived.muscles,
    benefits: Array.isArray(x.benefits) ? x.benefits.filter((b): b is string => typeof b === 'string') : derived.benefits,
  };
}

function normalizeProteinLogs(x: unknown): Record<string, ProteinItem[]> {
  if (!isObj(x)) return {};
  const out: Record<string, ProteinItem[]> = {};
  for (const [date, items] of Object.entries(x)) {
    if (!isISODate(date) || !Array.isArray(items)) continue;
    out[date] = items
      .filter((i): i is ProteinItem => isObj(i) && typeof i.name === 'string' && Number.isFinite(i.grams))
      .map((i) => ({ ...i, id: typeof i.id === 'string' && i.id ? i.id : uid(), mealSlot: typeof i.mealSlot === 'string' ? i.mealSlot : 'Lunch' }));
  }
  return out;
}

/** Keeps the first record for each id (circuit logs win over converted plan-version sessions). */
function mergeById(items: unknown[]): unknown[] {
  const seen = new Set<string>();
  return items.filter((w) => {
    const id = isObj(w) && typeof w.id === 'string' ? w.id : '';
    if (!id) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

const KG_PER_LB = 0.45359237;

/**
 * Converts one session from the plan-based version (exercises with per-set kg, RPE and pain)
 * into a circuit log: one entry per exercise, sets counted, the heaviest set's load shown in the
 * exercise's own unit, RIR = 10 − RPE, pain = the highest set. Walk details become speed and notes.
 */
export function planWorkoutToCircuit(w: unknown): unknown {
  if (!isObj(w) || !isISODate(w.date)) return null;
  const exercises = Array.isArray(w.exercises) ? w.exercises.filter(isObj) : [];
  const entries = exercises.map((e) => {
    const sets = (Array.isArray(e.sets) ? e.sets.filter(isObj) : []).filter((s) => Number(s.reps) > 0);
    const unit = e.unit === 'sec' || e.unit === 'min' ? e.unit : 'reps';
    const loadUnit = e.loadUnit === 'lb' ? 'lb' : 'kg';
    const maxKg = Math.max(0, ...sets.map((s) => Number(s.loadKg) || 0));
    const load = maxKg > 0 ? Math.round((loadUnit === 'lb' ? maxKg / KG_PER_LB : maxKg) * 2) / 2 : null;
    const rpes = sets.map((s) => Number(s.rpe)).filter((n) => Number.isFinite(n) && n > 0);
    const cardio = isObj(e.cardio) ? e.cardio : null;
    return {
      id: typeof e.exerciseId === 'string' ? `${String(w.id)}-${e.exerciseId}` : uid(),
      name: String(e.name || 'Exercise'), sets: Math.max(1, sets.length), load, loadUnit,
      reps: Math.max(0, ...sets.map((s) => Number(s.reps) || 0)), unit,
      rir: rpes.length ? Math.max(0, 10 - Math.max(...rpes)) : null,
      pain: Math.max(0, ...sets.map((s) => Number(s.pain) || 0)),
      speedKmh: cardio && Number(cardio.speedKmh) > 0 ? Number(cardio.speedKmh) : null,
      inclinePct: null,
    };
  }).filter((e) => e.reps > 0);
  if (!entries.length) return null;
  const loc = w.location === 'Gym' || w.location === 'Outdoor' ? w.location : 'Home';
  return {
    id: String(w.id || uid()), date: w.date, location: loc,
    sleepHours: w.sleepHours ?? null, climate: w.climate === 'Hot/Humid' ? 'Hot/Humid' : 'Normal',
    notes: typeof w.notes === 'string' ? w.notes : '', entries,
  };
}

function normalizeProfile(x: Record<string, unknown>): Profile {
  // Out-of-range values (e.g. "6072" from the old Settings field bug) fall back to the defaults.
  const inRange = (v: unknown, lo: number, hi: number, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= lo && n <= hi ? n : fallback;
  };
  const age = Math.round(inRange(x.age, 14, 110, 65));
  const weightKg = Math.round(inRange(x.weightKg, 30, 250, 72) * 10) / 10;
  return {
    id: String(x.id || uid()),
    name: String(x.name || 'Profile'),
    age,
    weightKg,
    mealPattern: x.mealPattern === '3-meal' ? '3-meal' : '2-meal',
    proteinTargetG: Math.round(inRange(x.proteinTargetG, 20, 400, recommendedProteinTarget(age, weightKg))),
    conditions: { ...falseMap(CONDITION_KEYS), ...(isObj(x.conditions) ? (x.conditions as Record<ConditionKey, boolean>) : {}) },
    medications: { ...falseMap(MEDICATION_KEYS), ...(isObj(x.medications) ? (x.medications as Record<MedicationKey, boolean>) : {}) },
    circuitLogs: mergeById([
      ...(Array.isArray(x.circuitLogs) ? x.circuitLogs : []),
      // Sessions saved by the plan-based version that ran on GitHub Pages (28 Nov 2026) use `workouts`.
      ...(Array.isArray(x.workouts) ? x.workouts.map(planWorkoutToCircuit) : []),
    ])
      .map((w) => normalizeWorkout(w, weightKg))
      .filter((w): w is LoggedWorkout => w !== null)
      .sort((a, b) => a.date.localeCompare(b.date)),
    proteinLogs: normalizeProteinLogs(x.proteinLogs),
    chatHistory: (Array.isArray(x.chatHistory) ? x.chatHistory : [])
      .filter((m): m is ChatMessage => isObj(m) && typeof m.text === 'string' && (m.role === 'user' || m.role === 'assistant'))
      .map((m) => ({ ...m, id: typeof m.id === 'string' && m.id ? m.id : uid(), timestamp: typeof m.timestamp === 'string' ? m.timestamp : '' }))
      .slice(-40),
    voiceGlossary: (Array.isArray(x.voiceGlossary) ? x.voiceGlossary : [])
      .filter((r): r is GlossaryRule => isObj(r) && typeof r.from === 'string' && typeof r.to === 'string'),
    safetyChecks: normalizeSafetyChecks(x.safetyChecks),
    defaultLoadUnit: x.defaultLoadUnit === 'kg' ? 'kg' : 'lb',
  };
}

/** Number of saved exercise entries whose weight unit is kg. */
export const countKgEntries = (logs: LoggedWorkout[]): number =>
  logs.reduce((n, w) => n + w.entries.filter((e) => e.loadUnit === 'kg').length, 0);

/**
 * One-time fix for loads that were typed in lb but saved under the old kg default:
 * relabels every entry as lb WITHOUT converting the numbers (100 kg → 100 lb).
 * Unchanged workouts keep their object identity.
 */
export function relabelLoadsAsLb(logs: LoggedWorkout[]): LoggedWorkout[] {
  return logs.map((w) => (w.entries.some((e) => e.loadUnit === 'kg')
    ? { ...w, entries: w.entries.map((e) => (e.loadUnit === 'kg' ? { ...e, loadUnit: 'lb' as const } : e)) }
    : w));
}

/** Per-day safety screen results; anything malformed is dropped. Missing (older data) → {}. */
export function normalizeSafetyChecks(v: unknown): Record<string, SafetyCheck> {
  const out: Record<string, SafetyCheck> = {};
  if (!isObj(v)) return out;
  for (const [date, c] of Object.entries(v)) {
    if (!isISODate(date) || !isObj(c)) continue;
    const flags = Array.isArray(c.flags)
      ? [...new Set(c.flags.filter((f): f is string => typeof f === 'string' && f.length > 0 && f.length <= 40))].slice(0, 20)
      : [];
    out[date] = { at: typeof c.at === 'string' ? c.at : '', flags };
  }
  return out;
}

// Drive file IDs are short URL-safe strings; anything else is dropped.
const DRIVE_ID_RE = /^[A-Za-z0-9_-]{10,200}$/;

/** Optional Google Drive sync settings. Missing or not an object (older data) → undefined. */
export function normalizeDriveSync(v: unknown): DriveSyncSettings | undefined {
  if (!isObj(v)) return undefined;
  const out: DriveSyncSettings = { enabled: v.enabled === true };
  for (const k of ['folderId', 'docId', 'jsonId'] as const) {
    const id = v[k];
    if (typeof id === 'string' && DRIVE_ID_RE.test(id)) out[k] = id;
  }
  if (typeof v.lastSyncAt === 'string' && !Number.isNaN(Date.parse(v.lastSyncAt))) out.lastSyncAt = v.lastSyncAt;
  if (v.pendingSync === true) out.pendingSync = true;
  return out;
}

/**
 * The state as it may leave this device (backup download, Drive copy): API keys removed and AI switched off.
 * Shared so the backup and the Drive export can never drift apart. The Drive access token is never in state.
 */
export function exportSafeState(state: AppState): AppState {
  return { ...state, aiCoach: { ...state.aiCoach, apiKey: '', groqApiKey: '', enabled: false } };
}

/** Shared by loadState, backup restore and cross-tab sync. Returns null if the data is unusable. */
export function normalizeState(parsed: unknown): AppState | null {
  if (!isObj(parsed) || !Array.isArray(parsed.profiles)) return null;
  const profiles = parsed.profiles.filter(isObj).map(normalizeProfile);
  if (!profiles.length) return null;
  const ai = (isObj(parsed.aiCoach) ? parsed.aiCoach : {}) as Partial<AiCoachSettings>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const consentAt = typeof ai.consentAt === 'string' ? ai.consentAt : null;
  const groqConsentAt = typeof ai.groqConsentAt === 'string' ? ai.groqConsentAt : null;
  const provider = ai.provider === 'groq' ? 'groq' : 'gemini';
  const driveSync = normalizeDriveSync(parsed.driveSync);
  return {
    ...(driveSync ? { driveSync } : {}),
    version: 2,
    activeProfileId: profiles.some((p) => p.id === parsed.activeProfileId) ? String(parsed.activeProfileId) : profiles[0].id,
    aiCoach: {
      enabled: Boolean(ai.enabled && (provider === 'groq' ? groqConsentAt : consentAt)),
      provider,
      apiKey: str(ai.apiKey),
      model: str(ai.model).trim() || DEFAULT_MODEL,
      consentAt,
      groqApiKey: str(ai.groqApiKey),
      groqModel: str(ai.groqModel).trim() || DEFAULT_GROQ_MODEL,
      groqConsentAt,
    },
    lastBackupAt: typeof parsed.lastBackupAt === 'string' ? parsed.lastBackupAt : null,
    profiles,
  };
}

export function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function loadDraft(): CircuitEntry[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '[]');
    return Array.isArray(v) ? v.map((e) => normalizeEntry(e)).filter(isEntry) : [];
  } catch {
    return [];
  }
}

export function hasPreRestoreSnapshot(): boolean {
  try { return localStorage.getItem(PRE_RESTORE_KEY) !== null; } catch { return false; }
}
