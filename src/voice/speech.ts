// Minimal typing for the Web Speech API (not in TS's DOM lib) + shared helpers.

export interface SpeechResultList {
  length: number;
  [index: number]: { isFinal: boolean; length: number; [alt: number]: { transcript: string } };
}

export interface SpeechRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((ev: { results: SpeechResultList }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  /** Fired when the mic is actually capturing (there is a gap after start()). */
  onaudiostart?: (() => void) | null;
  onspeechstart?: (() => void) | null;
}

export type SpeechRecCtor = new () => SpeechRec;

export const getSR = (): SpeechRecCtor | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecCtor; webkitSpeechRecognition?: SpeechRecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/** Android Chrome's continuous mode returns cumulative/duplicate finals, so we use single-shot + restart there. */
export const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

/**
 * Detach all handlers (so no late result can reach the app) and end the session with stop().
 * Deliberately NOT abort(): on Android Chrome abort() is processed late by the shared speech
 * service and can kill the NEXT recognizer that starts, leaving it "listening" but deaf.
 */
export function detachRec(r: SpeechRec | null): void {
  if (!r) return;
  r.onresult = null;
  r.onerror = null;
  r.onend = null;
  r.onaudiostart = null;
  r.onspeechstart = null;
  try { r.stop(); } catch { /* ignore */ }
}

export const SPEECH_LANG = 'en-IN';
