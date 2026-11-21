import { PAIN_AREAS } from '../domain/reference';
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, BarChart3, Bot, RefreshCw, Send, Sparkles } from 'lucide-react';
import { askCoach } from '../ai/coach';
import { Audit } from '../domain/engine';
import { formatDateISO, getDayKeyFromDate } from '../domain/dates';
import { MAX_CHAT_MESSAGES, uid } from '../domain/state';
import { AiCoachSettings, ChatMessage, Profile } from '../domain/types';
import { FormattedMessage } from './common';

interface Props {
  profile: Profile;
  audit: Audit;
  settings: AiCoachSettings;
  prefillSwap: { exercise: string; pain: number; site?: string } | null;
  clearPrefill: () => void;
  /** Writes to a specific profile id, so a reply never lands on another person's profile. */
  updateProfileById: (id: string, fn: (p: Profile) => Partial<Profile>) => void;
  goToSettings: () => void;
}

const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const append = (msgs: ChatMessage[], m: ChatMessage) => [...msgs, m].slice(-MAX_CHAT_MESSAGES);

export function CoachTab({ profile, audit, settings, prefillSwap, clearPrefill, updateProfileById, goToSettings }: Props) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [panel, setPanel] = useState<'none' | 'swap' | 'tweak'>('none');
  const [swapEx, setSwapEx] = useState('');
  const [swapArea, setSwapArea] = useState('Knee');
  const [swapPain, setSwapPain] = useState(4);
  const endRef = useRef<HTMLDivElement>(null);
  const live = settings.enabled && !!settings.consentAt && !!settings.apiKey;

  useEffect(() => {
    if (!prefillSwap) return;
    setSwapEx(prefillSwap.exercise);
    setSwapPain(prefillSwap.pain);
    if (prefillSwap.site) setSwapArea(prefillSwap.site);
    setPanel('swap');
    clearPrefill();
  }, [prefillSwap, clearPrefill]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); // returns a Promise in newer browsers: never return it from an effect
  }, [profile.chatHistory.length, loading]);

  const send = async (prompt: string, label?: string) => {
    if (!prompt.trim() || loading) return;
    const pid = profile.id;
    updateProfileById(pid, (p) => ({ chatHistory: append(p.chatHistory, { id: uid(), role: 'user', text: label ?? prompt.trim(), timestamp: now() }) }));
    setInput('');
    setPanel('none');
    setLoading(true);
    try {
      const r = await askCoach({ prompt, profile, audit, settings });
      updateProfileById(pid, (p) => ({ chatHistory: append(p.chatHistory, { id: uid(), role: 'assistant', text: r.text, isFallback: r.isFallback, timestamp: now() }) }));
    } finally {
      setLoading(false);
    }
  };

  const weekly = () => send(
    'Weekly audit, compact: 1. Trend (2–4 weeks of training and recovery). 2. Decision, citing the progression, deload or ramp-back rule. 3. One specific change for next week. 4. One line on protein against my meal pattern.',
    'Weekly audit'
  );

  return (
    <div className="space-y-5">
      {!live && (
        <div className="rounded-2xl bg-slate-100 border border-slate-200 p-4 text-sm text-slate-800 flex flex-wrap items-center justify-between gap-2">
          <span>The AI coach is off. Buttons below give answers from the on-device rules. Turning the AI on sends your training data to Google.</span>
          <button type="button" onClick={goToSettings} className="px-3 min-h-[40px] rounded-lg bg-slate-900 text-white font-semibold">AI settings</button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button type="button" onClick={weekly} disabled={loading} className="text-left p-4 rounded-2xl bg-white border border-slate-200 hover:border-emerald-600 disabled:opacity-50">
          <BarChart3 className="w-5 h-5 text-emerald-700" aria-hidden /><h3 className="mt-2 text-sm font-bold">Weekly audit</h3>
          <p className="text-sm text-slate-600">Trend, decision, next tweak, protein</p>
        </button>
        <button type="button" aria-expanded={panel === 'swap'} onClick={() => setPanel(panel === 'swap' ? 'none' : 'swap')} className={`text-left p-4 rounded-2xl border ${panel === 'swap' ? 'bg-amber-50 border-amber-500' : 'bg-white border-slate-200'}`}>
          <AlertTriangle className="w-5 h-5 text-amber-700" aria-hidden /><h3 className="mt-2 text-sm font-bold">Pain swap</h3>
          <p className="text-sm text-slate-600">Joint-friendly alternatives</p>
        </button>
        <button type="button" aria-expanded={panel === 'tweak'} onClick={() => setPanel(panel === 'tweak' ? 'none' : 'tweak')} className={`text-left p-4 rounded-2xl border ${panel === 'tweak' ? 'bg-teal-50 border-teal-500' : 'bg-white border-slate-200'}`}>
          <Sparkles className="w-5 h-5 text-teal-700" aria-hidden /><h3 className="mt-2 text-sm font-bold">Adjust today</h3>
          <p className="text-sm text-slate-600">Short on sleep, time, heat or kit</p>
        </button>
      </div>

      {panel === 'swap' && (
        <form className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 p-4 rounded-2xl bg-amber-50 border border-amber-300"
          onSubmit={(e) => { e.preventDefault(); if (swapEx.trim()) send(`I had ${swapPain}/10 ${swapArea.toLowerCase()} pain during "${swapEx}". Walk me through the pain-modification ladder briefly and give 2 joint-friendly alternatives that fit my flags.`, `Pain swap: ${swapEx} (${swapArea}, ${swapPain}/10)`); }}>
          <input required aria-label="Exercise" placeholder="Exercise" value={swapEx} onChange={(e) => setSwapEx(e.target.value)} className="sm:col-span-2 min-h-[44px] px-3 rounded-lg border border-amber-300 bg-white text-sm" />
          <select aria-label="Painful area" value={swapArea} onChange={(e) => setSwapArea(e.target.value)} className="min-h-[44px] px-3 rounded-lg border border-amber-300 bg-white text-sm">
            {[...new Set([swapArea, ...PAIN_AREAS])].map((a) => <option key={a}>{a}</option>)}
          </select>
          <div className="flex gap-2">
            <input type="number" aria-label="Pain 1 to 10" min={1} max={10} value={swapPain} onChange={(e) => setSwapPain(Math.min(10, Math.max(1, Number(e.target.value) || 1)))} className="w-16 min-h-[44px] px-2 rounded-lg border border-amber-300 bg-white text-sm" />
            <button type="submit" disabled={loading} className="flex-1 min-h-[44px] rounded-lg bg-amber-700 text-white text-sm font-semibold">Ask</button>
          </div>
        </form>
      )}
      {panel === 'tweak' && (
        <div className="flex flex-wrap gap-2 p-4 rounded-2xl bg-teal-50 border border-teal-300">
          {['Slept under 6 hours', 'Only 20 minutes', 'Hot and humid, over 30 °C', 'Travelling, no equipment'].map((s) => (
            <button key={s} type="button" disabled={loading} onClick={() => send(`Adjust my planned session ("${profile.program[getDayKeyFromDate(formatDateISO())].title}") for today: ${s}. Give exact sets, reps and RPE.`, `Adjust today: ${s}`)}
              className="px-3 min-h-[40px] rounded-lg bg-white border border-teal-300 text-sm font-semibold text-teal-950">{s}</button>
          ))}
        </div>
      )}

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col min-h-[420px]" aria-label="Coach conversation">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-bold"><Bot className="w-4 h-4 text-emerald-700" aria-hidden /> {live ? 'AI coach (Gemini)' : 'On-device rules'}</span>
          {profile.chatHistory.length > 0 && <button type="button" onClick={() => updateProfileById(profile.id, () => ({ chatHistory: [] }))} className="text-sm font-semibold text-slate-600 min-h-[40px]">Clear</button>}
        </div>
        <div className="flex-1 p-4 space-y-4 overflow-y-auto max-h-[60vh]" aria-live="polite">
          {profile.chatHistory.length === 0 && <p className="text-sm text-slate-600 text-center py-10">Ask about form, joint-safe swaps, protein across your meals, or run the weekly audit.</p>}
          {profile.chatHistory.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] rounded-2xl px-4 py-3 ${m.role === 'user' ? 'bg-slate-900 text-white text-sm' : 'bg-slate-50 border border-slate-200'}`}>
                {m.role === 'user' ? <p>{m.text}</p> : <FormattedMessage text={m.text} />}
                <p className={`mt-1.5 text-xs ${m.role === 'user' ? 'text-slate-300' : 'text-slate-500'}`}>{m.timestamp}{m.isFallback ? ' · on-device rules' : ''}</p>
              </div>
            </div>
          ))}
          {loading && <p className="flex items-center gap-2 text-sm text-slate-600"><RefreshCw className="w-4 h-4 animate-spin" aria-hidden /> Checking your logs and flags…</p>}
          <div ref={endRef} />
        </div>
        <form className="p-3 border-t border-slate-100 flex gap-2" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <input aria-label="Message the coach" placeholder={live ? 'Ask the coach…' : 'Turn on the AI coach in Settings to ask free questions'} value={input} onChange={(e) => setInput(e.target.value)} disabled={loading || !live} maxLength={2000}
            className="flex-1 min-w-0 min-h-[44px] text-sm px-3 rounded-xl border border-slate-300 bg-white disabled:bg-slate-100" />
          <button type="submit" disabled={loading || !input.trim() || !live} aria-label="Send" className="px-4 min-h-[44px] rounded-xl bg-emerald-700 text-white disabled:opacity-40"><Send className="w-4 h-4" /></button>
        </form>
      </section>
    </div>
  );
}
