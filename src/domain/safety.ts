import type { SafetyCheck } from '../types';

// ===== Pre-session safety screen ("Before you train") =====
// Warning symptoms that mean: don't exercise today, contact a doctor.
// Keys are stored in profile.safetyChecks — never rename an existing key.
export const SAFETY_FLAGS: { key: string; label: string }[] = [
  { key: 'chest', label: 'Chest discomfort, pressure or tightness' },
  { key: 'breathless', label: 'Unusual breathlessness at rest or on mild effort' },
  { key: 'dizzy', label: 'Dizziness, light-headedness or fainting' },
  { key: 'palpitations', label: 'Palpitations, or an irregular or racing pulse' },
  { key: 'swelling', label: 'New or worsening ankle or leg swelling' },
  { key: 'calf', label: 'Calf pain when walking' },
];

export const SAFETY_STOP_MESSAGE =
  'Don’t train today. Contact your doctor. If chest pain or pressure is severe or lasts more than a few minutes, call 108 / 112 now.';

/** Readable symptom names for stored keys (unknown keys are shown as stored). */
export const safetyFlagLabels = (flags: string[]): string[] =>
  flags.map((k) => SAFETY_FLAGS.find((f) => f.key === k)?.label ?? k);

/** One-line status for the coach brief: clear / FLAGGED – … / not done. */
export function safetyCheckLine(check: SafetyCheck | undefined): string {
  if (!check) return 'Safety check: not done';
  if (!check.flags.length) return 'Safety check: clear';
  return `Safety check: FLAGGED – ${safetyFlagLabels(check.flags).join('; ')}`;
}
