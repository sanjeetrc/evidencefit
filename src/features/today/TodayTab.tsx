import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, CloudSun, Dumbbell, Flame, Mic, MicOff, Moon, Plus, RefreshCw, Sparkles, X } from 'lucide-react';
import { isAiReady, parseQuickWithAI } from '../../ai';
import RestTimer from '../../components/RestTimer';
import { Card, CardHeader } from '../../components/ui';
import { analyseCircuit, isTreadmill, QUICK_PRESETS } from '../../domain/exercise';
import { entryForExercise, entrySummary, exercisesFromHistory } from '../../domain/exerciseLibrary';
import { buildTomorrowSuggestion } from '../../domain/suggestion';
import { dayLabel, formatDateISO } from '../../lib/dates';
import { uid } from '../../lib/ids';
import { DRAFT_KEY, loadDraft } from '../../lib/storage';
import type { AiCoachSettings, CircuitEntry, Climate, Location, LoggedWorkout, Profile, QuickPreset, ShowToast, UpdateProfile } from '../../types';
import { applyVoiceGlossary } from '../../voice/glossary';
import { formatRir, guidedProgress, guidedPrompt, guidedQuickAnswers } from '../../voice/guided';
import { parseQuickText } from '../../voice/parseQuick';
import { useGuidedVoice } from '../../voice/useGuidedVoice';
import { useQuickMic } from '../../voice/useQuickMic';
import EntryCard from './EntryCard';
import ExercisePicker from './ExercisePicker';
import ProteinCard from './ProteinCard';
import LogDatePicker from './LogDatePicker';
import WalkCard from './WalkCard';
import DriveSyncChip from '../drive/DriveSyncChip';
import { useDrive } from '../../sync/useDriveSync';

interface Props {
  profile: Profile;
  aiCoach: AiCoachSettings;
  updateProfile: UpdateProfile;
  showToast: ShowToast;
}

export default function TodayTab({ profile, aiCoach, updateProfile, showToast }: Props) {
  const today = formatDateISO();
  // Day being logged: null follows today's date (so an app left open overnight moves on); a past date fills in a missed day.
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const logDate = pickedDate && pickedDate < today ? pickedDate : today;
  const loggingToday = logDate === today;
  const aiReady = isAiReady(aiCoach);

  // ----- Draft circuit (persisted separately under DRAFT_KEY) -----
  const [entries, setEntries] = useState<CircuitEntry[]>(loadDraft);
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(entries)); } catch { /* ignore */ }
  }, [entries]);

  // ----- Quick-Log text: state for rendering + ref for async/voice code (never stale) -----
  const [quickText, setQuickText] = useState('');
  const quickTextRef = useRef('');
  const [lastParsed, setLastParsed] = useState<string | null>(null);
  const [lastBatchIds, setLastBatchIds] = useState<string[]>([]);
  /** Non-null only while the user is explicitly re-editing the last batch. */
  const [editing, setEditing] = useState<{ ids: string[] } | null>(null);
  const [parsing, setParsing] = useState(false);
  const parsingRef = useRef(false);

  const setQuick = (v: string) => {
    quickTextRef.current = v;
    setQuickText(v);
    if (!v.trim()) setEditing(null); // clearing the box cancels a Re-edit
  };

  // The user's own exercises from saved circuits (most recent first).
  const drive = useDrive();
  const history = useMemo(() => exercisesFromHistory(profile.circuitLogs), [profile.circuitLogs]);

  const mic = useQuickMic({ getText: () => quickTextRef.current, setText: setQuick, showToast });
  // Weight unit for anything new (lb unless changed in Settings).
  const loadUnitDefault = profile.defaultLoadUnit ?? 'lb';
  const guided = useGuidedVoice({
    glossary: profile.voiceGlossary,
    ownExercises: history.map((h) => h.name),
    defaultUnit: loadUnitDefault,
    showToast,
    onComplete: (entry) => {
      setEntries((prev) => [...prev, entry]);
      const details = isTreadmill(entry.name)
        ? [
          `${entry.reps} min`,
          entry.speedKmh ? `${entry.speedKmh} km/h` : 'speed not set',
          entry.inclinePct != null ? `${entry.inclinePct}% incline` : '',
        ].filter(Boolean).join(', ')
        : [
          `${entry.sets}×${entry.reps} ${entry.unit}`,
          entry.load ? `${entry.load} ${entry.loadUnit}` : 'bodyweight',
          formatRir(entry.rir),
        ].filter(Boolean).join(', ');
      showToast(`Guided added: ${entry.name} (${details}) — edit below if anything is off.`);
    },
  });
  // Current guided step's wording, chips and "Step n of N" (treadmill has its own route).
  const gPrompt = guided.step !== null ? guidedPrompt(guided.step, guided.draft) : null;
  const gProgress = guided.step !== null ? guidedProgress(guided.step, guided.draft) : null;
  const gChips = guided.step !== null ? guidedQuickAnswers(guided.step, guided.draft) : [];

  // ----- Session details -----
  const [workoutLocation, setWorkoutLocation] = useState<Location>('Gym');
  const [sleepHours, setSleepHours] = useState<number | null>(null);
  const [climate, setClimate] = useState<Climate>('Normal');
  const [notes, setNotes] = useState('');
  const [presetTab, setPresetTab] = useState<'Gym' | 'Home' | 'Recent' | 'All'>('Gym');
  const [guidedTyped, setGuidedTyped] = useState('');

  const liveBreakdown = analyseCircuit(entries, profile.weightKg);
  const tomorrow = buildTomorrowSuggestion(profile.circuitLogs, today);

  const toggleMic = async () => {
    if (guided.active) await guided.stop(); // let the guided recognizer fully release the mic first
    mic.toggle();
  };

  const toggleGuided = async () => {
    if (guided.active) { guided.stop(); return; }
    if (mic.listening) await mic.flush(); // keep what was already dictated
    guided.start();
  };

  const handleQuickParse = async () => {
    if (parsingRef.current) return; // ref guard: no double-submit across the async gap
    parsingRef.current = true;
    setParsing(true);
    try {
      await mic.flush(); // wait for the final transcript instead of racing it
      const raw = quickTextRef.current.trim();
      if (!raw) return;
      const cleanedRaw = applyVoiceGlossary(raw, profile.voiceGlossary);
      const replacing = editing;

      const applyEntries = (next: CircuitEntry[], msg: string) => {
        const removeSet = new Set(replacing?.ids ?? []);
        setEntries((prev) => [...prev.filter((e) => !removeSet.has(e.id)), ...next]);
        setLastBatchIds(next.map((e) => e.id));
        setLastParsed(raw);
        setEditing(null);
        setQuick('');
        showToast(msg);
      };
      const verb = replacing ? 'updated' : 'added';

      if (aiReady) {
        const ai = await parseQuickWithAI(cleanedRaw, aiCoach, loadUnitDefault);
        if (ai.entries !== null && ai.entries.length > 0) {
          applyEntries(ai.entries, `AI ${verb} ${ai.entries.length} exercise(s).${ai.note ? ` (${ai.note})` : ''}`);
          return;
        }
        const offline = parseQuickText(cleanedRaw, loadUnitDefault);
        if (ai.entries !== null) {
          // AI answered but found nothing: offer the offline result rather than silently dropping input.
          if (!offline.length) { showToast('No workout exercises found — nothing added.'); return; }
          applyEntries(offline, `AI found nothing; offline parser ${verb} ${offline.length} exercise(s) — please check them.`);
          return;
        }
        if (offline.length) applyEntries(offline, `AI failed (${ai.error ?? 'unknown'}) — offline parser ${verb} ${offline.length} exercise(s).`);
        else showToast(`AI failed (${ai.error ?? 'unknown'}) and nothing could be parsed offline.`);
        return;
      }

      const parsed = parseQuickText(cleanedRaw, loadUnitDefault);
      if (parsed.length) applyEntries(parsed, `${replacing ? 'Updated' : 'Added'} ${parsed.length} exercise(s).`);
      else showToast('Could not find an exercise in that text.');
    } finally {
      parsingRef.current = false;
      setParsing(false);
    }
  };

  const reEdit = () => {
    if (lastParsed === null) return;
    const alive = lastBatchIds.filter((id) => entries.some((e) => e.id === id));
    setQuick(lastParsed);
    setEditing(alive.length ? { ids: alive } : null);
  };

  /** Add any exercise: last time's numbers if done before, otherwise library defaults. */
  const addExercise = (name: string) => {
    const entry = entryForExercise(name, history, loadUnitDefault);
    setEntries((prev) => [...prev, entry]);
    showToast(`Added ${entry.name} (${entrySummary(entry)}) — adjust below.`);
  };

  const addPreset = (p: QuickPreset) => {
    setEntries((prev) => [...prev, {
      id: uid(), name: p.name, sets: p.sets, load: p.defaultLoad ?? null,
      loadUnit: loadUnitDefault, reps: p.reps, unit: p.unit, rir: p.unit === 'reps' && p.section !== 'Mobility' ? 2 : null, pain: 0,
    }]);
  };

  const patchEntry = (id: string, patch: Partial<CircuitEntry>) =>
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const saveCircuit = () => {
    const valid = entries.filter((e) => e.sets > 0 && e.reps > 0 && e.name.trim());
    if (!valid.length) { showToast('Add at least one exercise before saving.'); return; }
    const analysis = analyseCircuit(valid, profile.weightKg);
    const workout: LoggedWorkout = {
      id: uid(), date: logDate, location: workoutLocation, sleepHours, climate, notes: notes.trim(),
      entries: valid, estKcal: analysis.estKcal, muscles: analysis.muscles, benefits: analysis.benefits,
    };
    // Keep circuits in date order (a filled-in earlier day goes before later ones; same-day order is kept).
    updateProfile((p) => ({ circuitLogs: [...p.circuitLogs, workout].sort((a, b) => a.date.localeCompare(b.date)) }));
    setEntries([]);
    setNotes('');
    // The last batch now lives in a saved circuit; Re-edit must not target it any more.
    setLastParsed(null);
    setLastBatchIds([]);
    setEditing(null);
    showToast(loggingToday
      ? `Circuit saved (~${analysis.estKcal} kcal). Tomorrow's suggestion updated!`
      : `Circuit saved for ${dayLabel(logDate)} (~${analysis.estKcal} kcal).`);
    drive.requestAutoSync(); // background; never delays the save
  };

  return (
    <>
      {/* Which day the circuit and protein below are saved to (fill in a missed day). */}
      <LogDatePicker value={logDate} today={today} onChange={setPickedDate} />

      {/* Tomorrow / Next Session Smart Suggestion */}
      <Card className="bg-emerald-50/70 border-emerald-200">
        <CardHeader icon={<Sparkles className="w-5 h-5" />} title={`Next Suggested Focus: ${tomorrow.headline}`} subtitle={tomorrow.rationale} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-sm">
          <div className="bg-white rounded-xl p-3 border border-emerald-200">
            <p className="text-xs font-bold uppercase text-emerald-800">Gym Option</p>
            <p className="mt-1 text-slate-800">{tomorrow.gymSuggestion}</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-emerald-200">
            <p className="text-xs font-bold uppercase text-teal-800">Home Option</p>
            <p className="mt-1 text-slate-800">{tomorrow.homeSuggestion}</p>
          </div>
        </div>
        {tomorrow.restingMuscles.length > 0 && (
          <p className="mt-2.5 text-xs text-emerald-950">
            <strong>Resting (worked in last 48h):</strong> {tomorrow.restingMuscles.join(', ')}
          </p>
        )}
      </Card>

      {/* Log Your Circuit */}
      <Card>
        <CardHeader icon={<Dumbbell className="w-5 h-5" />} title="Log Today's Circuit" subtitle="Dictate or type your whole circuit, or tap Quick-Add below." />

        {/* Free-text / Voice Quick-Log */}
        <div className="mb-4 p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="quick-log" className="block text-sm font-bold uppercase tracking-wide text-slate-700">Quick-Log (type or dictate)</label>
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-bold ${aiReady ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-200 text-slate-800'}`}>
              <Sparkles className="w-4 h-4" /> {aiReady ? `AI Parser On (${aiCoach.provider === 'groq' ? 'Groq' : 'Gemini'})` : 'Offline Parser'}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <textarea
              id="quick-log"
              rows={2}
              value={quickText}
              readOnly={mic.listening}
              onChange={(e) => setQuick(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleQuickParse();
                }
              }}
              placeholder="e.g. Did 25 min incline walk, leg press 100 lb 10 reps 22 fail 5 sets, and 60 push-ups"
              className={`flex-1 min-w-0 p-2.5 rounded-xl border border-slate-300 text-sm resize-none ${mic.listening ? 'bg-rose-50' : 'bg-white'}`}
            />
            <button type="button" onClick={() => void toggleMic()} title="Dictate workout"
              className={`shrink-0 inline-flex items-center justify-center gap-1.5 px-3 min-h-[44px] rounded-xl border text-sm font-semibold ${mic.listening ? 'bg-rose-600 border-rose-600 text-white animate-pulse' : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'}`}>
              {mic.listening ? <><MicOff className="w-4 h-4" /> Stop</> : <><Mic className="w-4 h-4 text-emerald-700" /> Mic</>}
            </button>
            <button type="button" onClick={() => void toggleGuided()} title="5-step guided voice log"
              className={`shrink-0 inline-flex items-center justify-center gap-1.5 px-3 min-h-[44px] rounded-xl text-sm font-semibold border transition-colors ${guided.active ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'}`}>
              {gProgress ? `Step ${gProgress.n}/${gProgress.total}` : 'Guided'}
            </button>
            <button type="button" onClick={() => void handleQuickParse()} disabled={parsing || !quickText.trim()}
              className="shrink-0 inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
              {parsing ? <><RefreshCw className="w-4 h-4 animate-spin" /> Parsing…</> : editing ? 'Update' : 'Add'}
            </button>
          </div>

          {editing && (
            <p className="text-base text-amber-950 bg-amber-50 border-2 border-amber-300 rounded-lg px-3 py-2">
              Editing last input — <strong>Update</strong> will replace {editing.ids.length} exercise(s).{' '}
              <button type="button" className="font-bold underline" onClick={() => setEditing(null)}>Add as new instead</button>
            </p>
          )}

          {guided.step !== null && gPrompt && gProgress && (
            <div className="p-3 rounded-xl bg-amber-50 border-2 border-amber-400 text-base text-amber-950 space-y-3">
              {/* Step title */}
              <p className="text-lg font-extrabold">
                Step {gProgress.n} of {gProgress.total}: {gPrompt.label}
              </p>

              {/* Big, full-width mic status bar */}
              <div role="status" aria-live="polite"
                className={`w-full rounded-lg px-3 py-2.5 text-center text-lg font-extrabold ${guided.listening ? 'bg-emerald-600 text-white animate-pulse' : guided.starting ? 'bg-slate-200 text-slate-800' : 'bg-amber-200 text-amber-950'}`}>
                {guided.listening ? '🎤 Listening — speak now' : guided.starting ? 'Starting mic… please wait' : '⏸ Paused — tap a button, type, or Retry'}
              </div>

              {/* What to say */}
              <p className="text-base font-semibold leading-snug">{gPrompt.hint}</p>

              {/* What has been captured so far */}
              {guided.draft.name && (
                <p className="text-base font-bold text-slate-900 bg-white/70 rounded-lg px-3 py-2 border border-amber-200">
                  So far: {guided.draft.name}
                  {guided.draft.load ? ` · ${guided.draft.load} ${guided.draft.loadUnit ?? loadUnitDefault}` : ''}
                  {guided.draft.speedKmh ? ` · ${guided.draft.speedKmh} km/h` : ''}
                  {guided.draft.inclinePct != null ? ` · ${guided.draft.inclinePct}% incline` : ''}
                  {guided.draft.sets ? ` · ${guided.draft.sets} sets` : ''}
                  {guided.draft.reps ? ` · ${guided.draft.reps} ${guided.draft.unit ?? 'reps'}` : ''}
                </p>
              )}
              {guided.heard && <p className="text-base text-slate-700">Heard: <strong>“{guided.heard}”</strong></p>}

              {guided.step === 0 && (
                <ExercisePicker history={history} tone="amber" query={guidedTyped}
                  onPick={(name) => { setGuidedTyped(''); guided.pickExercise(name); }} />
              )}
              {gChips.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {gChips.map(([label, answer]) => (
                    <button key={label} type="button" onClick={() => guided.answer(answer)}
                      className="min-w-[52px] min-h-[48px] px-3 rounded-lg bg-white border-2 border-amber-300 text-amber-950 text-lg font-bold hover:bg-amber-100">
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); guided.answer(guidedTyped); setGuidedTyped(''); }}>
                <input value={guidedTyped} onChange={(e) => setGuidedTyped(e.target.value)} aria-label={`Type answer for ${gPrompt.label}`}
                  placeholder={`or type ${gPrompt.label.toLowerCase()}…`} enterKeyHint="next"
                  className="flex-1 min-w-0 min-h-[48px] px-3 rounded-lg border-2 border-amber-300 bg-white text-base text-slate-900" />
                <button type="submit" disabled={!guidedTyped.trim()} className="px-4 min-h-[48px] rounded-lg bg-amber-600 text-white text-base font-bold disabled:opacity-40">OK</button>
              </form>

              {/* Controls: real buttons, not small links */}
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={guided.retry} className="min-h-[48px] rounded-lg bg-white border-2 border-amber-400 text-amber-950 text-base font-bold">Retry</button>
                <button type="button" onClick={guided.skip} className="min-h-[48px] rounded-lg bg-white border-2 border-slate-300 text-slate-800 text-base font-bold">Skip</button>
                <button type="button" onClick={() => void guided.stop()} className="min-h-[48px] rounded-lg bg-white border-2 border-rose-300 text-rose-800 text-base font-bold">Cancel</button>
              </div>

              {guided.debugLog.length > 0 && (
                <pre className="p-2 rounded bg-slate-900 text-emerald-200 text-sm leading-snug whitespace-pre-wrap">{guided.debugLog.join('\n')}</pre>
              )}
            </div>
          )}

          {lastParsed && (
            <div className="flex items-start justify-between gap-2 pt-2 border-t border-slate-200 text-base text-slate-700">
              <p className="flex-1"><strong className="text-slate-900">Last input:</strong> “{lastParsed}”</p>
              <button type="button" onClick={reEdit} className="min-h-[40px] px-2 font-bold text-emerald-800 hover:underline shrink-0">Re-edit</button>
              <button type="button" onClick={() => { setLastParsed(null); setEditing(null); }} aria-label="Dismiss" className="min-h-[40px] px-2 text-slate-500 hover:text-slate-800 shrink-0"><X className="w-5 h-5" /></button>
            </div>
          )}
        </div>

        {/* One-tap Quick-Add */}
        <div className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <span className="text-sm font-bold uppercase tracking-wide text-slate-700">One-tap Quick-Add</span>
            <div className="flex flex-wrap rounded-lg bg-slate-200 p-0.5 text-sm font-bold">
              {(['Gym', 'Home', 'Recent', 'All'] as const).map((g) => (
                <button key={g} type="button" aria-pressed={presetTab === g}
                  onClick={() => { setPresetTab(g); if (g === 'Gym' || g === 'Home') setWorkoutLocation(g); }}
                  className={`px-3 min-h-[36px] rounded-md ${presetTab === g ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-700'}`}>
                  {g === 'All' ? 'All exercises' : g}
                </button>
              ))}
            </div>
          </div>

          {(presetTab === 'Gym' || presetTab === 'Home') && (
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PRESETS.filter((p) => p.group === presetTab && !p.section).map((p) => (
                <button key={p.name} type="button" onClick={() => addPreset(p)}
                  className="inline-flex items-center gap-1 px-3 min-h-[44px] rounded-full text-base font-semibold bg-slate-100 hover:bg-emerald-100 text-slate-800 border border-slate-200">
                  <Plus className="w-4 h-4 text-emerald-700" /> {p.name}
                </button>
              ))}
            </div>
          )}
          {presetTab === 'Home' && (
            <div className="mt-3 space-y-1.5">
              <p className="text-sm font-bold uppercase tracking-wide text-teal-800">Mobility, stretches &amp; holds</p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_PRESETS.filter((p) => p.group === 'Home' && p.section === 'Mobility').map((p) => (
                  <button key={p.name} type="button" onClick={() => addPreset(p)}
                    className="inline-flex items-center gap-1 px-3 min-h-[44px] rounded-full text-base font-semibold bg-teal-50 hover:bg-teal-100 text-teal-950 border border-teal-200">
                    <Plus className="w-4 h-4 text-teal-700" /> {p.name}
                    <span className="text-sm font-normal text-teal-800">{p.unit === 'sec' ? `${p.sets}×${p.reps}s` : `${p.sets}×${p.reps}`}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {presetTab === 'Recent' && (
            history.length === 0 ? (
              <p className="text-base text-slate-600">Exercises from your saved circuits will appear here, ready to repeat with last time's numbers.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {history.slice(0, 16).map((h) => (
                  <button key={h.name} type="button" onClick={() => addExercise(h.name)}
                    className="min-h-[44px] px-3 rounded-lg text-left bg-slate-100 hover:bg-emerald-100 border border-slate-200 text-slate-900">
                    <span className="flex items-center gap-1 text-base font-semibold leading-tight"><Plus className="w-4 h-4 text-emerald-700" /> {h.name}</span>
                    <span className="block text-sm text-slate-600 leading-tight">last: {entrySummary(h.last)}</span>
                  </button>
                ))}
              </div>
            )
          )}

          {presetTab === 'All' && (
            <ExercisePicker history={history} showLastValues onPick={addExercise} />
          )}
        </div>

        {/* Logged Circuit Entries */}
        {entries.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-300">
            No exercises added yet. Dictate above or tap any Quick-Add chip.
          </p>
        ) : (
          <div className="space-y-3">
            {entries.map((e) => (
              <EntryCard key={e.id} entry={e} weightKg={profile.weightKg}
                onPatch={(patch) => patchEntry(e.id, patch)}
                onRemove={() => setEntries((prev) => prev.filter((x) => x.id !== e.id))} />
            ))}
          </div>
        )}

        {/* Live Session Breakdown */}
        {entries.length > 0 && (
          <div className="mt-4 p-4 rounded-2xl bg-slate-900 text-white space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">Live Circuit Breakdown</span>
              <span className="inline-flex items-center gap-1 text-sm font-extrabold text-orange-300">
                <Flame className="w-4 h-4" /> ~{liveBreakdown.estKcal} kcal
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {liveBreakdown.muscles.map((m) => (
                <span key={m} className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-800 text-emerald-100">{m}</span>
              ))}
            </div>
            <ul className="text-xs text-slate-200 space-y-1 list-disc list-inside">
              {liveBreakdown.benefits.map((b) => <li key={b}>{b}</li>)}
            </ul>
          </div>
        )}

        {/* Readiness & Save */}
        <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
            <label className="flex items-center justify-between gap-2 bg-slate-50 rounded-xl px-3 py-1.5 border border-slate-200">
              <span className="flex items-center gap-1.5 font-semibold"><Moon className="w-4 h-4 text-indigo-600" /> Sleep (h)</span>
              <input type="number" step={0.5} min={0} max={16} value={sleepHours ?? ''} onChange={(e) => setSleepHours(e.target.value === '' ? null : Number(e.target.value))}
                className="w-14 min-h-[36px] px-2 rounded-lg border border-slate-300 bg-white font-semibold" />
            </label>
            <select value={workoutLocation} onChange={(e) => setWorkoutLocation(e.target.value as Location)} aria-label="Location" className="min-h-[42px] px-3 rounded-xl border border-slate-300 bg-white font-semibold">
              <option value="Gym">Gym</option><option value="Home">Home</option><option value="Outdoor">Outdoor</option>
            </select>
            <button type="button" onClick={() => setClimate(climate === 'Normal' ? 'Hot/Humid' : 'Normal')}
              className={`min-h-[42px] px-3 rounded-xl border font-semibold flex items-center justify-center gap-1.5 ${climate === 'Hot/Humid' ? 'bg-amber-100 border-amber-400 text-amber-950' : 'bg-slate-50 border-slate-200'}`}>
              <CloudSun className="w-4 h-4" /> {climate}
            </button>
          </div>
          <input type="text" placeholder="Optional notes (energy, joint feel…)" value={notes} onChange={(e) => setNotes(e.target.value)}
            className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 bg-white text-sm" />
          <button type="button" onClick={saveCircuit} className="w-full flex items-center justify-center gap-2 min-h-[50px] rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-base font-bold">
            <CheckCircle2 className="w-5 h-5" /> {loggingToday ? 'Save Circuit' : `Save Circuit for ${dayLabel(logDate)}`}
          </button>
          <DriveSyncChip />
        </div>
      </Card>

      <RestTimer />

      {/* Evening road walk and other cardio outside the circuit */}
      <WalkCard profile={profile} date={logDate} updateProfile={updateProfile} showToast={showToast} />

      <ProteinCard profile={profile} updateProfile={updateProfile} showToast={showToast} date={logDate} />
    </>
  );
}
