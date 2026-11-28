import { useEffect, useRef, useState } from 'react';
import type { CircuitEntry, GlossaryRule, LoadUnit, ShowToast } from '../types';
import { createGuidedController, EMPTY_GUIDED_VIEW, type GuidedController, type GuidedView } from './guidedController';

interface GuidedOptions {
  glossary: GlossaryRule[];
  showToast: ShowToast;
  onComplete: (entry: CircuitEntry) => void;
  /** Names the user has logged before (matched first when speaking the exercise). */
  ownExercises: string[];
  /** Weight unit when none is spoken. */
  defaultUnit: LoadUnit;
}

/** Add ?voicedebug to the URL to show a live trace of speech events in the guided panel. */
export const VOICE_DEBUG = (() => {
  try { return new URLSearchParams(window.location.search).has('voicedebug'); } catch { return false; }
})();

/** React wiring for the guided voice controller (all speech sequencing lives in guidedController.ts). */
export function useGuidedVoice(opts: GuidedOptions) {
  const [view, setView] = useState<GuidedView>(EMPTY_GUIDED_VIEW);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const optsRef = useRef(opts);
  useEffect(() => { optsRef.current = opts; });

  const ctrlRef = useRef<GuidedController | null>(null);
  // Created lazily on first use (always from an event handler, never during render).
  const ctrl = () => {
    ctrlRef.current ??= createGuidedController({
      onView: (patch) => setView((v) => ({ ...v, ...patch })),
      getGlossary: () => optsRef.current.glossary,
      getOwnExercises: () => optsRef.current.ownExercises,
      getDefaultUnit: () => optsRef.current.defaultUnit,
      toast: (msg) => optsRef.current.showToast(msg),
      onComplete: (entry) => optsRef.current.onComplete(entry),
      onDebug: VOICE_DEBUG
        ? (msg) => {
          const t = new Date();
          const stamp = `${t.getMinutes()}:${String(t.getSeconds()).padStart(2, '0')}.${String(t.getMilliseconds()).padStart(3, '0').slice(0, 1)}`;
          setDebugLog((l) => [...l.slice(-9), `${stamp} ${msg}`]);
        }
        : undefined,
    });
    return ctrlRef.current;
  };

  useEffect(() => () => { void ctrlRef.current?.stop(); }, []);

  return {
    ...view,
    debugLog,
    active: view.step !== null,
    start: () => { setDebugLog([]); ctrl().start(); },
    /** Resolves once the mic is fully released (await before starting another recognizer). */
    stop: () => ctrl().stop(),
    retry: () => ctrl().retry(),
    skip: () => ctrl().skip(),
    pickExercise: (name: string) => ctrl().pickExercise(name),
    answer: (text: string) => ctrl().answer(text),
  };
}
