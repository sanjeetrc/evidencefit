import { useState } from 'react';
import { Bot, ClipboardCopy, Cloud, RefreshCw, Send } from 'lucide-react';
import { aiLabel, askCoach, isAiReady } from '../../ai';
import { Card, CardHeader, FormattedText } from '../../components/ui';
import { buildCoachBrief } from '../../domain/coachBrief';
import { useDrive } from '../../sync/useDriveSync';
import DriveSyncChip from '../drive/DriveSyncChip';
import { uid } from '../../lib/ids';
import type { AiCoachSettings, Profile, ShowToast, UpdateProfile } from '../../types';

interface Props {
  profile: Profile;
  aiCoach: AiCoachSettings;
  updateProfile: UpdateProfile;
  showToast: ShowToast;
}

/** Clipboard API first; old-style copy as a fallback (some Android WebViews / http pages). */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function ClaudeBriefCard({ profile, showToast }: { profile: Profile; showToast: ShowToast }) {
  const [days, setDays] = useState<14 | 28>(14);
  const [includeHealth, setIncludeHealth] = useState(true);
  const [preview, setPreview] = useState(false);
  const brief = buildCoachBrief(profile, { days, includeHealth });
  const drive = useDrive();

  const copyAndOpen = async () => {
    const ok = await copyText(brief);
    if (!ok) {
      setPreview(true);
      showToast('Couldn’t copy automatically — select the text in the preview and copy it.');
      return;
    }
    showToast('Copied — paste it in Claude and type your question after “MY QUESTION:”.');
    window.open('https://claude.ai/new', '_blank', 'noopener');
  };

  return (
    <Card>
      <CardHeader icon={<ClipboardCopy className="w-5 h-5" />} title="Coach with your Claude subscription"
        subtitle="Copies your recent workouts as text. Nothing is sent until you paste it." />
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {([14, 28] as const).map((d) => (
            <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}
              className={`min-h-[44px] px-4 rounded-lg border-2 text-base font-bold ${days === d ? 'bg-emerald-700 border-emerald-700 text-white' : 'bg-white border-slate-300 text-slate-800'}`}>
              Last {d} days
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2.5 text-base cursor-pointer">
          <input type="checkbox" checked={includeHealth} onChange={() => setIncludeHealth((v) => !v)} className="w-5 h-5 accent-emerald-700" />
          Include conditions &amp; medications
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-2">
          <button type="button" onClick={() => void copyAndOpen()}
            className="min-h-[52px] rounded-xl bg-[#c96442] text-white text-lg font-extrabold inline-flex items-center justify-center gap-2">
            <ClipboardCopy className="w-5 h-5" /> Copy for Claude
          </button>
          <button type="button" onClick={() => setPreview((v) => !v)} aria-expanded={preview}
            className="min-h-[52px] rounded-xl bg-white border-2 border-slate-300 text-slate-900 text-base font-bold">
            {preview ? 'Hide preview' : 'Preview'}
          </button>
        </div>
        {preview && (
          <pre className="max-h-[50vh] overflow-auto p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm leading-snug whitespace-pre-wrap select-all">{brief}</pre>
        )}
        {drive.enabled && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={drive.syncNow} disabled={drive.status === 'syncing'}
              className="min-h-[48px] px-4 rounded-xl bg-white border-2 border-emerald-600 text-emerald-900 text-base font-bold disabled:opacity-50 inline-flex items-center gap-2">
              <Cloud className="w-5 h-5" aria-hidden /> Sync to Drive now
            </button>
            <DriveSyncChip />
          </div>
        )}
        <p className="text-sm text-slate-600">
          Tip: paste it into a Claude <strong>Project</strong> and keep chatting there, so Claude remembers your history.
        </p>
      </div>
    </Card>
  );
}

export default function CoachTab({ profile, aiCoach, updateProfile, showToast }: Props) {
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const aiReady = isAiReady(aiCoach);

  const sendChat = async (prompt: string) => {
    if (!prompt.trim() || chatLoading) return;
    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    updateProfile((p) => ({ chatHistory: [...p.chatHistory, { id: uid(), role: 'user' as const, text: prompt.trim(), timestamp: ts }].slice(-40) }));
    setChatInput('');
    setChatLoading(true);
    try {
      const reply = await askCoach(prompt, profile, aiCoach);
      updateProfile((p) => ({ chatHistory: [...p.chatHistory, { id: uid(), role: 'assistant' as const, text: reply.text, isFallback: reply.isFallback, timestamp: ts }].slice(-40) }));
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <>
    <ClaudeBriefCard profile={profile} showToast={showToast} />
    <Card className="flex flex-col min-h-[480px]">
      <CardHeader icon={<Bot className="w-5 h-5" />} title="AI Coach" subtitle={aiReady ? `Connected (${aiLabel(aiCoach)})` : 'Off — turn on in Settings for free-text AI coaching'}
        right={profile.chatHistory.length > 0 && <button type="button" onClick={() => updateProfile(() => ({ chatHistory: [] }))} className="text-xs font-semibold text-slate-600">Clear</button>} />
      <div className="flex flex-wrap gap-2 mb-3">
        <button type="button" onClick={() => void sendChat('Review my recent circuits: what muscles am I hitting well, what am I missing, and what should I do tomorrow?')}
          className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-950">Review my week</button>
        <button type="button" onClick={() => void sendChat('Suggest a 30-minute home circuit for tomorrow based on my recent workouts.')}
          className="px-3 py-2 rounded-xl bg-teal-50 border border-teal-200 text-xs font-bold text-teal-950">Home circuit idea</button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto max-h-[55vh] py-2">
        {profile.chatHistory.length === 0 && <p className="text-sm text-slate-500 text-center py-8">Ask about your circuits, joint comfort, or tomorrow's workout.</p>}
        {profile.chatHistory.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] rounded-2xl px-4 py-3 ${m.role === 'user' ? 'bg-slate-900 text-white text-sm' : 'bg-slate-50 border border-slate-200'}`}>
              {m.role === 'user' ? <p>{m.text}</p> : <FormattedText text={m.text} />}
              <p className={`mt-1 text-[11px] ${m.role === 'user' ? 'text-slate-300' : 'text-slate-500'}`}>{m.timestamp}</p>
            </div>
          </div>
        ))}
        {chatLoading && <p className="flex items-center gap-2 text-sm text-slate-600"><RefreshCw className="w-4 h-4 animate-spin" /> Thinking…</p>}
      </div>
      <form className="pt-3 border-t border-slate-100 flex gap-2" onSubmit={(e) => { e.preventDefault(); void sendChat(chatInput); }}>
        <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Ask the coach…" disabled={chatLoading} aria-label="Message to coach"
          className="flex-1 min-w-0 min-h-[44px] px-3 rounded-xl border border-slate-300 text-sm" />
        <button type="submit" disabled={chatLoading || !chatInput.trim()} aria-label="Send" className="px-4 min-h-[44px] rounded-xl bg-emerald-700 text-white disabled:opacity-40"><Send className="w-4 h-4" /></button>
      </form>
    </Card>
    </>
  );
}
