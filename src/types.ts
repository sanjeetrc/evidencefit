// Shared types. The persisted JSON shape (AppState) must stay backward-compatible:
// it is stored under STORAGE_KEY in localStorage and in backup files.

export type Unit = 'reps' | 'sec' | 'min';
export type LoadUnit = 'kg' | 'lb';
export type Location = 'Gym' | 'Home' | 'Outdoor';
export type Climate = 'Normal' | 'Hot/Humid';
export type MealPattern = '2-meal' | '3-meal';

export type MuscleGroup =
  | 'Quads' | 'Hamstrings' | 'Glutes' | 'Chest' | 'Triceps'
  | 'Back' | 'Biceps' | 'Shoulders' | 'Core' | 'Cardio' | 'Mobility';

export interface CircuitEntry {
  id: string;
  name: string;
  sets: number;
  load: number | null;
  loadUnit: LoadUnit;
  reps: number;
  unit: Unit;
  rir: number | null; // reps left in reserve ("to fail"): 0 = fail, 2 = 2 to fail
  pain: number;
  /** Treadmill only (optional; absent in older data). Belt speed in km/h. */
  speedKmh?: number | null;
  /** Treadmill only (optional; absent in older data). Incline / grade in %. */
  inclinePct?: number | null;
}

export interface LoggedWorkout {
  id: string;
  date: string;
  location: Location;
  sleepHours: number | null;
  climate: Climate;
  notes: string;
  entries: CircuitEntry[];
  estKcal: number;
  muscles: MuscleGroup[];
  benefits: string[];
}

export interface ProteinItem {
  id: string;
  mealSlot: string;
  name: string;
  grams: number;
  count?: number;
  gramsEach?: number;
  food?: string;
  size?: string;
  noun?: string;
  nounPlural?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  isFallback?: boolean;
}

export interface GlossaryRule {
  from: string;
  to: string;
}

export const CONDITION_KEYS = ['cardiovascular', 'metabolic', 'renal', 'hypertension', 'osteoporosis', 'jointReplacement', 'glaucoma', 'hernia', 'priorFalls'] as const;
export type ConditionKey = (typeof CONDITION_KEYS)[number];
export const MEDICATION_KEYS = ['betaBlockers', 'diuretics', 'anticoagulants', 'insulinSulfonylureas', 'statins'] as const;
export type MedicationKey = (typeof MEDICATION_KEYS)[number];

export interface Profile {
  id: string;
  name: string;
  age: number;
  weightKg: number;
  mealPattern: MealPattern;
  proteinTargetG: number;
  conditions: Record<ConditionKey, boolean>;
  medications: Record<MedicationKey, boolean>;
  circuitLogs: LoggedWorkout[];
  proteinLogs: Record<string, ProteinItem[]>;
  chatHistory: ChatMessage[];
  voiceGlossary: GlossaryRule[];
  /** Pre-session safety screen, one per day (YYYY-MM-DD). Optional: absent in older data/backups. */
  safetyChecks?: Record<string, SafetyCheck>;
  /** Unit for new entries when none is said. Optional: absent in older data → 'lb'. */
  defaultLoadUnit?: LoadUnit;
}

export interface SafetyCheck {
  /** ISO timestamp of when the check was answered. */
  at: string;
  /** Keys of the ticked symptoms (see SAFETY_FLAGS); empty = "None of these today". */
  flags: string[];
}

export type AiProvider = 'gemini' | 'groq';

export interface AiCoachSettings {
  enabled: boolean;
  /** Which service answers. Absent in older data → 'gemini'. */
  provider: AiProvider;
  // Gemini (original field names kept for backward compatibility)
  apiKey: string;
  model: string;
  consentAt: string | null;
  // Groq
  groqApiKey: string;
  groqModel: string;
  groqConsentAt: string | null;
}

/** Google Drive sync settings. File IDs aren't secret (they may appear in backups); the access token never is stored. */
export interface DriveSyncSettings {
  enabled: boolean;
  folderId?: string;
  docId?: string;
  jsonId?: string;
  lastSyncAt?: string;
  /** A sync failed or needs sign-in; retried on the next save or tap. */
  pendingSync?: boolean;
}

export interface AppState {
  version: 2;
  activeProfileId: string;
  aiCoach: AiCoachSettings;
  lastBackupAt: string | null;
  profiles: Profile[];
  /** Optional: absent in older data and backups. */
  driveSync?: DriveSyncSettings;
}

export interface QuickPreset {
  name: string;
  group: 'Gym' | 'Home';
  /** Shown in its own row; no "to fail" value. */
  section?: 'Mobility';
  sets: number;
  reps: number;
  unit: Unit;
  /** Uses the profile's default weight unit (lb unless changed in Settings). */
  defaultLoad?: number;
}

export interface TomorrowPlan {
  headline: string;
  restingMuscles: MuscleGroup[];
  neglectedMuscles: MuscleGroup[];
  gymSuggestion: string;
  homeSuggestion: string;
  rationale: string;
}

export type UpdateProfile = (fn: (p: Profile) => Partial<Profile>) => void;
export type ShowToast = (msg: string) => void;
