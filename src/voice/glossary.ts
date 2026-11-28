import type { GlossaryRule } from '../types';

// Built-in fixes for common speech-to-text slips. User glossary rules run FIRST so they can override these.
export const BUILTIN_VOICE_FIXES: GlossaryRule[] = [
  // Cardio & Treadmill
  { from: 'thread mill', to: 'treadmill' },
  { from: 'red mill', to: 'treadmill' },
  { from: 'trade mill', to: 'treadmill' },
  { from: 'tread meal', to: 'treadmill' },
  { from: 'in client', to: 'incline' },
  { from: 'in climb', to: 'incline' },
  { from: 'ink line', to: 'incline' },
  { from: 'aerobic steeper', to: 'Aerobic stepper' },

  // Lower Body
  { from: 'like press', to: 'Leg press' },
  { from: 'lake press', to: 'Leg press' },
  { from: 'leg trace', to: 'Leg press' },
  { from: 'leg dress', to: 'Leg press' },
  { from: 'hamstring girl', to: 'Hamstring curl' },
  { from: 'hamstring call', to: 'Hamstring curl' },
  { from: 'hamstring cold', to: 'Hamstring curl' },
  { from: 'wall seat', to: 'Wall sit' },
  { from: 'wall set', to: 'Wall sit' },
  { from: 'wall shit', to: 'Wall sit' },
  { from: 'squads', to: 'squats' },

  // Upper Body (Push & Pull)
  { from: 'bunch press', to: 'Bench press' },
  { from: 'branch press', to: 'Bench press' },
  { from: 'just press', to: 'Chest press' },
  { from: 'chess press', to: 'Chest press' },
  { from: 'push ups', to: 'Push-ups' },
  { from: 'pushup', to: 'Push-ups' },
  { from: 'pushups', to: 'Push-ups' },
  { from: 'tricep push down', to: 'Tricep push-down' },
  { from: 'triceps push down', to: 'Tricep push-down' },
  { from: 'tricep pushdown', to: 'Tricep push-down' },
  { from: 'lat pull down', to: 'Lat pulldown' },
  { from: 'late pulldown', to: 'Lat pulldown' },
  { from: 'light pulldown', to: 'Lat pulldown' },
  { from: 'lad pulldown', to: 'Lat pulldown' },
  { from: 'seated table row', to: 'Seated cable row' },
  { from: 'seated cable road', to: 'Seated cable row' },
  { from: 'cable road', to: 'cable row' },
  { from: 'bicep girl', to: 'Bicep curl' },
  { from: 'bicep call', to: 'Bicep curl' },
  { from: 'dumb bell', to: 'dumbbell' },
  { from: 'dumb bells', to: 'dumbbells' },
  { from: 'dumble', to: 'dumbbell' },
  { from: 'dumbles', to: 'dumbbells' },

  // Mobility & Yoga
  { from: 'syria namaskar', to: 'Surya Namaskar' },
  { from: 'syria mask', to: 'Surya Namaskar' },
  { from: 'surya mask', to: 'Surya Namaskar' },
  { from: 'soorya namaskar', to: 'Surya Namaskar' },

  // Sets, Reps, Units & To-Fail
  { from: 'wraps', to: 'reps' },
  { from: 'raps', to: 'reps' },
  { from: 'rap', to: 'reps' },
  { from: 'rats', to: 'reps' },
  { from: 'reb', to: 'rep' },
  { from: 'rebs', to: 'reps' },
  { from: 'to rep to fail', to: '2 reps to fail' },
  { from: 'to reps to fail', to: '2 reps to fail' },
  { from: 'sets of', to: 'sets' },
  { from: 'set of', to: 'sets' },
  { from: '12 fail', to: '1 to fail' },
  { from: '22 fail', to: '2 to fail' },
  { from: '32 fail', to: '3 to fail' },
  { from: '42 fail', to: '4 to fail' },
  { from: 'too fail', to: 'to fail' },
  { from: 'two fail', to: '2 to fail' },
  { from: 'kilos', to: 'kg' },
  { from: 'kilo', to: 'kg' },
  { from: 'pounds', to: 'lb' },
  { from: 'pound', to: 'lb' },
];

export function applyVoiceGlossary(text: string, glossary: GlossaryRule[]): string {
  let out = text.replace(/£\s*(\d+(?:\.\d+)?)/g, '$1 lb');
  for (const rule of [...glossary, ...BUILTIN_VOICE_FIXES]) {
    const from = rule.from.trim();
    const to = rule.to.trim();
    if (!from) continue;
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Lookarounds instead of \b so phrases starting/ending with symbols ("£", "3x") still match;
    // function replacer so "$" in the replacement is taken literally.
    out = out.replace(new RegExp(`(?<!\\w)${escaped}(?!\\w)`, 'gi'), () => to);
  }
  return out;
}
