import { ConditionKey, MedicationKey, RedFlagKey } from './types';

export interface Portion { size: string; amount: string; grams: number }
export interface ProteinFood { food: string; hint: string; portions: Portion[] }

/**
 * Protein per portion, cooked weight unless stated. Values are typical
 * food-table figures rounded to the gram; real pieces vary by ±20%.
 */
export const PROTEIN_FOODS: ProteinFood[] = [
  { food: 'Fish', hint: 'Cooked piece, any white fish or pomfret', portions: [
    { size: 'Small', amount: 'half a palm, about 50 g', grams: 12 },
    { size: 'Medium', amount: 'size of your palm, about 100 g', grams: 25 },
    { size: 'Large', amount: 'palm and a half, about 150 g', grams: 37 },
  ] },
  { food: 'Chicken', hint: 'Cooked, counting the meat only', portions: [
    { size: 'Small', amount: '2 curry pieces, about 50 g meat', grams: 13 },
    { size: 'Medium', amount: '4 curry pieces or a palm of boneless, about 100 g', grams: 25 },
    { size: 'Large', amount: '6 curry pieces, about 150 g meat', grams: 37 },
  ] },
  { food: 'Prawns', hint: 'Cooked, shelled', portions: [
    { size: 'Small', amount: 'about 6 medium prawns, 50 g', grams: 12 },
    { size: 'Medium', amount: 'about 12 medium prawns, 100 g', grams: 24 },
    { size: 'Large', amount: 'about 18 medium prawns, 150 g', grams: 36 },
  ] },
  { food: 'Eggs', hint: 'Whole eggs', portions: [
    { size: '1 egg', amount: 'one whole egg', grams: 6 },
    { size: '2 eggs', amount: 'two whole eggs', grams: 12 },
    { size: '3 eggs', amount: 'three whole eggs', grams: 18 },
  ] },
  { food: 'Paneer', hint: 'Fresh paneer', portions: [
    { size: 'Small', amount: 'about 4 cubes, 50 g', grams: 9 },
    { size: 'Medium', amount: 'about 8 cubes, 100 g', grams: 18 },
    { size: 'Large', amount: 'about 12 cubes, 150 g', grams: 27 },
  ] },
  { food: 'Dal', hint: 'Cooked dal, medium thickness', portions: [
    { size: 'Half katori', amount: 'about 75 ml', grams: 4 },
    { size: '1 katori', amount: 'about 150 ml', grams: 8 },
    { size: '2 katori', amount: 'about 300 ml', grams: 16 },
  ] },
  { food: 'Curd', hint: 'Plain dahi', portions: [
    { size: 'Small bowl', amount: 'about 100 g', grams: 4 },
    { size: 'Medium bowl', amount: 'about 200 g', grams: 7 },
    { size: 'Large bowl', amount: 'about 300 g', grams: 10 },
  ] },
  { food: 'Milk', hint: 'Cow or toned milk', portions: [
    { size: 'Small glass', amount: 'about 150 ml', grams: 5 },
    { size: 'Large glass', amount: 'about 250 ml', grams: 8 },
  ] },
  { food: 'Greek yoghurt', hint: 'Hung curd or Greek yoghurt', portions: [
    { size: 'Small cup', amount: 'about 100 g', grams: 9 },
    { size: 'Large cup', amount: 'about 200 g', grams: 18 },
  ] },
  { food: 'Soy chunks', hint: 'Weighed dry, before soaking', portions: [
    { size: 'Small', amount: 'about 25 g dry', grams: 13 },
    { size: 'Large', amount: 'about 50 g dry', grams: 25 },
  ] },
  { food: 'Sattu', hint: 'Roasted gram flour drink', portions: [
    { size: '2 tbsp', amount: 'about 20 g', grams: 4 },
    { size: '4 tbsp', amount: 'about 40 g', grams: 9 },
  ] },
  { food: 'Whey', hint: 'Protein powder', portions: [
    { size: 'Half scoop', amount: 'about 15 g powder', grams: 12 },
    { size: '1 scoop', amount: 'about 30 g powder', grams: 24 },
  ] },
];

/** Name stored in the log, e.g. "Fish, Medium (size of your palm, about 100 g)". */
export const portionLabel = (f: ProteinFood, p: Portion) => `${f.food}, ${p.size.toLowerCase()} (${p.amount})`;

export const PAIN_SIDES = ['Left', 'Right', 'Both sides', 'Middle'] as const;
export const PAIN_AREAS = [
  'Knee', 'Hip', 'Thigh or calf', 'Ankle or foot', 'Lower back', 'Upper back or neck',
  'Shoulder', 'Elbow', 'Wrist or hand', 'Chest', 'Other',
] as const;

/** How to score pain 0–10 during exercise. Effort and muscle burn are not pain. */
export const PAIN_SCALE: { range: string; label: string; action: string; tone: 'emerald' | 'amber' | 'rose' }[] = [
  { range: '0', label: 'No pain', action: 'Effort, burning muscles and breathlessness are not pain. Score 0.', tone: 'emerald' },
  { range: '1–3', label: 'Mild: you notice it, movement is normal', action: 'Carry on. Fine if it settles by the next morning and is no worse next session.', tone: 'emerald' },
  { range: '4–5', label: 'Moderate: it changes how you move, or rises set to set', action: 'Modify before the next set: change range or grip, slow down, lighten, or swap the exercise.', tone: 'amber' },
  { range: '6–10', label: 'Strong, or any sharp, stabbing or catching pain', action: 'Stop this exercise today. See a physio or doctor if there is swelling, night pain, or it lasts over 1–2 weeks.', tone: 'rose' },
];

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
