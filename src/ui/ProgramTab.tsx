import { useState } from 'react';
import { Award, Calendar, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Audit, exerciseWarnings } from '../domain/engine';
import { buildDefaultProgram, inferRiskTags } from '../domain/program';
import { formatDateISO, shortDateLabel } from '../domain/dates';
import { uid } from '../domain/state';
import { Benchmark, DAYS_OF_WEEK, DayKey, DayPlan, LoadUnit, Location, Profile, ProgramExercise, Unit } from '../domain/types';
import { KG_PER_LB, fromUnit, toUnit } from '../domain/units';
import { Card, CardHeader, NumInput, TierBadge } from './common';

interface Props {
  profile: Profile;
  audit: Audit;
  updateProfile: (fn: (p: Profile) => Partial<Profile>) => void;
  showToast: (msg: string, tone?: 'emerald' | 'amber') => void;
  confirm: (o: { title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void }) => void;
}

type BmField = 'chairStand30s' | 'tugSec' | 'singleLegOpenSec' | 'singleLegClosedSec' | 'gripHangSec';
const BM_FIELDS: { key: BmField; label: string; better: 'higher' | 'lower'; step?: number }[] = [
  { key: 'chairStand30s', label: '30-s chair stand (reps)', better: 'higher' },
  { key: 'tugSec', label: 'Timed up-and-go (s)', better: 'lower', step: 0.1 },
  { key: 'singleLegOpenSec', label: 'One-leg stand, eyes open (s)', better: 'higher' },
  { key: 'singleLegClosedSec', label: 'One-leg stand, eyes closed (s)', better: 'higher' },
  { key: 'gripHangSec', label: 'Dead hang or carry (s)', better: 'higher' },
];

export function ProgramTab({ profile, audit, updateProfile, showToast, confirm }: Props) {
  const [day, setDay] = useState<DayKey>('Mon');
  const plan = profile.program[day];

  const setPlan = (fn: (d: DayPlan) => Partial<DayPlan>) =>
    updateProfile((p) => ({ program: { ...p.program, [day]: { ...p.program[day], ...fn(p.program[day]) } } }));
  const setEx = (id: string, patch: Partial<ProgramExercise>) =>
    setPlan((d) => ({ exercises: d.exercises.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));

  const emptyBm = { date: formatDateISO(), chairStand30s: null, tugSec: null, singleLegOpenSec: null, singleLegClosedSec: null, gripHangSec: null, walk6MinNotes: '' };
  const [bm, setBm] = useState<Omit<Benchmark, 'id'>>(emptyBm);

  const saveBm = () => {
    if (BM_FIELDS.every((f) => bm[f.key] === null) && !bm.walk6MinNotes.trim()) {
      showToast('Enter at least one test result.', 'amber');
      return;
    }
    updateProfile((p) => ({ benchmarks: [{ ...bm, id: uid(), walk6MinNotes: bm.walk6MinNotes.trim() }, ...p.benchmarks].sort((a, b) => b.date.localeCompare(a.date)) }));
    setBm(emptyBm);
    showToast('Test results saved.');
  };

  const sortedBm = [...profile.benchmarks].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-6">
      {audit.isMasters && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3 text-sm text-emerald-950">
          <Award className="w-5 h-5 text-emerald-800 shrink-0 mt-0.5" aria-hidden />
          <p><strong>60+ programme.</strong> Priorities: power and leg strength, balance, aerobic fitness, muscle, bone. Hard sessions for the same muscles stay 48–72 h apart. Start each muscle at 6–10 hard sets a week and add volume only if recovery allows. <TierBadge tier="Strong Consensus" /></p>
        </div>
      )}

      <Card>
        <CardHeader
          icon={<Calendar className="w-5 h-5" />}
          title="Weekly plan"
          subtitle="Edits here feed the Today logger"
          right={
            <button type="button" className="inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-lg text-sm font-semibold border border-slate-300 text-slate-800"
              onClick={() => confirm({ title: 'Restore the default plan?', message: 'Your edits to the weekly plan will be replaced. Logged sessions are not affected.', confirmLabel: 'Restore', danger: true,
                onConfirm: () => { updateProfile(() => ({ program: buildDefaultProgram() })); showToast('Default plan restored.'); } })}>
              <RotateCcw className="w-4 h-4" aria-hidden /> Default plan
            </button>
          }
        />
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4" role="tablist" aria-label="Day of week">
          {DAYS_OF_WEEK.map((d) => (
            <button key={d} type="button" role="tab" aria-selected={day === d} onClick={() => setDay(d)}
              className={`flex flex-col items-center min-w-[3.5rem] px-2 py-1.5 rounded-xl border text-sm font-bold ${day === d ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-800 border-slate-200'}`}>
              {d}<span className={`text-[11px] font-semibold ${day === d ? 'text-emerald-300' : 'text-slate-600'}`}>{profile.program[d].location}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-4">
          <input type="text" aria-label="Day title" value={plan.title} onChange={(e) => setPlan(() => ({ title: e.target.value }))}
            className="sm:col-span-2 text-sm font-semibold px-3 min-h-[44px] rounded-xl border border-slate-300 bg-white" />
          <select aria-label="Day location" value={plan.location} onChange={(e) => setPlan(() => ({ location: e.target.value as Location }))}
            className="text-sm font-semibold px-3 min-h-[44px] rounded-xl border border-slate-300 bg-white">
            {(['Gym', 'Home', 'Outdoor', 'Rest'] as Location[]).map((l) => <option key={l}>{l}</option>)}
          </select>
        </div>

        <div className="space-y-3">
          {plan.exercises.map((ex) => {
            const warnings = exerciseWarnings(ex, profile, audit.screening);
            return (
              <div key={ex.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="flex items-center gap-2">
                  <input type="text" aria-label="Exercise name" value={ex.name}
                    onChange={(e) => setEx(ex.id, { name: e.target.value, tags: inferRiskTags(e.target.value), why: undefined, tier: undefined })}
                    className="flex-1 min-w-0 text-sm font-bold px-3 min-h-[44px] rounded-lg border border-slate-300 bg-white" />
                  <button type="button" onClick={() => setPlan((d) => ({ exercises: d.exercises.filter((e) => e.id !== ex.id) }))}
                    className="p-2.5 rounded-lg text-slate-500 hover:text-rose-700" aria-label={`Remove ${ex.name}`}><Trash2 className="w-4 h-4" /></button>
                </div>
                {ex.why && <p className="text-sm text-slate-700">{ex.why} {ex.tier && <TierBadge tier={ex.tier} />}</p>}
                {warnings.map((w, k) => (
                  <p key={k} className={`text-sm font-semibold px-2.5 py-1.5 rounded-lg ${w.severity === 'avoid' ? 'bg-rose-100 text-rose-900' : 'bg-amber-100 text-amber-950'}`}>{w.severity === 'avoid' ? 'Avoid: ' : 'Caution: '}{w.text}</p>
                ))}
                <div className="grid grid-cols-2 sm:grid-cols-7 gap-2 text-sm">
                  <label className="flex flex-col gap-0.5"><span className="text-xs font-bold text-slate-600 uppercase">Sets</span>
                    <NumInput label="Sets" value={ex.sets} min={1} max={10} onChange={(v) => setEx(ex.id, { sets: v ?? 1 })} /></label>
                  <label className="flex flex-col gap-0.5"><span className="text-xs font-bold text-slate-600 uppercase">Min</span>
                    <NumInput label="Range minimum" value={ex.repMin} min={0} max={600} onChange={(v) => setEx(ex.id, { repMin: v ?? 0, repMax: Math.max(v ?? 0, ex.repMax) })} /></label>
                  <label className="flex flex-col gap-0.5"><span className="text-xs font-bold text-slate-600 uppercase">Max</span>
                    <NumInput label="Range maximum" value={ex.repMax} min={0} max={600} onChange={(v) => setEx(ex.id, { repMax: v ?? 0 })} /></label>
                  <label className="flex flex-col gap-0.5"><span className="text-xs font-bold text-slate-600 uppercase">Unit</span>
                    <select aria-label="Unit" value={ex.unit} onChange={(e) => setEx(ex.id, { unit: e.target.value as Unit })} className="min-h-[44px] px-2 rounded-lg border border-slate-300 bg-white font-semibold">
                      <option value="reps">reps</option><option value="sec">sec</option><option value="min">min</option>
                    </select></label>
                  <label className="flex flex-col gap-0.5"><span className="text-xs font-bold text-slate-600 uppercase">RPE</span>
                    <NumInput label="Target RPE" value={ex.targetRpe} min={1} max={10} step={0.5} onChange={(v) => setEx(ex.id, { targetRpe: v ?? 7 })} /></label>
                  <label className="flex flex-col gap-0.5"><span className="text-xs font-bold text-slate-600 uppercase">Weights in</span>
                    <select aria-label="Weight unit" value={ex.loadUnit ?? 'kg'}
                      onChange={(e) => { const u = e.target.value as LoadUnit; setEx(ex.id, { loadUnit: u, incrementKg: u === 'lb' ? 5 * KG_PER_LB : undefined }); }}
                      className="min-h-[44px] px-2 rounded-lg border border-slate-300 bg-white font-semibold">
                      <option value="kg">kg</option><option value="lb">lb</option>
                    </select></label>
                  <label className="flex flex-col gap-0.5"><span className="text-xs font-bold text-slate-600 uppercase">Step {ex.loadUnit ?? 'kg'}</span>
                    <NumInput label={`Smallest load step in ${ex.loadUnit ?? 'kg'}`}
                      value={ex.incrementKg === undefined ? null : Math.round(toUnit(ex.incrementKg, ex.loadUnit ?? 'kg') * 100) / 100}
                      allowEmpty min={0.25} max={ex.loadUnit === 'lb' ? 40 : 20} step={0.25}
                      onChange={(v) => setEx(ex.id, { incrementKg: v === null ? undefined : fromUnit(v, ex.loadUnit ?? 'kg') })} /></label>
                </div>
                <input type="text" aria-label="Coaching cue" placeholder="Coaching cue" value={ex.notes} onChange={(e) => setEx(ex.id, { notes: e.target.value })}
                  className="w-full text-sm px-3 min-h-[40px] rounded-lg border border-slate-300 bg-white" />
              </div>
            );
          })}
        </div>
        <button type="button"
          onClick={() => setPlan((d) => ({ exercises: [...d.exercises, { id: uid(), name: 'New exercise', sets: 3, repMin: 8, repMax: 12, unit: 'reps', targetRpe: 7, restSec: 60, notes: '' }] }))}
          className="mt-4 w-full flex items-center justify-center gap-2 min-h-[48px] rounded-xl border-2 border-dashed border-slate-300 text-sm font-bold text-slate-700 hover:border-emerald-600">
          <Plus className="w-4 h-4" aria-hidden /> Add exercise to {day}
        </button>
      </Card>

      <Card>
        <CardHeader icon={<Award className="w-5 h-5" />} title="Function tests every 4–8 weeks" subtitle="Safe field tests for power, balance, mobility and grip. No maximal fitness test without medical clearance." />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <label className="flex flex-col gap-1 text-sm"><span className="font-semibold text-slate-800">Date</span>
            <input type="date" value={bm.date} max={formatDateISO()} onChange={(e) => setBm({ ...bm, date: e.target.value || formatDateISO() })} className="min-h-[44px] px-3 rounded-lg border border-slate-300 bg-white" /></label>
          {BM_FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1 text-sm"><span className="font-semibold text-slate-800">{f.label}</span>
              <NumInput label={f.label} value={bm[f.key]} allowEmpty min={0} max={600} step={f.step ?? 1} onChange={(v) => setBm({ ...bm, [f.key]: v })} /></label>
          ))}
          <label className="flex flex-col gap-1 text-sm sm:col-span-2"><span className="font-semibold text-slate-800">6-minute walk (distance, how it felt)</span>
            <input type="text" value={bm.walk6MinNotes} onChange={(e) => setBm({ ...bm, walk6MinNotes: e.target.value })} placeholder="e.g. 560 m, could talk comfortably" className="min-h-[44px] px-3 rounded-lg border border-slate-300 bg-white" /></label>
          <div className="flex items-end"><button type="button" onClick={saveBm} className="w-full min-h-[44px] rounded-lg text-sm font-semibold bg-amber-700 text-white">Save results</button></div>
        </div>

        {sortedBm.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600 text-center py-4">No results yet. Test now to set your baseline.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase text-slate-600">
                <th className="py-2 pr-2">Date</th>{BM_FIELDS.map((f) => <th key={f.key} className="py-2 pr-2">{f.label.replace(/ \(.*\)/, '')}</th>)}<th className="py-2 pr-2">6-min walk</th><th />
              </tr></thead>
              <tbody>
                {sortedBm.map((b, idx) => {
                  const prev = sortedBm[idx + 1];
                  return (
                    <tr key={b.id} className="border-t border-slate-100">
                      <td className="py-2 pr-2 font-semibold whitespace-nowrap">{shortDateLabel(b.date)}</td>
                      {BM_FIELDS.map((f) => {
                        const v = b[f.key];
                        const pv = prev?.[f.key];
                        const better = v !== null && pv !== null && pv !== undefined && (f.better === 'higher' ? v > pv : v < pv);
                        const worse = v !== null && pv !== null && pv !== undefined && (f.better === 'higher' ? v < pv : v > pv);
                        return <td key={f.key} className={`py-2 pr-2 tabular-nums ${better ? 'text-emerald-800 font-bold' : worse ? 'text-rose-800 font-bold' : ''}`}>{v ?? '–'}{better ? ' ▲' : worse ? ' ▼' : ''}</td>;
                      })}
                      <td className="py-2 pr-2">{b.walk6MinNotes || '–'}</td>
                      <td><button type="button" aria-label={`Delete results from ${b.date}`} className="p-2.5 text-slate-500 hover:text-rose-700"
                        onClick={() => confirm({ title: 'Delete these results?', message: `Test results from ${shortDateLabel(b.date)} will be removed.`, confirmLabel: 'Delete', danger: true,
                          onConfirm: () => updateProfile((p) => ({ benchmarks: p.benchmarks.filter((x) => x.id !== b.id) })) })}><Trash2 className="w-4 h-4" /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
