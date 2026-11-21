import { LoadUnit } from './types';

export const KG_PER_LB = 0.45359237;

/** Loads are always stored in kg; this converts for display/input in the exercise's unit. */
export const toUnit = (kg: number, unit: LoadUnit) => (unit === 'lb' ? kg / KG_PER_LB : kg);
export const fromUnit = (v: number, unit: LoadUnit) => (unit === 'lb' ? v * KG_PER_LB : v);

/** Rounded to the nearest 0.5 in the display unit, which matches real plates and stacks. */
export const displayLoad = (kg: number, unit: LoadUnit) => Math.round(toUnit(kg, unit) * 2) / 2;
export const formatLoad = (kg: number, unit: LoadUnit) => `${displayLoad(kg, unit)} ${unit}`;

/** Default smallest step: 5 lb on lb machines; 1 kg under 20 kg (dumbbells), 2.5 kg above. */
export const defaultIncrementKg = (loadKg: number, unit: LoadUnit) =>
  unit === 'lb' ? 5 * KG_PER_LB : loadKg >= 20 ? 2.5 : 1;
