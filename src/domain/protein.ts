// ===== Reference Data: Protein =====
export interface Portion { size: string; amount: string; grams: number }
export interface ProteinFood { food: string; hint: string; noun: string; nounPlural: string; portions: Portion[] }

export const recommendedProteinTarget = (age: number, weightKg: number) =>
  Math.round(weightKg * (age >= 60 ? 1.4 : 1.6));

const MEAL_ORDER = ['Breakfast', 'Lunch', 'Snack', 'Dinner'];

export interface MealGroup<T extends { mealSlot: string; grams: number }> { slot: string; items: T[]; grams: number }

/** Group a day's protein items by meal (Breakfast → Lunch → Snack → Dinner, then any others), with subtotals. */
export function groupProteinByMeal<T extends { mealSlot: string; grams: number }>(items: T[]): MealGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const i of items) map.set(i.mealSlot || 'Other', [...(map.get(i.mealSlot || 'Other') ?? []), i]);
  const rank = (s: string) => { const k = MEAL_ORDER.indexOf(s); return k < 0 ? MEAL_ORDER.length : k; };
  return [...map.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([slot, list]) => ({ slot, items: list, grams: Math.round(list.reduce((s, i) => s + (Number(i.grams) || 0), 0) * 10) / 10 }));
}

/** "23 g to go" / "Target reached (+5 g)" / "No target set". */
export function proteinGapText(total: number, target: number): string {
  if (!(target > 0)) return 'No target set';
  const gap = Math.round((target - total) * 10) / 10;
  return gap > 0 ? `${gap} g to go` : `Target reached${gap < 0 ? ` (+${-gap} g)` : ''}`;
}

export const PROTEIN_FOODS: ProteinFood[] = [
  { food: 'Eggs', hint: 'Whole egg (about 6 g each)', noun: 'egg', nounPlural: 'eggs', portions: [
    { size: 'Whole', amount: 'about 50 g', grams: 6 },
    { size: 'White only', amount: 'about 33 g', grams: 3.5 },
  ] },
  { food: 'Fish', hint: 'Pomfret, surmai, rawas piece', noun: 'piece', nounPlural: 'pieces', portions: [
    { size: 'Small', amount: 'about 40 g', grams: 9 },
    { size: 'Medium', amount: 'about 60 g', grams: 14 },
    { size: 'Large', amount: 'about 90 g', grams: 21 },
  ] },
  { food: 'Chicken', hint: 'Meat only (not bone)', noun: 'piece', nounPlural: 'pieces', portions: [
    { size: 'Small', amount: 'about 25 g meat', grams: 7 },
    { size: 'Medium', amount: 'about 40 g meat', grams: 11 },
    { size: 'Large', amount: 'about 60 g meat', grams: 16 },
  ] },
  // Red meats: cooked, meat only (bone and fat removed). Roughly 26–28 g protein per 100 g cooked meat.
  { food: 'Goat (mutton)', hint: 'Curry or roast piece — meat only, not bone', noun: 'piece', nounPlural: 'pieces', portions: [
    { size: 'Small', amount: 'about 30 g meat', grams: 8 },
    { size: 'Medium', amount: 'about 50 g meat', grams: 13 },
    { size: 'Large', amount: 'about 80 g meat', grams: 22 },
  ] },
  { food: 'Pork', hint: 'Curry, roast or chop — meat only, not bone or fat', noun: 'piece', nounPlural: 'pieces', portions: [
    { size: 'Small', amount: 'about 30 g meat', grams: 8 },
    { size: 'Medium', amount: 'about 50 g meat', grams: 13 },
    { size: 'Large', amount: 'about 80 g meat', grams: 21 },
  ] },
  { food: 'Beef', hint: 'Curry, fry or steak — meat only, not bone', noun: 'piece', nounPlural: 'pieces', portions: [
    { size: 'Small', amount: 'about 30 g meat', grams: 8 },
    { size: 'Medium', amount: 'about 50 g meat', grams: 14 },
    { size: 'Large', amount: 'about 80 g meat', grams: 22 },
  ] },
  { food: 'Paneer', hint: 'Cubes or tikka slice', noun: 'piece', nounPlural: 'pieces', portions: [
    { size: 'Small', amount: 'about 10 g', grams: 2 },
    { size: 'Medium', amount: 'about 15 g', grams: 3 },
    { size: 'Large', amount: 'about 25 g', grams: 5 },
  ] },
  { food: 'Dal', hint: 'Cooked dal, medium thickness', noun: 'katori', nounPlural: 'katori', portions: [
    { size: 'Small', amount: '100 ml', grams: 5 },
    { size: 'Regular', amount: '150 ml', grams: 8 },
    { size: 'Large', amount: '200 ml', grams: 10 },
  ] },
  { food: 'Curd', hint: 'Plain dahi', noun: 'bowl', nounPlural: 'bowls', portions: [
    { size: 'Small', amount: '100 g', grams: 4 },
    { size: 'Medium', amount: '200 g', grams: 7 },
  ] },
  { food: 'Greek yoghurt', hint: 'Hung curd / Greek yoghurt', noun: 'cup', nounPlural: 'cups', portions: [
    { size: 'Small', amount: '100 g', grams: 9 },
    { size: 'Large', amount: '200 g', grams: 18 },
  ] },
  { food: 'Whey', hint: 'Protein powder', noun: 'scoop', nounPlural: 'scoops', portions: [
    { size: 'Half', amount: '15 g', grams: 12 },
    { size: 'Full', amount: '30 g', grams: 24 },
  ] },
];
