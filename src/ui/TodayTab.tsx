import { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, Bot, CheckCircle2, CloudSun, Dumbbell, Flame, HeartPulse, Info, Moon, Plus, Trash2, TrendingUp, Utensils, X,
} from 'lucide-react';
import { Audit, exerciseWarnings, mealSlotsFor } from '../domain/engine';
import { formatDateISO, getDayKeyFromDate, shortDateLabel } from '../domain/dates';
import { PROTEIN_QUICK_CHIPS } from '../domain/reference';
import { inferRiskTags } from '../domain/program';
import { isDuplicateWorkout, uid } from '../domain/state';
import { Climate, DAYS_OF_WEEK, DayKey, Location, LoggedExercise, Profile, RiskTag, Unit, Workout } from '../domain/types';
import { Card, CardHeader, NumInput } from './common';
import { Timer } from './Timer';

export interface DraftSet { loadKg: number | null; reps: number | null; rpe: number | null; pain: number | null }
export interface DraftExercise {
  exerciseId: string; name: string; repMin: number; repMax: number; unit: Unit; targetRpe: number;
  incrementKg?: number; notes?: string; tags?: RiskTag[]; sets: DraftSet[];
}
export interface Draft {
  date: string; templateKey: DayKey | 'Custom'; title: string; location: Location; notes: string;
  sleepHours: number | null; restingHr: number | null; climate: Climate; exercises: DraftExercise[];
}

const emptySet = (loadKg: number | null): DraftSet => ({ loadKg, reps: null, rpe: null, pain: null });

export function buildDraft(profile: Profile, audit: Audit, key: DayKey | 'Custom', date = formatDateISO()): Draft {
  const lastLoads = new Map<string, number>();
  audit.sortedWorkouts.forEach((w) =>
    w.exercises.forEach((e) => {
      const done = e.sets.filter((s) => s.reps > 0);
      if (done.length) lastLoads.set(e.name.toLowerCase(), done[done.length - 1].loadKg);
    })
  );
  const ready = new Map(audit.progressionReady.map((p) => [p.name.toLowerCase(), p.nextLoad]));
  const base = { date, notes: '', sleepHours: null, restingHr: null, climate: 'Normal' as Climate };
  if (key === 'Custom') return { ...base, templateKey: key, title: 'Custom session', location: 'Home', exercises: [] };
  const plan = profile.program[key];
  return {
    ...base,
    templateKey: key,
    title: plan.title,
    location: plan.location,
    exercises: plan.exercises.map((e) => {
      const n = e.name.toLowerCase();
      const load = ready.get(n) ?? lastLoads.get(n) ?? null;
      return {
        exerciseId: e.id, name: e.name, repMin: e.repMin, repMax: e.repMax, unit: e.unit, targetRpe: e.targetRpe,
        incrementKg: e.incrementKg, notes: e.notes, tags: e.tags,
        sets: Array.from({ length: Math.max(1, e.sets) }, () => emptySet(load)),
      };
    }),
  };
}

interface Props {
  profile: Profile;
  audit: Audit;
  draft: Draft | undefined;
  setDraft: (d: Draft) => void;
  updateProfile: (fn: (p: Profile) => Partial<Profile>) => void;
  onAskSwap: (exercise: string, pain: number) => void;
  showToast: (msg: string, tone?: 'emerald' | 'amber') => void;
  confirm: (opts: { title: string; message: string; confirmLabel: string; onConfirm: () => void }) => void;
  backupDue: boolean;
  goToSettings: () => void;
}

export function TodayTab({ profile, audit, draft: draftIn, setDraft, updateProfile, onAskSwap, showToast, confirm, backupDue, goToSettings }: Props) {
  const today = formatDateISO();
  const todayKey = getDayKeyFromDate(today);
  // A draft from an earlier day is stale: start a fresh one for today.
  const draft = useMemo(
    () => (draftIn && draftIn.date === today ? draftIn : buildDraft(profile, audit, todayKey, today)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draftIn, today, profile.id]
  );
  useEffect(() => {
    if (draft !== draftIn) setDraft(draft);
  }, [draft, draftIn, setDraft]);

  const patch = (p: Partial<Draft>) => setDraft({ ...draft, ...p });
  const patchEx = (i: number, fn: (e: DraftExercise) => DraftExercise) =>
    patch({ exercises: draft.exercises.map((e, j) => (j === i ? fn(e) : e)) });

  // ---- Protein ----
  const slots = mealSlotsFor(profile.mealPattern);
  const [slot, setSlot] = useState(slots[0]);
  useEffect(() => { if (!slots.includes(slot)) setSlot(slots[0]); }, [slots, slot]);
  const [foodName, setFoodName] = useState('');
  const [foodGrams, setFoodGrams] = useState<number | null>(null);
  const items = profile.proteinLogs[today] ?? [];
  const total = items.reduce((s, i) => s + i.grams, 0);
  const renal = audit.protein.isRenalRestricted;
  const target = profile.proteinTargetG;
  const pct = target > 0 ? Math.min(100, Math.round((total / target) * 100)) : 0;
  const perMeal = audit.protein.perMealMinG ?? Math.round(target / slots.length);

  const addFood = (name: string, grams: number | null) => {
    if (!name.trim() || !grams || grams <= 0 || grams > 300) {
      showToast('Enter a food name and grams of protein (1–300).', 'amber');
      return;
    }
    const item = { id: uid(), mealSlot: slot, name: name.trim().slice(0, 120), grams };
    updateProfile((p) => ({ proteinLogs: { ...p.proteinLogs, [today]: [...(p.proteinLogs[today] ?? []), item] } }));
    showToast(`Added ${grams} g protein to ${slot}`);
  };
  const removeFood = (id: string) =>
    updateProfile((p) => ({ proteinLogs: { ...p.proteinLogs, [today]: (p.proteinLogs[today] ?? []).filter((i) => i.id !== id) } }));

  // ---- Logger ----
  const [newEx, setNewEx] = useState('');
  const cap = audit.screening.rpeCap;
  const ready = new Map(audit.progressionReady.map((p) => [p.name.toLowerCase(), p]));

  const save = () => {
    const exercises: LoggedExercise[] = draft.exercises
      .map((e) => ({
        exerciseId: e.exerciseId, name: e.name, repMin: e.repMin, repMax: e.repMax, unit: e.unit, targetRpe: e.targetRpe,
        incrementKg: e.incrementKg, tags: e.tags,
        sets: e.sets
          .filter((s) => (s.reps ?? 0) > 0)
          .map((s) => ({ loadKg: s.loadKg ?? 0, reps: s.reps ?? 0, rpe: s.rpe, pain: s.pain ?? 0 })),
      }))
      .filter((e) => e.sets.length > 0);
    if (!exercises.length) {
      showToast('Enter reps (or minutes / seconds) for at least one set before saving.', 'amber');
      return;
    }
    const workout: Workout = {
      id: uid(), date: today, dayKey: draft.templateKey === 'Custom' ? todayKey : draft.templateKey, title: draft.title.trim() || 'Session',
      location: draft.location, sleepHours: draft.sleepHours, restingHr: audit.hrRestricted ? null : draft.restingHr,
      climate: draft.climate, notes: draft.notes.trim(), exercises,
    };
    if (isDuplicateWorkout(profile.workouts, workout)) {
      showToast('This exact session is already saved for today.', 'amber');
      return;
    }
    updateProfile((p) => ({ workouts: [...p.workouts, workout] }));
    const skipped = draft.exercises.length - exercises.length;
    setDraft(buildDraft({ ...profile, workouts: [...profile.workouts, workout] }, audit, draft.templateKey, today));
    showToast(`Session saved: ${exercises.length} exercise(s)${skipped ? `, ${skipped} left blank and skipped` : ''}.`);
  };

  return (
    <div className="space-y-5">
      {backupDue && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-sky-50 border border-sky-200 px-4 py-3 text-sm text-sky-950">
          <span>Your logs live only on this phone. Download a backup so a lost phone or cleared browser data cannot erase them.</span>
          <button type="button" onClick={goToSettings} className="px-3 min-h-[40px] rounded-lg bg-sky-800 text-white text-sm font-semibold">Back up now</button>
        </div>
      )}

      <Card>
        <CardHeader icon={<Activity className="w-5 h-5" />} title="Today's readiness" subtitle={shortDateLabel(today)} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="flex items-center justify-between gap-2 bg-slate-50 rounded-xl px-3 py-2 border border-slate-200">
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Moon className="w-4 h-4 text-indigo-600" aria-hidden /> Sleep last night (h)</span>
            <div className="w-20"><NumInput label="Sleep hours" value={draft.sleepHours} allowEmpty min={0} max={16} step={0.5} onChange={(v) => patch({ sleepHours: v })} /></div>
          </label>
          {audit.hrRestricted ? (
            <div className="flex items-center justify-between gap-2 bg-amber-50 rounded-xl px-3 py-2 border border-amber-200 text-sm font-semibold text-amber-950">
              <span className="flex items-center gap-2"><HeartPulse className="w-4 h-4" aria-hidden /> Cardio gauge</span>
              <span>RPE and talk test only</span>
            </div>
          ) : (
            <label className="flex items-center justify-between gap-2 bg-slate-50 rounded-xl px-3 py-2 border border-slate-200">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><HeartPulse className="w-4 h-4 text-rose-600" aria-hidden /> Morning resting HR</span>
              <div className="w-20"><NumInput label="Resting heart rate" value={draft.restingHr} allowEmpty min={30} max={140} onChange={(v) => patch({ restingHr: v })} /></div>
            </label>
          )}
          <div className="flex items-center justify-between gap-2 bg-slate-50 rounded-xl px-3 py-2 border border-slate-200">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><CloudSun className="w-4 h-4 text-amber-600" aria-hidden /> Weather</span>
            <div className="flex rounded-lg bg-slate-200 p-0.5" role="group" aria-label="Weather">
              {(['Normal', 'Hot/Humid'] as Climate[]).map((m) => (
                <button key={m} type="button" aria-pressed={draft.climate === m} onClick={() => patch({ climate: m })}
                  className={`px-3 min-h-[36px] rounded-md text-sm font-semibold ${draft.climate === m ? (m === 'Hot/Humid' ? 'bg-amber-600 text-white' : 'bg-white text-slate-900') : 'text-slate-700'}`}>
                  {m === 'Hot/Humid' ? 'Over 30 °C' : 'Normal'}
                </button>
              ))}
            </div>
          </div>
        </div>
        {draft.climate === 'Hot/Humid' && (
          <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-sm text-amber-950">
            <Flame className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden />
            <div>
              <strong>Heat:</strong> pace cardio by effort and the talk test, not speed or heart rate. Train early or in air conditioning, add 15–30 s rest, drink before and during; electrolytes for sessions over 60 min.
              {profile.medications.diuretics && ' You take a diuretic: extra fluid and electrolytes.'} Stop for headache, confusion, nausea, chills or if you stop sweating.
            </div>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          icon={<Utensils className="w-5 h-5" />}
          title="Protein today"
          subtitle={renal ? 'Kidney disease: logging only. Follow the limit your doctor sets.' : `Target ${target} g/day; aim for at least ${perMeal} g at each meal`}
          right={<div className="text-right"><span className="text-2xl font-extrabold text-emerald-800 tabular-nums">{total} g</span>{!renal && <span className="text-sm font-semibold text-slate-600"> / {target} g</span>}</div>}
        />
        {!renal && (
          <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Protein progress">
            <div className={`h-full rounded-full ${pct >= 90 ? 'bg-emerald-600' : pct >= 50 ? 'bg-teal-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
          </div>
        )}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {slots.map((s) => {
            const g = items.filter((i) => i.mealSlot === s).reduce((a, i) => a + i.grams, 0);
            return (
              <button key={s} type="button" aria-pressed={slot === s} onClick={() => setSlot(s)}
                className={`flex items-center justify-between px-3 min-h-[44px] rounded-xl border text-left ${slot === s ? 'bg-emerald-50 border-emerald-600 ring-1 ring-emerald-600 text-emerald-950' : 'bg-slate-50 border-slate-200 text-slate-800'}`}>
                <span className="text-sm font-bold">{s}</span>
                <span className={`text-sm font-semibold tabular-nums ${!renal && g >= perMeal ? 'text-emerald-800' : ''}`}>{g} g{!renal && <span className="text-slate-500"> / {perMeal}</span>}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-600">Tap to add to {slot}</p>
        <div className="flex flex-wrap gap-2">
          {PROTEIN_QUICK_CHIPS.map((c) => (
            <button key={c.name} type="button" onClick={() => addFood(c.name, c.grams)}
              className="inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-full text-sm bg-slate-100 hover:bg-emerald-100 text-slate-800 border border-slate-200">
              <Plus className="w-3.5 h-3.5 text-emerald-700" aria-hidden /> {c.name} <span className="font-bold text-emerald-800">{c.grams} g</span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap sm:flex-nowrap gap-2">
          <input type="text" aria-label="Food name" placeholder="Other food (e.g. moong chilla)" value={foodName} onChange={(e) => setFoodName(e.target.value)}
            className="flex-1 min-w-[160px] min-h-[44px] text-sm px-3 rounded-xl border border-slate-300 bg-white" />
          <div className="w-28"><NumInput label="Protein grams" value={foodGrams} allowEmpty min={1} max={300} onChange={setFoodGrams} /></div>
          <button type="button" onClick={() => { addFood(foodName, foodGrams); setFoodName(''); setFoodGrams(null); }}
            className="px-4 min-h-[44px] rounded-xl text-sm font-semibold bg-slate-900 text-white">Add</button>
        </div>
        {items.length > 0 && (
          <ul className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
            {items.map((i) => (
              <li key={i.id} className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-lg text-sm bg-emerald-50 text-emerald-950 border border-emerald-200">
                <span className="text-xs font-bold uppercase text-emerald-800">{i.mealSlot}:</span> {i.name} <strong>{i.grams} g</strong>
                <button type="button" onClick={() => removeFood(i.id)} className="p-2 rounded hover:bg-emerald-200" aria-label={`Remove ${i.name}`}><X className="w-3.5 h-3.5" /></button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Timer />

      <Card>
        <CardHeader
          icon={<Dumbbell className="w-5 h-5" />}
          title="Log a session"
          subtitle="Fill in what you did. Sets left blank are not saved."
          right={
            <select aria-label="Session template" value={draft.templateKey}
              onChange={(e) => {
                const k = e.target.value as DayKey | 'Custom';
                const go = () => setDraft(buildDraft(profile, audit, k, today));
                const touched = draft.exercises.some((x) => x.sets.some((s) => s.reps !== null));
                if (touched) confirm({ title: 'Switch template?', message: 'Sets entered so far will be cleared.', confirmLabel: 'Switch', onConfirm: go });
                else go();
              }}
              className="text-sm font-semibold bg-slate-50 border border-slate-300 rounded-xl px-3 min-h-[44px] max-w-full">
              {DAYS_OF_WEEK.map((d) => <option key={d} value={d}>{d}{d === todayKey ? ' (today)' : ''}: {profile.program[d].title.slice(0, 32)}</option>)}
              <option value="Custom">Custom session</option>
            </select>
          }
        />

        {audit.activeCues.length > 0 && (
          <ul className="mb-4 space-y-1.5">
            {audit.activeCues.map((c, i) => (
              <li key={i} className={`flex items-start gap-1.5 text-sm px-2.5 py-1.5 rounded-lg border ${c.tone === 'emerald' ? 'bg-emerald-50 text-emerald-950 border-emerald-200' : 'bg-amber-50 text-amber-950 border-amber-200'}`}>
                <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden /> {c.text}
              </li>
            ))}
          </ul>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-4">
          <input type="text" aria-label="Session title" value={draft.title} onChange={(e) => patch({ title: e.target.value })}
            className="sm:col-span-2 text-sm font-semibold px-3 min-h-[44px] rounded-xl border border-slate-300 bg-white" />
          <select aria-label="Location" value={draft.location} onChange={(e) => patch({ location: e.target.value as Location })}
            className="text-sm font-semibold px-3 min-h-[44px] rounded-xl border border-slate-300 bg-white">
            {(['Gym', 'Home', 'Outdoor'] as Location[]).map((l) => <option key={l}>{l}</option>)}
          </select>
        </div>

        {draft.exercises.length === 0 ? (
          <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-300">
            <p className="text-sm font-semibold text-slate-800">Rest day, or a custom session</p>
            <p className="text-sm text-slate-600 mt-1">Pick another day above, or add an exercise below.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {draft.exercises.map((ex, i) => {
              const maxPain = Math.max(0, ...ex.sets.map((s) => s.pain ?? 0));
              const warnings = exerciseWarnings(ex, profile, audit.screening);
              const avoid = warnings.some((w) => w.severity === 'avoid');
              const targetRpe = cap !== null ? Math.min(cap, ex.targetRpe) : ex.targetRpe;
              const prog = ready.get(ex.name.toLowerCase());
              const unitLabel = ex.unit === 'sec' ? 'Seconds' : ex.unit === 'min' ? 'Minutes' : 'Reps';
              return (
                <article key={ex.exerciseId + i} aria-label={ex.name}
                  className={`rounded-2xl border p-3.5 ${maxPain > 5 || avoid ? 'border-rose-300 bg-rose-50/40' : maxPain > 3 ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-slate-50/60'}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">{ex.name}</h3>
                      <p className="mt-0.5 text-sm text-slate-700">
                        <span className="font-semibold text-teal-900 bg-teal-50 px-2 py-0.5 rounded-md">
                          {ex.repMin === ex.repMax ? ex.repMin : `${ex.repMin}–${ex.repMax}`} {ex.unit} · RPE {targetRpe}{cap !== null && cap < ex.targetRpe ? ' (capped)' : ''}
                        </span>
                        {ex.notes && <span> {ex.notes}</span>}
                      </p>
                    </div>
                    <button type="button" onClick={() => patch({ exercises: draft.exercises.filter((_, j) => j !== i) })}
                      className="p-2.5 rounded-lg text-slate-500 hover:text-rose-700 hover:bg-rose-50" aria-label={`Remove ${ex.name}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {warnings.map((w, k) => (
                    <p key={k} className={`mb-2 text-sm font-semibold px-2.5 py-1.5 rounded-lg ${w.severity === 'avoid' ? 'bg-rose-100 text-rose-900' : 'bg-amber-100 text-amber-950'}`}>
                      {w.severity === 'avoid' ? 'Avoid: ' : 'Caution: '}{w.text}
                    </p>
                  ))}
                  {prog && (
                    <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-100 text-emerald-950">
                      <TrendingUp className="w-4 h-4" aria-hidden /> Ready to progress: {prog.suggestion}
                    </p>
                  )}

                  <div className="grid grid-cols-[1.5rem_1fr_1fr_1fr_1fr_2.5rem] gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600 px-0.5">
                    <span>#</span><span>Kg</span><span>{unitLabel}</span><span>RPE</span><span>Pain</span><span />
                  </div>
                  {ex.sets.map((s, j) => {
                    const set = (f: keyof DraftSet, v: number | null) =>
                      patchEx(i, (e) => ({ ...e, sets: e.sets.map((x, k) => (k === j ? { ...x, [f]: v } : x)) }));
                    return (
                      <div key={j} className="grid grid-cols-[1.5rem_1fr_1fr_1fr_1fr_2.5rem] gap-1.5 items-center mt-1.5">
                        <span className="text-sm font-bold text-slate-600">{j + 1}</span>
                        <NumInput label={`${ex.name} set ${j + 1} load kg`} value={s.loadKg} allowEmpty min={0} max={500} step={0.5} onChange={(v) => set('loadKg', v)} />
                        <NumInput label={`${ex.name} set ${j + 1} ${unitLabel.toLowerCase()}`} value={s.reps} allowEmpty min={0} max={600} onChange={(v) => set('reps', v)} className="placeholder:text-slate-400" />
                        <NumInput label={`${ex.name} set ${j + 1} RPE 1 to 10`} value={s.rpe} allowEmpty min={1} max={10} step={0.5} onChange={(v) => set('rpe', v)} />
                        <NumInput label={`${ex.name} set ${j + 1} pain 0 to 10`} value={s.pain} allowEmpty min={0} max={10}
                          className={(s.pain ?? 0) > 5 ? 'border-rose-500 bg-rose-50 text-rose-800' : (s.pain ?? 0) > 3 ? 'border-amber-500 bg-amber-50' : ''}
                          onChange={(v) => set('pain', v)} />
                        {ex.sets.length > 1 ? (
                          <button type="button" onClick={() => patchEx(i, (e) => ({ ...e, sets: e.sets.filter((_, k) => k !== j) }))}
                            className="p-2.5 text-slate-500 hover:text-rose-700" aria-label={`Remove set ${j + 1}`}><X className="w-4 h-4" /></button>
                        ) : <span />}
                      </div>
                    );
                  })}
                  <div className="mt-2.5 flex flex-wrap gap-3">
                    <button type="button" onClick={() => patchEx(i, (e) => ({ ...e, sets: [...e.sets, emptySet(e.sets[e.sets.length - 1]?.loadKg ?? null)] }))}
                      className="inline-flex items-center gap-1 min-h-[40px] text-sm font-semibold text-emerald-800"><Plus className="w-4 h-4" aria-hidden /> Add set</button>
                    <button type="button"
                      onClick={() => patchEx(i, (e) => ({ ...e, sets: e.sets.map((x) => ({ ...x, reps: x.reps ?? e.repMax, rpe: x.rpe ?? targetRpe, pain: x.pain ?? 0 })) }))}
                      className="inline-flex items-center gap-1 min-h-[40px] text-sm font-semibold text-slate-700">Done as planned</button>
                  </div>

                  {maxPain > 3 && (
                    <div className={`mt-3 rounded-xl p-3.5 border ${maxPain > 5 ? 'bg-rose-50 border-rose-300 text-rose-950' : 'bg-amber-50 border-amber-300 text-amber-950'}`} role="alert">
                      <h4 className="flex items-center gap-2 text-sm font-bold"><AlertTriangle className="w-4 h-4" aria-hidden /> Pain {maxPain}/10: adjust before the next set</h4>
                      {maxPain > 5 && <p className="mt-1.5 text-sm font-semibold">Stop this movement today. If the pain is sharp, causes swelling, is there at night, or lasts more than 1–2 weeks, see a physiotherapist or doctor.</p>}
                      <ol className="mt-2 space-y-1 text-sm list-decimal list-inside">
                        <li>Change range, grip or stance</li><li>Slow the tempo or switch to an isometric hold</li><li>Reduce load or sets</li><li>Swap to a pain-free alternative</li>
                      </ol>
                      <button type="button" onClick={() => onAskSwap(ex.name, maxPain)} className="mt-3 inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-lg text-sm font-semibold bg-slate-900 text-white">
                        <Bot className="w-4 h-4" aria-hidden /> Ask the coach for a swap
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <input type="text" aria-label="New exercise name" placeholder="Add an exercise…" value={newEx} onChange={(e) => setNewEx(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && document.getElementById('add-ex-btn')?.click()}
            className="flex-1 min-w-0 min-h-[44px] text-sm px-3 rounded-xl border border-slate-300 bg-white" />
          <button id="add-ex-btn" type="button"
            onClick={() => {
              if (!newEx.trim()) return;
              patch({ exercises: [...draft.exercises, { exerciseId: uid(), name: newEx.trim(), repMin: 8, repMax: 12, unit: 'reps', targetRpe: 7, tags: inferRiskTags(newEx), sets: [emptySet(null)] }] });
              setNewEx('');
            }}
            className="shrink-0 px-4 min-h-[44px] rounded-xl text-sm font-semibold bg-slate-100 text-slate-900 border border-slate-300">+ Exercise</button>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
          <input type="text" aria-label="Session notes" placeholder="Notes (energy, talk-test pace, knee comfort…)" value={draft.notes} onChange={(e) => patch({ notes: e.target.value })}
            className="w-full min-h-[44px] text-sm px-3 rounded-xl border border-slate-300 bg-white" />
          <button type="button" onClick={save} className="w-full flex items-center justify-center gap-2 min-h-[52px] rounded-xl text-base font-bold bg-emerald-700 text-white hover:bg-emerald-800">
            <CheckCircle2 className="w-5 h-5" aria-hidden /> Save session
          </button>
        </div>
      </Card>
    </div>
  );
}
