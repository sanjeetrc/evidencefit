import { ConditionKey, MedicationKey, RedFlagKey } from './types';

export interface Portion { size: string; amount: string; grams: number }
export interface ProteinFood {
  food: string;
  hint: string;
  /** What one item is called: piece, egg, katori, glass… */
  noun: string;
  nounPlural: string;
  portions: Portion[];
}

/**
 * Protein for ONE piece or serving, cooked and edible weight (bone and shell
 * excluded). Typical Indian home portions; estimates, real pieces vary ±25%.
 * Protein density used: fish 23 g, chicken 27 g, goat, pork and beef about 26–27 g, prawns 24 g, paneer 18 g per 100 g.
 */
export const PROTEIN_FOODS: ProteinFood[] = [
  { food: 'Fish', hint: 'One curry or fry piece (surmai, pomfret, rawas…)', noun: 'piece', nounPlural: 'pieces', portions: [
    { size: 'Small', amount: 'about 40 g fish', grams: 9 },
    { size: 'Medium', amount: 'about 60 g fish', grams: 14 },
    { size: 'Large', amount: 'about 90 g fish', grams: 21 },
  ] },
  { food: 'Chicken', hint: 'One curry piece, counting the meat only (not bone)', noun: 'piece', nounPlural: 'pieces', portions: [
    { size: 'Small', amount: 'wing or small piece, about 25 g meat', grams: 7 },
    { size: 'Medium', amount: 'regular curry piece, about 40 g meat', grams: 11 },
    { size: 'Large', amount: 'leg, thigh or breast piece, about 60 g meat', grams: 16 },
  ] },
  { food: 'Goat (mutton)', hint: 'Curry or roast piece, meat only (not bone)', noun: 'piece', nounPlural: 'pieces', portions: [
    { size: 'Small', amount: 'about 30 g meat', grams: 8 },
    { size: 'Medium', amount: 'about 50 g meat', grams: 13 },
    { size: 'Large', amount: 'about 80 g meat', grams: 22 },
  ] },
  { food: 'Pork', hint: 'Curry, roast or chop, meat only (not bone or fat)', noun: 'piece', nounPlural: 'pieces', portions: [
    { size: 'Small', amount: 'about 30 g meat', grams: 8 },
    { size: 'Medium', amount: 'about 50 g meat', grams: 13 },
    { size: 'Large', amount: 'about 80 g meat', grams: 21 },
  ] },
  { food: 'Beef', hint: 'Curry, fry or steak, meat only (not bone)', noun: 'piece', nounPlural: 'pieces', portions: [
    { size: 'Small', amount: 'about 30 g meat', grams: 8 },
    { size: 'Medium', amount: 'about 50 g meat', grams: 14 },
    { size: 'Large', amount: 'about 80 g meat', grams: 22 },
  ] },
  { food: 'Prawns', hint: 'One prawn, shelled and cooked', noun: 'prawn', nounPlural: 'prawns', portions: [
    { size: 'Small', amount: 'about 5 g', grams: 1 },
    { size: 'Medium', amount: 'about 10 g', grams: 2.5 },
    { size: 'Large', amount: 'tiger prawn, about 25 g', grams: 6 },
  ] },
  { food: 'Paneer', hint: 'One piece of paneer', noun: 'piece', nounPlural: 'pieces', portions: [
    { size: 'Small', amount: 'small cube in a curry, about 10 g', grams: 2 },
    { size: 'Medium', amount: 'bigger cube, about 15 g', grams: 3 },
    { size: 'Large', amount: 'tikka piece or slice, about 25 g', grams: 5 },
  ] },
  { food: 'Eggs', hint: 'Whole egg; egg white alone is about 3.5 g', noun: 'egg', nounPlural: 'eggs', portions: [
    { size: 'Whole', amount: 'about 50 g', grams: 6 },
    { size: 'White only', amount: 'about 33 g', grams: 3.5 },
  ] },
  { food: 'Dal', hint: 'Cooked dal, medium thickness', noun: 'katori', nounPlural: 'katori', portions: [
    { size: 'Small', amount: 'about 100 ml', grams: 5 },
    { size: 'Regular', amount: 'about 150 ml', grams: 8 },
    { size: 'Large', amount: 'about 200 ml', grams: 10 },
  ] },
  { food: 'Curd', hint: 'Plain dahi', noun: 'bowl', nounPlural: 'bowls', portions: [
    { size: 'Small', amount: 'about 100 g', grams: 4 },
    { size: 'Medium', amount: 'about 200 g', grams: 7 },
    { size: 'Large', amount: 'about 300 g', grams: 10 },
  ] },
  { food: 'Milk', hint: 'Cow or toned milk', noun: 'glass', nounPlural: 'glasses', portions: [
    { size: 'Small', amount: 'about 150 ml', grams: 5 },
    { size: 'Large', amount: 'about 250 ml', grams: 8 },
  ] },
  { food: 'Greek yoghurt', hint: 'Hung curd or Greek yoghurt', noun: 'cup', nounPlural: 'cups', portions: [
    { size: 'Small', amount: 'about 100 g', grams: 9 },
    { size: 'Large', amount: 'about 200 g', grams: 18 },
  ] },
  { food: 'Soy chunks', hint: 'Weighed dry, before soaking', noun: 'serving', nounPlural: 'servings', portions: [
    { size: 'Small', amount: 'about 25 g dry', grams: 13 },
    { size: 'Large', amount: 'about 50 g dry', grams: 25 },
  ] },
  { food: 'Sattu', hint: 'Roasted gram flour', noun: 'tablespoon', nounPlural: 'tablespoons', portions: [
    { size: 'Heaped', amount: 'about 10 g', grams: 2 },
  ] },
  { food: 'Whey', hint: 'Protein powder', noun: 'scoop', nounPlural: 'scoops', portions: [
    { size: 'Half', amount: 'about 15 g powder', grams: 12 },
    { size: 'Full', amount: 'about 30 g powder', grams: 24 },
  ] },
];

/** Total protein for n items, rounded to the gram (minimum 1). */
export const portionTotal = (p: Portion, count: number) => Math.max(1, Math.round(p.grams * count));

/** Log name, e.g. "Chicken: 3 medium pieces". */
export const countedName = (food: string, size: string, noun: string, nounPlural: string, count: number) =>
  `${food}: ${count} ${size.toLowerCase()} ${count === 1 ? noun : nounPlural}`;

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
