import { Flame, Trash2 } from 'lucide-react';
import { estimateEntryKcal, inferMusclesAndBenefits, isTreadmill } from '../../domain/exercise';
import NumberField from '../../components/NumberField';
import type { CircuitEntry } from '../../types';

interface Props {
  entry: CircuitEntry;
  weightKg: number;
  onPatch: (patch: Partial<CircuitEntry>) => void;
  onRemove: () => void;
}

export default function EntryCard({ entry: e, weightKg, onPatch, onRemove }: Props) {
  const info = inferMusclesAndBenefits(e.name, e.unit);
  const kcal = estimateEntryKcal(e, weightKg);
  const treadmill = isTreadmill(e.name);
  return (
    <div className={`rounded-xl border p-3 ${e.pain > 3 ? 'bg-amber-50 border-amber-300' : 'bg-slate-50/70 border-slate-200'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            <input value={e.name} onChange={(ev) => onPatch({ name: ev.target.value })} aria-label="Exercise name"
              className="font-bold text-sm text-slate-900 bg-transparent border-b border-transparent focus:border-emerald-600 focus:outline-none" />
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-900">
              <Flame className="w-3 h-3" /> ~{kcal} kcal
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {info.muscles.map((m) => (
              <span key={m} className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-100 text-emerald-900">{m}</span>
            ))}
          </div>
        </div>
        <button type="button" onClick={onRemove} aria-label="Remove" className="p-2 text-slate-400 hover:text-rose-700">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
        <label className="flex flex-col gap-0.5">
          <span className="font-bold text-slate-600 uppercase">Sets</span>
          <NumberField min={1} max={20} value={e.sets} onCommit={(n) => onPatch({ sets: n })}
            className="min-h-[40px] px-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold" />
        </label>
        {treadmill ? (
          <label className="flex flex-col gap-0.5">
            <span className="font-bold text-slate-600 uppercase">Speed km/h</span>
            <input type="number" inputMode="decimal" min={0} max={25} step={0.1} placeholder="e.g. 5" value={e.speedKmh ?? ''}
              onChange={(ev) => onPatch({ speedKmh: ev.target.value === '' || !(Number(ev.target.value) > 0) ? null : Math.min(25, Number(ev.target.value)) })}
              className="min-h-[40px] px-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold" />
          </label>
        ) : (
        <label className="flex flex-col gap-0.5">
          <span className="font-bold text-slate-600 uppercase flex items-center justify-between">
            Weight
            <button type="button" onClick={() => onPatch({ loadUnit: e.loadUnit === 'kg' ? 'lb' : 'kg' })}
              className="text-[11px] px-1.5 rounded bg-slate-200 text-slate-800">{e.loadUnit}</button>
          </span>
          <input type="number" min={0} step={0.5} placeholder="BW" value={e.load ?? ''}
            onChange={(ev) => onPatch({ load: ev.target.value === '' || !(Number(ev.target.value) > 0) ? null : Number(ev.target.value) })}
            className="min-h-[40px] px-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold" />
        </label>
        )}
        <label className="flex flex-col gap-0.5">
          <span className="font-bold text-slate-600 uppercase flex items-center justify-between">
            {e.unit === 'min' ? 'Min' : e.unit === 'sec' ? 'Sec' : 'Reps'}
            <button type="button" onClick={() => onPatch({ unit: e.unit === 'reps' ? 'min' : e.unit === 'min' ? 'sec' : 'reps' })}
              className="text-[11px] px-1.5 rounded bg-slate-200 text-slate-800">switch</button>
          </span>
          <NumberField min={1} max={600} value={e.reps} onCommit={(n) => onPatch({ reps: n })}
            className="min-h-[40px] px-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold" />
        </label>
        {treadmill ? (
          <label className="flex flex-col gap-0.5">
            <span className="font-bold text-slate-600 uppercase">Incline %</span>
            <input type="number" inputMode="decimal" min={0} max={30} step={0.5} placeholder="0" value={e.inclinePct ?? ''}
              onChange={(ev) => onPatch({ inclinePct: ev.target.value === '' ? null : Math.min(30, Math.max(0, Number(ev.target.value) || 0)) })}
              className="min-h-[40px] px-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold" />
          </label>
        ) : (
        <label className="flex flex-col gap-0.5">
          <span className="font-bold text-slate-600 uppercase">To fail</span>
          <select value={e.rir === null ? '' : String(e.rir)} onChange={(ev) => onPatch({ rir: ev.target.value === '' ? null : Number(ev.target.value) })}
            className="min-h-[40px] px-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold">
            <option value="">–</option>
            <option value="0">0 (fail)</option>
            <option value="1">1 to fail</option>
            <option value="2">2 to fail</option>
            <option value="3">3 to fail</option>
            <option value="4">4+ easy</option>
          </select>
        </label>
        )}
        <label className="flex flex-col gap-0.5">
          <span className="font-bold text-slate-600 uppercase">Pain 0–10</span>
          <input type="number" min={0} max={10} value={e.pain} onChange={(ev) => onPatch({ pain: Math.min(10, Math.max(0, Number(ev.target.value) || 0)) })}
            className={`min-h-[40px] px-2 rounded-lg border text-sm font-semibold ${e.pain > 3 ? 'border-rose-400 bg-rose-50 text-rose-900' : 'border-slate-300 bg-white'}`} />
        </label>
      </div>
    </div>
  );
}
