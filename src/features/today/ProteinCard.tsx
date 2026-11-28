import { useState } from 'react';
import { Minus, Plus, Undo2, Utensils, X } from 'lucide-react';
import { Card, CardHeader } from '../../components/ui';
import { groupProteinByMeal, PROTEIN_FOODS, proteinGapText } from '../../domain/protein';
import { formatDateISO, shortDateLabel } from '../../lib/dates';
import { uid } from '../../lib/ids';
import type { Profile, ProteinItem, ShowToast, UpdateProfile } from '../../types';

interface Props {
  profile: Profile;
  updateProfile: UpdateProfile;
  showToast: ShowToast;
  /** Day being logged (YYYY-MM-DD); defaults to today. */
  date?: string;
}

export default function ProteinCard({ profile, updateProfile, showToast, date }: Props) {
  const isToday = !date || date === formatDateISO();
  // `day` is the date every add/remove writes to (today unless an earlier day is picked).
  const day = date ?? formatDateISO();
  const slots = profile.mealPattern === '3-meal' ? ['Breakfast', 'Lunch', 'Dinner'] : ['Lunch', 'Dinner'];
  const [slotChoice, setSlot] = useState(slots[0]);
  // If the meal pattern changes (e.g. 3 → 2 meals), fall back to a slot that is actually shown.
  const slot = slots.includes(slotChoice) ? slotChoice : slots[0];
  const [pickFood, setPickFood] = useState<string | null>(null);
  const [sizeIdx, setSizeIdx] = useState(0);
  const [count, setCount] = useState(1);
  const [customFood, setCustomFood] = useState('');
  const [customGrams, setCustomGrams] = useState('');
  const [lastRemoved, setLastRemoved] = useState<{ item: ProteinItem; index: number; date: string } | null>(null);

  const proteinItems = profile.proteinLogs[day] ?? [];
  const totalProtein = proteinItems.reduce((s, i) => s + i.grams, 0);
  const proteinPct = profile.proteinTargetG > 0 ? Math.min(100, Math.round((totalProtein / profile.proteinTargetG) * 100)) : 0;
  const picked = PROTEIN_FOODS.find((f) => f.food === pickFood) ?? null;

  const addProtein = (name: string, grams: number, extra: Partial<ProteinItem> = {}) => {
    if (!name.trim() || !(grams > 0)) return;
    const item: ProteinItem = { id: uid(), mealSlot: slot, name: name.trim(), grams, ...extra };
    updateProfile((p) => ({ proteinLogs: { ...p.proteinLogs, [day]: [...(p.proteinLogs[day] ?? []), item] } }));
    setLastRemoved(null);
    showToast(`Added ${grams} g protein to ${slot}${isToday ? '' : ` (${shortDateLabel(day)})`}`);
  };

  const removeProtein = (id: string) => {
    const idx = proteinItems.findIndex((x) => x.id === id);
    if (idx >= 0) setLastRemoved({ item: proteinItems[idx], index: idx, date: day });
    updateProfile((p) => ({ proteinLogs: { ...p.proteinLogs, [day]: (p.proteinLogs[day] ?? []).filter((x) => x.id !== id) } }));
  };

  const undoProtein = () => {
    if (!lastRemoved) return;
    const { item, index, date } = lastRemoved;
    updateProfile((p) => {
      const list = [...(p.proteinLogs[date] ?? [])];
      list.splice(Math.min(index, list.length), 0, item);
      return { proteinLogs: { ...p.proteinLogs, [date]: list } };
    });
    setLastRemoved(null);
  };

  return (
    <Card>
      <CardHeader icon={<Utensils className="w-5 h-5" />} title={isToday ? 'Protein Today' : `Protein for ${shortDateLabel(day)}`} subtitle={`Target ${profile.proteinTargetG} g/day (${profile.mealPattern})`}
        right={<span className="text-xl font-extrabold text-emerald-800 tabular-nums">{totalProtein} / {profile.proteinTargetG} g</span>} />
      <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden mb-3">
        <div className={`h-full ${proteinPct >= 90 ? 'bg-emerald-600' : 'bg-teal-500'}`} style={{ width: `${proteinPct}%` }} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
        {slots.map((s) => {
          const g = proteinItems.filter((i) => i.mealSlot === s).reduce((a, i) => a + i.grams, 0);
          return (
            <button key={s} type="button" onClick={() => setSlot(s)}
              className={`flex items-center justify-between px-3 min-h-[42px] rounded-xl border text-sm font-bold ${slot === s ? 'bg-emerald-50 border-emerald-600 text-emerald-950' : 'bg-slate-50 border-slate-200'}`}>
              <span>{s}</span><span>{g} g</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {PROTEIN_FOODS.map((f) => (
          <button key={f.food} type="button" onClick={() => { setPickFood(pickFood === f.food ? null : f.food); setSizeIdx(0); setCount(1); }}
            className={`px-3 min-h-[38px] rounded-full text-sm font-semibold border ${pickFood === f.food ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-slate-100 border-slate-200'}`}>
            {f.food}
          </button>
        ))}
      </div>
      {picked && (
        <div className="mb-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2.5">
          <p className="text-sm font-bold">{picked.food} <span className="font-normal text-slate-600">{picked.hint}</span></p>
          <div className="flex flex-wrap gap-2">
            {picked.portions.map((po, k) => (
              <button key={po.size} type="button" onClick={() => setSizeIdx(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${sizeIdx === k ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white border-emerald-300'}`}>
                {po.size} ({po.grams} g)
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">Qty:</span>
            <button type="button" onClick={() => setCount((c) => Math.max(1, c - 1))} aria-label="Decrease quantity" className="w-9 h-9 grid place-items-center rounded-lg bg-white border border-slate-300"><Minus className="w-4 h-4" /></button>
            <span className="font-bold text-base w-6 text-center">{count}</span>
            <button type="button" onClick={() => setCount((c) => Math.min(20, c + 1))} aria-label="Increase quantity" className="w-9 h-9 grid place-items-center rounded-lg bg-white border border-slate-300"><Plus className="w-4 h-4" /></button>
            <button type="button" onClick={() => {
              const po = picked.portions[sizeIdx] ?? picked.portions[0];
              addProtein(`${picked.food}: ${count} ${po.size.toLowerCase()} ${count === 1 ? picked.noun : picked.nounPlural}`, Math.round(po.grams * count));
              setPickFood(null);
            }} className="ml-auto px-4 min-h-[40px] rounded-xl bg-emerald-700 text-white text-sm font-bold">
              Add ({Math.round((picked.portions[sizeIdx]?.grams ?? 0) * count)} g)
            </button>
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <input placeholder="Other food…" value={customFood} onChange={(e) => setCustomFood(e.target.value)} className="flex-1 min-w-0 min-h-[42px] px-3 rounded-xl border border-slate-300 text-sm" />
        <input type="number" placeholder="g" value={customGrams} onChange={(e) => setCustomGrams(e.target.value)} className="w-20 min-h-[42px] px-2 rounded-xl border border-slate-300 text-sm" />
        <button type="button" onClick={() => { addProtein(customFood, Number(customGrams)); setCustomFood(''); setCustomGrams(''); }} className="px-4 min-h-[42px] rounded-xl bg-slate-900 text-white text-sm font-semibold">Add</button>
      </div>
      {lastRemoved && (
        <div className="mt-2 flex items-center justify-between rounded-lg bg-slate-100 px-3 py-1.5 text-xs">
          <span>Removed {lastRemoved.item.name}</span>
          <button type="button" onClick={undoProtein} className="inline-flex items-center gap-1 font-bold text-emerald-800"><Undo2 className="w-3.5 h-3.5" /> Undo</button>
        </div>
      )}
      {/* The whole day at a glance: what was eaten at each meal, with subtotals. */}
      <div className="mt-4 rounded-xl border-2 border-slate-200 overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
          <p className="text-base font-extrabold text-slate-900">{isToday ? 'Eaten today' : `Eaten on ${shortDateLabel(day)}`}</p>
          <p className={`text-base font-bold ${totalProtein >= profile.proteinTargetG ? 'text-emerald-800' : 'text-amber-900'}`}>
            {totalProtein} g · {proteinGapText(totalProtein, profile.proteinTargetG)}
          </p>
        </div>
        {proteinItems.length === 0 ? (
          <p className="px-3 py-3 text-base text-slate-600">Nothing logged yet — tap a food above to add it.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {groupProteinByMeal(proteinItems).map((g) => (
              <div key={g.slot} className="px-3 py-2">
                <p className="flex justify-between text-sm font-bold uppercase tracking-wide text-emerald-800">
                  <span>{g.slot}</span><span>{g.grams} g</span>
                </p>
                <ul>
                  {g.items.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-2 text-base">
                      <span className="text-slate-900">{i.name} — <strong>{i.grams} g</strong></span>
                      <button type="button" onClick={() => removeProtein(i.id)} aria-label={`Remove ${i.name}`}
                        className="min-w-[44px] min-h-[44px] grid place-items-center text-rose-700"><X className="w-5 h-5" /></button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
