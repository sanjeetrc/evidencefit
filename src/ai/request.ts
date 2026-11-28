// Provider-neutral request/response shapes shared by the Gemini and Groq callers.

export type AiResult = { ok: true; text: string; ms: number } | { ok: false; error: string; ms: number; timedOut?: boolean };

export interface AiRequest {
  system?: string;
  user: string;
  /** Ask for a JSON object reply. */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  /** How much the model may "think" first: off for fast parsing, low for coaching. */
  thinking: 'off' | 'low';
  timeoutMs: number;
}

export interface Connection {
  apiKey: string;
  model: string;
}

/** "HTTP 400 — The model `x` has been decommissioned…" using the API's own message when it sends one. */
export async function httpError(res: Response): Promise<string> {
  let detail = '';
  try {
    const data = await res.json() as { error?: { message?: unknown } | unknown; message?: unknown };
    const e = data?.error;
    const msg = e && typeof e === 'object' && 'message' in e ? (e as { message?: unknown }).message : typeof e === 'string' ? e : data?.message;
    if (typeof msg === 'string') detail = msg.replace(/\s+/g, ' ').trim().slice(0, 220);
  } catch { /* no JSON body */ }
  return detail ? `HTTP ${res.status} — ${detail}` : `HTTP ${res.status}`;
}

/**
 * fetch with a timeout, an offline check and timing. `send(signal, full)` is called with the full request
 * first (JSON mode, thinking/reasoning settings). If the model rejects it (HTTP 400), it is retried once as a
 * plain request — not every model supports every option.
 */
export async function timedRequest(
  req: Pick<AiRequest, 'timeoutMs'>,
  send: (signal: AbortSignal, full: boolean) => Promise<Response>,
  readText: (data: unknown) => string,
  slowHint: string,
): Promise<AiResult> {
  const started = Date.now();
  const ms = () => Date.now() - started;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, error: 'Offline', ms: 0 };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), req.timeoutMs);
  try {
    let res = await send(ctrl.signal, true);
    if (res.status === 400) res = await send(ctrl.signal, false);
    if (!res.ok) return { ok: false, error: await httpError(res), ms: ms() };
    const text = readText(await res.json());
    return text.trim() ? { ok: true, text, ms: ms() } : { ok: false, error: 'Empty response', ms: ms() };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { ok: false, timedOut: true, ms: ms(), error: `took longer than ${req.timeoutMs / 1000}s — check your connection or try ${slowHint}` };
    }
    const msg = e instanceof Error ? e.message : String(e);
    // Browsers report blocked/failed network calls as a bare TypeError ("Failed to fetch").
    return { ok: false, error: /failed to fetch|networkerror|load failed/i.test(msg) ? 'Network error (blocked or no connection)' : msg, ms: ms() };
  } finally {
    clearTimeout(timer);
  }
}
