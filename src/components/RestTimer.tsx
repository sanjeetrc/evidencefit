import { useEffect, useState } from 'react';
import { Clock, Pause, Play, RotateCcw } from 'lucide-react';
import { Card } from './ui';

export default function RestTimer() {
  const [duration, setDuration] = useState(60);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(60);
  const running = endAt !== null && remaining > 0;

  useEffect(() => {
    if (!endAt) return;
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) {
        setEndAt(null);
        try { navigator.vibrate?.([200, 100, 200]); } catch { /* ignore */ }
      }
    }, 250);
    return () => clearInterval(id);
  }, [endAt]);

  const start = (s: number) => { setDuration(s); setRemaining(s); setEndAt(Date.now() + s * 1000); };
  const mins = Math.floor(remaining / 60);
  const secs = String(remaining % 60).padStart(2, '0');

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-teal-700" />
          <span className="text-sm font-bold text-slate-900">Rest / Hold Timer</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-2xl font-bold tabular-nums">{mins}:{secs}</span>
          <button type="button" onClick={() => running ? (setEndAt(null)) : start(remaining === 0 ? duration : remaining)}
            className="inline-flex items-center gap-1 px-3.5 min-h-[40px] rounded-xl bg-emerald-700 text-white text-sm font-semibold">
            {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />} {running ? 'Pause' : 'Start'}
          </button>
          <button type="button" onClick={() => { setEndAt(null); setRemaining(duration); }} aria-label="Reset timer" className="p-2.5 rounded-xl border border-slate-300 text-slate-700">
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {[30, 45, 60, 90, 120].map((s) => (
          <button key={s} type="button" onClick={() => start(s)}
            className={`px-3 min-h-[36px] rounded-lg text-sm font-semibold ${duration === s && running ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-800'}`}>
            {s < 120 ? `${s}s` : '2 min'}
          </button>
        ))}
      </div>
    </Card>
  );
}
