import type { ConditionKey, MedicationKey } from '../types';

// ===== Reference Data: Health flags =====
export const CONDITION_ITEMS: { key: ConditionKey; label: string; note: string }[] = [
  { key: 'hypertension', label: 'High blood pressure', note: 'Exhale through effort; no breath-holding; wall sits help.' },
  { key: 'cardiovascular', label: 'Cardiovascular disease', note: 'Gradual warm-up/cool-down; follow doctor clearance.' },
  { key: 'metabolic', label: 'Diabetes / metabolic', note: 'Watch glucose response; post-meal walks help.' },
  { key: 'renal', label: 'Kidney disease', note: 'Follow the protein limit your doctor sets.' },
  { key: 'osteoporosis', label: 'Osteopenia / osteoporosis', note: 'Avoid loaded spinal flexion and high impact.' },
  { key: 'jointReplacement', label: 'Joint replacement', note: 'Keep impact low; respect range limits.' },
  { key: 'glaucoma', label: 'Glaucoma / retinal condition', note: 'Avoid prolonged head-down positions and breath-holding.' },
  { key: 'hernia', label: 'Hernia', note: 'Exhale on effort; avoid maximal straining.' },
  { key: 'priorFalls', label: 'Fall in the past year', note: 'Do balance drills near a counter or wall.' },
];

export const MEDICATION_ITEMS: { key: MedicationKey; label: string; note: string }[] = [
  { key: 'betaBlockers', label: 'Beta-blockers / HR-altering drugs', note: 'Use RPE / talk test instead of heart rate.' },
  { key: 'diuretics', label: 'Diuretics', note: 'Extra fluids and electrolytes in heat.' },
  { key: 'anticoagulants', label: 'Blood thinners', note: 'Avoid fall-prone drills.' },
  { key: 'insulinSulfonylureas', label: 'Insulin / sulfonylureas', note: 'Carry fast carbs; check glucose.' },
  { key: 'statins', label: 'Statins', note: 'Report new unexplained muscle pain to your doctor.' },
];
