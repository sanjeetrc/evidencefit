import { ConditionKey, MedicationKey, RedFlagKey } from './types';

export const PROTEIN_QUICK_CHIPS = [
  { name: 'Whole egg (1)', grams: 6 },
  { name: '2 whole eggs', grams: 12 },
  { name: 'Fish / pomfret 100 g', grams: 25 },
  { name: 'Chicken 100 g', grams: 25 },
  { name: 'Paneer 100 g', grams: 18 },
  { name: 'Cooked dal (1 katori)', grams: 8 },
  { name: 'Curd 200 g', grams: 7 },
  { name: 'Greek yoghurt 200 g', grams: 18 },
  { name: 'Soy chunks 50 g dry', grams: 25 },
  { name: 'Sattu 40 g', grams: 9 },
  { name: 'Whey scoop', grams: 24 },
] as const;

export const CONDITION_ITEMS: { key: ConditionKey; label: string; note: string }[] = [
  { key: 'cardiovascular', label: 'Cardiovascular disease', note: 'Known disease: clearance rules apply; gradual warm-up and cool-down.' },
  { key: 'metabolic', label: 'Diabetes / metabolic disease', note: 'Known disease: clearance rules apply; watch glucose response.' },
  { key: 'renal', label: 'Kidney disease', note: 'Known disease. Protein target is switched off; follow your doctor.' },
  { key: 'hypertension', label: 'High blood pressure', note: 'Exhale through effort; no breath-holding; isometrics favoured.' },
  { key: 'osteoporosis', label: 'Osteopenia / osteoporosis', note: 'Flags loaded spinal flexion and high impact.' },
  { key: 'jointReplacement', label: 'Joint replacement', note: 'Flags high-impact work; respect surgical range limits.' },
  { key: 'glaucoma', label: 'Glaucoma / retinal condition', note: 'Flags head-down positions and breath-holding.' },
  { key: 'hernia', label: 'Hernia', note: 'Flags heavy bracing and breath-holding.' },
  { key: 'priorFalls', label: 'Fall in the past year', note: 'Balance work stays near a support.' },
];

export const RED_FLAG_ITEMS: { key: RedFlagKey; label: string }[] = [
  { key: 'chestDiscomfort', label: 'Chest discomfort, pressure or tightness' },
  { key: 'unusualBreathlessness', label: 'Unusual breathlessness at rest or mild effort' },
  { key: 'dizziness', label: 'Dizziness, light-headedness or fainting' },
  { key: 'palpitations', label: 'Unexplained palpitations or racing pulse' },
  { key: 'ankleSwelling', label: 'New or worsening ankle or leg swelling' },
  { key: 'calfPain', label: 'Calf pain or cramping brought on by walking' },
];

export const MEDICATION_ITEMS: { key: MedicationKey; label: string; note: string }[] = [
  { key: 'betaBlockers', label: 'Beta-blockers / heart-rate-altering drugs', note: 'Heart rate is not a valid gauge: RPE and talk test only.' },
  { key: 'diuretics', label: 'Diuretics', note: 'Higher dehydration and cramp risk in heat.' },
  { key: 'anticoagulants', label: 'Blood thinners', note: 'Avoid fall-prone drills; watch for bruising.' },
  { key: 'insulinSulfonylureas', label: 'Insulin / sulfonylureas', note: 'Hypoglycaemia risk: check glucose, carry fast carbs.' },
  { key: 'statins', label: 'Statins', note: 'New unexplained muscle pain is a question for your doctor.' },
];
