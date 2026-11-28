import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, MicOff, Sparkles, X } from 'lucide-react';
import { ParsedEntry, circuitToWorkout, describeEntry, parseCircuitText } from '../domain/circuitParser';
import { shortDateLabel } from '../domain/dates';
import type { Location, Profile } from '../domain/types';

interface CircuitCardProps {
  profile: Profile;
  /** The day being logged (today or an earlier day). */
  date: string;
  defaultLocation: Location;
  updateProfile: (fn: (p: Profile) => Partial<Profile>) => void;
  showToast: (msg: string, tone?: 'emerald' | 'amber') => void;
}

interface SpeechResultLike { isFinal: boolean; 0: { transcript: string } }
interface SpeechRecognitionLike {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((ev: { resultIndex: number; results: ArrayLike<SpeechResultLike> }) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void;
}
type SpeechCtor = new () => SpeechRecognitionLike;
const speechCtor = (): SpeechCtor | null => {
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const EXAMPLE = 'Treadmill 20 minutes 4.8 km/h incline 1, leg press 40 kg 3 by 12 RIR 2, plank 3 x 30 seconds';

/** Type or say the whole circuit in plain words; it is read on this device and saved as one session. */
export function CircuitCard({ profile, date, defaultLocation, updateProfile, showToast }: CircuitCardProps) {
  const [text, setText] = useState('');
  const [entries, setEntries] = useState<ParsedEntry[] | null>(null);
  const [incomplete, setIncomplete] = useState<ParsedEntry[]>([]);
  const [location, setLocation] = useState<Location>(defaultLocation === 'Rest' ? 'Gym' : defaultLocation);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const canSpeak = useMemo(() => speechCtor() !== null, []);
  useEffect(() => () => recRef.current?.stop(), []);
  useEffect(() => { setLocation(defaultLocation === 'Rest' ? 'Gym' : defaultLocation); }, [defaultLocation]);

  const known = useMemo(() => {
    const names = new Set<string>();
    Object.values(profile.program).forEach((d) => d.exercises.forEach((e) => names.add(e.name)));
    profile.workouts.forEach((w) => w.exercises.forEach((e) => { if (!e.cardio) names.add(e.name); }));
    return [...names];
  }, [profile.program, profile.workouts]);

  const read = (t = text) => {
    const r = parseCircuitText(t, known);
    setEntries(r.entries);
    setIncomplete(r.incomplete);
    if (!r.entries.length && !r.incomplete.length) showToast('Nothing to read yet. Type or say what you did.', 'amber');
  };

  const toggleMic = () => {
    if (listening) { recRef.current?.stop(); return; }
    const Ctor = speechCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = 'en-IN'; rec.continuous = true; rec.interimResults = true;
    rec.onresult = (ev) => {
      let finalText = ''; let live = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalText += r[0].transcript; else live += r[0].transcript;
      }
      if (finalText) setText((t) => (t.trim() ? `${t.trim()}, ${finalText.trim()}` : finalText.trim()));
      setInterim(live);
    };
    rec.onerror = (ev) => {
      showToast(ev.error === 'not-allowed' || ev.error === 'service-not-allowed'
        ? 'The microphone is blocked. Allow it for this site in the browser settings, or type instead.'
        : 'The microphone stopped. Check the internet connection, or type instead.', 'amber');
    };
    rec.onend = () => { setListening(false); setInterim(''); };
    recRef.current = rec;
    try { rec.start(); setListening(true); } catch { setListening(false); }
  };

  const save = () => {
    if (!entries?.length) return;
    const w = circuitToWorkout(entries, { date, location, notes: text.trim() });
    updateProfile((p) => ({ workouts: [...p.workouts, w] }));
    showToast(`Circuit saved for ${shortDateLabel(date)}: ${entries.length} exercise(s).`);
    setText(''); setEntries(null); setIncomplete([]);
  };

  return (
    <details className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
      <summary className="flex items-center gap-2 cursor-pointer min-h-[40px] font-bold text-slate-900 text-lg">
        <Sparkles className="w-5 h-5 text-emerald-700" /> Type or say the whole circuit
      </summary>
      <p className="mt-2 text-sm text-slate-700">Say or type everything in one go, then press <b>Read it</b> and check the list before saving. Separate exercises with a comma or the word "then".</p>
      <textarea aria-label="Circuit in your words" value={text} onChange={(e) => { setText(e.target.value); setEntries(null); }}
        rows={4} placeholder={EXAMPLE}
        className="mt-3 w-full rounded-xl border border-slate-300 p-3 text-base" />
      {listening && <p className="mt-1 text-sm text-emerald-800" aria-live="polite">Listening… {interim}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {canSpeak && (
          <button type="button" onClick={toggleMic} aria-pressed={listening}
            className={`flex items-center gap-2 px-4 min-h-[48px] rounded-xl font-semibold ${listening ? 'bg-rose-700 text-white' : 'border border-slate-300 text-slate-900'}`}>
            {listening ? <><MicOff className="w-5 h-5" /> Stop</> : <><Mic className="w-5 h-5" /> Speak</>}
          </button>
        )}
        <button type="button" onClick={() => read()} disabled={!text.trim()}
          className="flex-1 min-h-[48px] rounded-xl bg-slate-900 text-white font-semibold disabled:opacity-50">Read it</button>
      </div>
      {canSpeak && <p className="mt-1 text-xs text-slate-600">Speaking uses the browser's speech service and needs internet. Reading the words happens on this device.</p>}

      {incomplete.length > 0 && (
        <div className="mt-3 rounded-xl bg-amber-50 border border-amber-300 p-3 text-sm text-amber-950">
          <p className="font-semibold">No reps or time found for:</p>
          <ul className="list-disc pl-5">{incomplete.map((e, i) => <li key={i}>{e.name} <span className="text-amber-800">("{e.raw}")</span></li>)}</ul>
          <p className="mt-1">Add a number (for example "12 reps" or "30 seconds") and press Read it again. These are not saved.</p>
        </div>
      )}

      {entries && entries.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">Check this before saving</p>
          <ul className="space-y-1.5">
            {entries.map((e, i) => (
              <li key={i} className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-sm"><span className="font-semibold text-slate-900">{e.name}</span><span className="block text-slate-700">{describeEntry(e)}</span></span>
                <button type="button" aria-label={`Remove ${e.name}`} onClick={() => setEntries(entries.filter((_, j) => j !== i))}
                  className="shrink-0 p-2 rounded-lg text-slate-600 hover:bg-slate-200"><X className="w-4 h-4" /></button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select aria-label="Circuit location" value={location} onChange={(e) => setLocation(e.target.value as Location)}
              className="min-h-[48px] px-3 rounded-xl border border-slate-300 bg-white font-semibold">
              <option value="Gym">Gym</option><option value="Home">Home</option><option value="Outdoor">Outdoor</option>
            </select>
            <button type="button" onClick={save} className="flex-1 min-h-[48px] rounded-xl bg-emerald-700 text-white font-semibold">
              Save circuit for {shortDateLabel(date)} ({entries.length})
            </button>
          </div>
        </div>
      )}
    </details>
  );
}
