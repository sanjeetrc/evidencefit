export const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export type DayKey = (typeof DAYS_OF_WEEK)[number];

export type Unit = 'reps' | 'sec' | 'min';
export type LoadUnit = 'kg' | 'lb';
export type Side = 'L' | 'R';
export type Location = 'Gym' | 'Home' | 'Outdoor' | 'Rest';
export type Climate = 'Normal' | 'Hot/Humid';
export type MealPattern = '2-meal' | '3-meal';
export type EvidenceTier = 'Strong Consensus' | 'Emerging Evidence' | 'Coaching Convention';

/** Movement characteristics that conflict with specific medical conditions. */
export type RiskTag =
  | 'headDown' // glaucoma / retinal disease, uncontrolled BP
  | 'spinalFlexion' // osteoporosis (when loaded)
  | 'highImpact' // osteoporosis, joint replacement
  | 'fallRisk' // anticoagulants, prior falls
  | 'vigorous' // needs clearance when known disease
  | 'heavyBrace'; // hernia, hypertension, glaucoma (Valsalva risk)

export interface ProgramExercise {
  id: string;
  name: string;
  sets: number;
  repMin: number;
  repMax: number;
  unit: Unit;
  targetRpe: number;
  restSec: number;
  notes: string;
  /** Smallest load step available for this exercise, stored in kg. */
  incrementKg?: number;
  /** Unit printed on this machine or dumbbell. Loads are stored in kg regardless. */
  loadUnit?: LoadUnit;
  /** Log left and right as separate sets. Undefined = decide from the name. */
  perSide?: boolean;
  tags?: RiskTag[];
  why?: string;
  tier?: EvidenceTier;
}

export interface DayPlan {
  title: string;
  location: Location;
  exercises: ProgramExercise[];
}

export type Program = Record<DayKey, DayPlan>;

export interface LoggedSet {
  loadKg: number;
  reps: number;
  rpe: number | null;
  pain: number;
  /** Set for one-sided exercises logged per side. */
  side?: Side;
  notes?: string;
}

export interface LoggedExercise {
  exerciseId: string;
  name: string;
  repMin: number;
  repMax: number;
  unit: Unit;
  targetRpe: number;
  incrementKg?: number;
  loadUnit?: LoadUnit;
  notes?: string;
  tags?: RiskTag[];
  /** Where it hurt, e.g. "Left knee", when any set had pain above 0. */
  painSite?: string;
  sets: LoggedSet[];
}

export interface Workout {
  id: string;
  date: string; // local calendar date, YYYY-MM-DD
  dayKey: DayKey;
  title: string;
  location: Location;
  sleepHours: number | null;
  restingHr: number | null;
  climate: Climate;
  notes: string;
  exercises: LoggedExercise[];
}

export interface ProteinItem {
  id: string;
  mealSlot: string;
  name: string;
  grams: number;
}

export interface Benchmark {
  id: string;
  date: string;
  chairStand30s: number | null;
  tugSec: number | null;
  singleLegOpenSec: number | null;
  singleLegClosedSec: number | null;
  walk6MinNotes: string;
  gripHangSec: number | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  isFallback?: boolean;
}

export const CONDITION_KEYS = [
  'cardiovascular',
  'metabolic',
  'renal',
  'hypertension',
  'osteoporosis',
  'jointReplacement',
  'glaucoma',
  'hernia',
  'priorFalls',
] as const;
export type ConditionKey = (typeof CONDITION_KEYS)[number];

export const RED_FLAG_KEYS = [
  'chestDiscomfort',
  'unusualBreathlessness',
  'dizziness',
  'palpitations',
  'ankleSwelling',
  'calfPain',
] as const;
export type RedFlagKey = (typeof RED_FLAG_KEYS)[number];

export const MEDICATION_KEYS = [
  'betaBlockers',
  'diuretics',
  'anticoagulants',
  'insulinSulfonylureas',
  'statins',
] as const;
export type MedicationKey = (typeof MEDICATION_KEYS)[number];

export interface Profile {
  id: string;
  name: string;
  age: number;
  weightKg: number;
  mealPattern: MealPattern;
  proteinTargetG: number;
  isActiveRegularly: boolean;
  baselineRestingHr: number | null;
  conditions: Record<ConditionKey, boolean>;
  redFlags: Record<RedFlagKey, boolean>;
  medications: Record<MedicationKey, boolean>;
  /** Clinician clearance for vigorous work has been recorded by the user. */
  clearedForVigorous: boolean;
  /** Bumped when the built-in plan gains exercises, so saved plans can be upgraded in place. */
  programVersion: number;
  program: Program;
  workouts: Workout[];
  proteinLogs: Record<string, ProteinItem[]>;
  benchmarks: Benchmark[];
  chatHistory: ChatMessage[];
}

export interface AiCoachSettings {
  enabled: boolean;
  apiKey: string;
  model: string;
  consentAt: string | null;
}

export interface AppState {
  version: 2;
  isDemoLoaded: boolean;
  activeProfileId: string;
  aiCoach: AiCoachSettings;
  lastBackupAt: string | null;
  profiles: Profile[];
}
