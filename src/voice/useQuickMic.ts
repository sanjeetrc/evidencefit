import { useEffect, useRef, useState } from 'react';
import type { ShowToast } from '../types';
import { detachRec, getSR, isAndroid, SPEECH_LANG, type SpeechRec } from './speech';

const FATAL_MIC_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported']);
/** Consecutive silent auto-restarts before we give up (each restart beeps on Android). */
const MAX_EMPTY_RESTARTS = 3;
const FLUSH_TIMEOUT_MS = 1500;

interface QuickMicOptions {
  /** Latest textarea value (read from a ref, never a stale render value). */
  getText: () => string;
  setText: (v: string) => void;
  showToast: ShowToast;
}

/**
 * Free-dictation mic for Quick-Log.
 * - Auto-resumes after Chrome's silent session end until the user taps Stop.
 * - flush() stops and waits for the final transcript, so "Add" never races a late result.
 * - Every handler is bound to its own recognizer instance; stale instances are ignored.
 */
export function useQuickMic(opts: QuickMicOptions) {
  const [listening, setListening] = useState(false);
  const optsRef = useRef(opts);
  useEffect(() => { optsRef.current = opts; });

  const recRef = useRef<SpeechRec | null>(null);
  const wantedRef = useRef(false);
  const baseRef = useRef('');
  const emptyRestartsRef = useRef(0);
  const restartTimerRef = useRef<number | undefined>(undefined);

  const finish = () => {
    window.clearTimeout(restartTimerRef.current);
    restartTimerRef.current = undefined;
    recRef.current = null;
    wantedRef.current = false;
    setListening(false);
  };

  const startSession = () => {
    const SR = getSR();
    if (!SR) {
      optsRef.current.showToast('Browser voice input not supported here — press Win + H instead.');
      finish();
      return;
    }
    const rec = new SR();
    rec.lang = SPEECH_LANG;
    rec.interimResults = false;
    rec.continuous = !isAndroid;
    baseRef.current = optsRef.current.getText().trim();

    rec.onresult = (ev) => {
      if (recRef.current !== rec) return;
      emptyRestartsRef.current = 0;
      const finals: string[] = [];
      for (let i = 0; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal && r[0]) finals.push(r[0].transcript.trim());
      }
      // Defensive de-dupe: drop a final that is a prefix of a later one ("leg", "leg press", "leg press 100 lb").
      const kept = finals.filter((t, i) => t && !finals.slice(i + 1).some((l) => l.toLowerCase().startsWith(t.toLowerCase())));
      const spoken = kept.join(' ').trim();
      if (spoken) optsRef.current.setText(baseRef.current ? `${baseRef.current} ${spoken}` : spoken);
    };

    rec.onerror = (ev) => {
      if (recRef.current !== rec) return;
      if (FATAL_MIC_ERRORS.has(ev.error)) {
        wantedRef.current = false;
        optsRef.current.showToast(`Mic error: ${ev.error}`);
      }
      // no-speech / network / aborted: onend decides whether to resume.
    };

    rec.onend = () => {
      if (recRef.current !== rec) return;
      if (wantedRef.current && emptyRestartsRef.current < MAX_EMPTY_RESTARTS) {
        emptyRestartsRef.current += 1;
        restartTimerRef.current = window.setTimeout(() => {
          restartTimerRef.current = undefined;
          if (recRef.current !== rec) return;
          if (wantedRef.current) startSession();
          else finish();
        }, 150);
        return;
      }
      finish();
    };

    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      finish();
      optsRef.current.showToast('Mic busy — tap Mic again.');
    }
  };

  /** Mic button: start, or stop while keeping the final words. */
  const toggle = () => {
    if (recRef.current) {
      wantedRef.current = false;
      if (restartTimerRef.current !== undefined) { finish(); return; }
      try { recRef.current.stop(); } catch { detachRec(recRef.current); finish(); }
      return;
    }
    wantedRef.current = true;
    emptyRestartsRef.current = 0;
    startSession();
  };

  /** Stop immediately and discard anything not yet transcribed. */
  const abort = () => {
    detachRec(recRef.current);
    finish();
  };

  /** Stop and resolve once the final transcript has been applied (or after a short timeout). */
  const flush = () =>
    new Promise<void>((resolve) => {
      const rec = recRef.current;
      wantedRef.current = false;
      if (!rec) { resolve(); return; }
      if (restartTimerRef.current !== undefined) { finish(); resolve(); return; }
      const done = () => {
        window.clearTimeout(timeout);
        if (recRef.current === rec) finish();
        resolve();
      };
      const timeout = window.setTimeout(() => { detachRec(rec); done(); }, FLUSH_TIMEOUT_MS);
      rec.onend = done;
      try { rec.stop(); } catch { detachRec(rec); done(); }
    });

  useEffect(() => () => {
    window.clearTimeout(restartTimerRef.current);
    wantedRef.current = false;
    detachRec(recRef.current);
    recRef.current = null;
  }, []);

  return { listening, toggle, abort, flush };
}
