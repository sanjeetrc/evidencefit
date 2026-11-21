import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, Pause, Play, RotateCcw } from 'lucide-react';

/**
 * Rest / isometric timer. Uses an end timestamp rather than counting ticks, so it
 * stays correct when the phone throttles timers or the screen locks briefly.
 */
export function Timer() {
  const [duration, setDuration] = useState(60);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [pausedLeft, setPausedLeft] = useState(60);
  const [, force] = useState(0);
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);

  const remaining = endAt ? Math.max(0, Math.ceil((endAt - Date.now()) / 1000)) : pausedLeft;
  const running = endAt !== null && remaining > 0;

  const beep = useCallback(() => {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        [0, 0.45].forEach((t) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.value = 880;
          gain.gain.setValueAtTime(0.15, ctx.currentTime + t);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.35);
          osc.connect(gain).connect(ctx.destination);
          osc.start(ctx.currentTime + t);
          osc.stop(ctx.currentTime + t + 0.35);
        });
      }
      navigator.vibrate?.([200, 100, 200]);
    } catch {
      /* audio not available */
    }
  }, []);

  useEffect(() => {
    if (!endAt) return;
    const id = setInterval(() => {
      if (Date.now() >= endAt) {
        setEndAt(null);
        setPausedLeft(0);
        beep();
        wakeLock.current?.release().catch(() => {});
        wakeLock.current = null;
      }
      force((x) => x + 1);
    }, 250);
    return () => clearInterval(id);
  }, [endAt, beep]);

  const start = async (secs: number) => {
    setEndAt(Date.now() + secs * 1000);
    try {
      const nav = navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } };
      wakeLock.current = (await nav.wakeLock?.request('screen')) ?? null;
    } catch {
      /* wake lock unsupported */
    }
  };

  const preset = (s: number) => {
    setDuration(s);
    setPausedLeft(s);
    start(s);
  };

  const pct = duration > 0 ? Math.round(((duration - remaining) / duration) * 100) : 0;
  const mins = Math.floor(remaining / 60);
  const secs = String(remaining % 60).padStart(2, '0');

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-800 flex items-center justify-center" aria-hidden><Clock className="w-5 h-5" /></div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Rest and hold timer</h3>
            <p className="text-xs text-slate-600">Tap a time to start</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span role="timer" aria-live="off" className={`font-mono text-3xl font-bold tabular-nums ${remaining === 0 ? 'text-emerald-700' : 'text-slate-900'}`}>
            {mins}:{secs}
          </span>
          <button
            type="button"
            onClick={() => {
              if (running) { setPausedLeft(remaining); setEndAt(null); }
              else start(remaining === 0 ? duration : remaining);
            }}
            className="inline-flex items-center gap-1.5 px-4 min-h-[44px] rounded-xl text-sm font-semibold bg-emerald-700 text-white hover:bg-emerald-800"
          >
            {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {running ? 'Pause' : 'Start'}
          </button>
          <button type="button" onClick={() => { setEndAt(null); setPausedLeft(duration); }} className="p-3 rounded-xl border border-slate-300 text-slate-700" aria-label="Reset timer">
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="mt-3 w-full h-2 bg-slate-100 rounded-full overflow-hidden" aria-hidden>
        <div className="h-full bg-teal-600 transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {[30, 45, 60, 90, 120].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => preset(s)}
            className={`px-3.5 min-h-[40px] rounded-lg text-sm font-semibold ${duration === s && running ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'}`}
          >
            {s < 120 ? `${s}s` : '2 min'}
          </button>
        ))}
      </div>
    </div>
  );
}
