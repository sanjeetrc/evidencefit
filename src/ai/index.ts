import { buildTomorrowSuggestion } from '../domain/suggestion';
import { formatDateISO } from '../lib/dates';
import { isEntry, normalizeEntry } from '../lib/storage';
import type { AiCoachSettings, AiProvider, CircuitEntry, LoadUnit, Profile } from '../types';
import { callGemini, listGeminiModels } from './gemini';
import { callGroq, listGroqModels } from './groq';
import type { AiRequest, AiResult, Connection } from './request';

export type { AiResult } from './request';

export const PARSE_TIMEOUT_MS = 25_000;
export const COACH_TIMEOUT_MS = 45_000;

export const PROVIDER_LABEL: Record<AiProvider, string> = { gemini: 'Google Gemini', groq: 'Groq' };

/** Key + model + consent for the provider currently selected. */
export function activeConnection(s: AiCoachSettings): Connection & { consentAt: string | null } {
  return s.provider === 'groq'
    ? { apiKey: s.groqApiKey, model: s.groqModel, consentAt: s.groqConsentAt }
    : { apiKey: s.apiKey, model: s.model, consentAt: s.consentAt };
}

export const isAiReady = (s: AiCoachSettings) => {
  const c = activeConnection(s);
  return Boolean(s.enabled && c.consentAt && c.apiKey.trim());
};

/** Short "Groq · llama-3.3-70b-versatile" label for headers and messages. */
export const aiLabel = (s: AiCoachSettings) => `${s.provider === 'groq' ? 'Groq' : 'Gemini'} · ${activeConnection(s).model}`;

/** Models the current key can use for chat, for the Settings picker. */
export async function listCompatibleModels(s: AiCoachSettings): Promise<{ models: string[]; error?: string }> {
  const key = activeConnection(s).apiKey;
  if (!key.trim()) return { models: [], error: 'Paste an API key first.' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const models = s.provider === 'groq' ? await listGroqModels(key, ctrl.signal) : await listGeminiModels(key, ctrl.signal);
    return models.length ? { models } : { models, error: 'No chat models available for this key.' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { models: [], error: explainAiError(/abort/i.test(msg) ? 'Timed out' : /failed to fetch|networkerror|load failed/i.test(msg) ? 'Network error (blocked or no connection)' : msg, s.provider) };
  } finally {
    clearTimeout(timer);
  }
}

function callProvider(s: AiCoachSettings, provider: AiProvider, req: AiRequest): Promise<AiResult> {
  const conn = activeConnection({ ...s, provider });
  return provider === 'groq' ? callGroq(conn, req) : callGemini(conn, req);
}

/** "Busy / down" answers worth retrying: 5xx and 429 (Gemini sends 503 "model overloaded"). */
export const isTransientAiError = (error: string) => /^HTTP (429|500|502|503|504)\b/.test(error);
export const AI_RETRY_DELAY_MS = 1500;
const OTHER: Record<AiProvider, AiProvider> = { gemini: 'groq', groq: 'gemini' };

/** The other provider, only if it has its own key AND its own consent (consent is per provider). */
export function backupProvider(s: AiCoachSettings): AiProvider | null {
  const other = OTHER[s.provider];
  return isAiReady({ ...s, provider: other }) ? other : null;
}

export type AiCallResult = AiResult & { note?: string };

/**
 * Selected provider, with two fallbacks for "busy" errors (5xx/429):
 * 1. one retry after AI_RETRY_DELAY_MS, if there is time left in the request's budget;
 * 2. then the other provider, if the user set it up (key and consent). Timeouts aren't retried, so
 *    Quick-Log isn't kept waiting twice; it falls back to the offline parser instead.
 * `note` says when a fallback answered, so the UI can mention it.
 */
async function callAi(s: AiCoachSettings, req: AiRequest, wait = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<AiCallResult> {
  const first = await callProvider(s, s.provider, req);
  if (first.ok || !isTransientAiError(first.error)) return first;
  let last: AiResult = first;
  if (first.ms + AI_RETRY_DELAY_MS < req.timeoutMs / 2) {
    await wait(AI_RETRY_DELAY_MS);
    last = await callProvider(s, s.provider, req);
    if (last.ok) return { ...last, note: `${PROVIDER_LABEL[s.provider]} was busy; answered on the second try.` };
    if (!isTransientAiError(last.error)) return last;
  }
  const backup = backupProvider(s);
  if (!backup) return last;
  const alt = await callProvider(s, backup, req);
  return alt.ok
    ? { ...alt, note: `${PROVIDER_LABEL[s.provider]} was busy (${last.error.slice(0, 8)}); answered by ${PROVIDER_LABEL[backup]}.` }
    : last; // report the selected provider's error, which is what the user can act on
}

/** For tests only: callAi with an instant wait. */
export const __callAiForTests = (s: AiCoachSettings, req: AiRequest) => callAi(s, req, () => Promise.resolve());

/** One-line hint for a failed call, for Settings → Test AI connection. */
export function explainAiError(error: string, provider: AiProvider): string {
  if (/decommission|deprecat|not supported|does not support|not found|does not exist|no longer|unsupported|invalid model|model_not/i.test(error) || error.startsWith('HTTP 404')) {
    return `${error} — this model can’t be used. Tap “Find compatible models” and pick one.`;
  }
  if (error.startsWith('HTTP 401')) return `${error}: API key not accepted — paste it again.`;
  if (error.startsWith('HTTP 403')) {
    return provider === 'gemini'
      ? `${error}: key rejected — check the key, and that its website restriction includes this address.`
      : `${error}: access denied — check the key and your Groq account.`;
  }
  if (error.startsWith('HTTP 429')) return `${error}: rate limit or quota reached — wait a minute and try again.`;
  if (error.startsWith('HTTP 413')) return `${error}: request too large.`;
  if (error.startsWith('HTTP 400')) return `${error}: request rejected — check the API key and model name.`;
  if (error.startsWith('HTTP 5')) return `${error}: the service is busy or down — try again shortly.`;
  return error;
}

/** Tiny request to check key, model and speed. */
export async function testAi(s: AiCoachSettings): Promise<AiResult> {
  if (!isAiReady(s)) return { ok: false, error: 'AI is off — add a key and tick the consent box', ms: 0 };
  // No retry or fallback here: this checks exactly the selected key and model.
  return callProvider(s, s.provider, { user: 'Reply with the single word OK.', maxTokens: 16, thinking: 'off', timeoutMs: COACH_TIMEOUT_MS });
}

/** Parse JSON from a reply that may be wrapped in ``` fences or have text around it. Throws if none. */
export function extractJson(text: string): unknown {
  const t = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const start = t.search(/[[{]/);
  const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (start < 0 || end <= start) throw new Error('no JSON');
  return JSON.parse(t.slice(start, end + 1));
}

// ===== AI Voice-Dictation Parser =====
export async function parseQuickWithAI(rawText: string, settings: AiCoachSettings, defaultUnit: LoadUnit = 'lb'): Promise<{ entries: CircuitEntry[] | null; error?: string; note?: string }> {
  if (!isAiReady(settings)) return { entries: null };

  // A JSON *object* (not a bare array): Groq's JSON mode requires an object, and Gemini handles both.
  const prompt = `Extract ONLY real workout exercises from this spoken/typed log into JSON.
Preferred workout vocabulary to recognize and map phonetic slips to: treadmill, Leg press, Bench press, Push-ups, Hamstring curl, Tricep push-down, Surya Namaskar, Wall sit, incline, speed, sets, reps.
For treadmill, put speed (km/h; convert mph × 1.609) in "speedKmh" and incline percent in "inclinePct", keep the name plain (e.g. "Treadmill" or "Incline treadmill walk"), use unit "min" with sets 1 and rir null.
Fix speech-to-text errors (e.g. "22 fail" -> rir: 2; "12 fail" -> rir: 1; "32 fail" -> rir: 3; "0 to fail" -> rir: 0; "pound/lbs" or "£200" -> loadUnit: "lb" (load: 200); "kg/kilos" -> loadUnit: "kg"; if no unit is said, use loadUnit: "${defaultUnit}"; "to reb to fail" -> rir: 2).
Ignore accidental background speech or non-exercise gibberish (like "make a necklace"). If no real exercise is present, return {"exercises":[]}.

Return ONLY a valid JSON object:
{"exercises":[{"name":"Leg press","sets":3,"load":100,"loadUnit":"lb","reps":10,"unit":"reps","rir":2,"pain":0},
 {"name":"Treadmill","sets":1,"load":null,"loadUnit":"${defaultUnit}","reps":25,"unit":"min","rir":null,"pain":0,"speedKmh":5.5,"inclinePct":8}]}
Rules: load is number or null; loadUnit is "kg" or "lb"; unit is "reps", "min", or "sec"; rir is 0-4 or null; pain is 0-10; speedKmh and inclinePct only for treadmill (number or omit).

Workout log: "${rawText.slice(0, 1500)}"`;

  const r = await callAi(settings, { user: prompt, json: true, temperature: 0.1, maxTokens: 1024, thinking: 'off', timeoutMs: PARSE_TIMEOUT_MS });
  if (!r.ok) return { entries: null, error: `${aiLabel(settings)}: ${explainAiError(r.error, settings.provider)}` };
  try {
    const parsed = extractJson(r.text);
    const arr = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { exercises?: unknown }).exercises)
        ? (parsed as { exercises: unknown[] }).exercises
        : null;
    if (!arr) return { entries: null, error: 'Invalid AI JSON' };
    // Always mint fresh ids: never trust ids coming from the model.
    return { entries: arr.map((x) => normalizeEntry(x && typeof x === 'object' ? { ...x, id: undefined } : x, defaultUnit)).filter(isEntry), note: r.note };
  } catch {
    return { entries: null, error: 'Invalid AI JSON' };
  }
}

// ===== AI Coach =====
export async function askCoach(prompt: string, profile: Profile, settings: AiCoachSettings): Promise<{ text: string; isFallback: boolean; error?: string }> {
  if (!isAiReady(settings)) {
    const plan = buildTomorrowSuggestion(profile.circuitLogs, formatDateISO());
    return {
      isFallback: true,
      text: `**On-device summary** *(AI coach is off)*\n\n- **Tomorrow's focus:** ${plan.headline}\n- **Gym option:** ${plan.gymSuggestion}\n- **Home option:** ${plan.homeSuggestion}\n- **Why:** ${plan.rationale}`,
    };
  }
  const recent = profile.circuitLogs.slice(-6).map((w) => ({
    date: w.date,
    location: w.location,
    estKcal: w.estKcal,
    muscles: w.muscles,
    entries: w.entries.map((e) => `${e.name}: ${e.sets}×${e.reps}${e.unit}${e.load ? ` @ ${e.load}${e.loadUnit}` : ''}${e.speedKmh ? ` @ ${e.speedKmh} km/h` : ''}${e.inclinePct != null ? ` ${e.inclinePct}% incline` : ''}${e.rir !== null ? ` (${e.rir} to fail)` : ''}${e.pain > 0 ? ` pain ${e.pain}/10` : ''}`),
  }));
  const sys = `You are a concise, evidence-based strength and conditioning coach for a ${profile.age}-year-old (${profile.weightKg} kg, ${profile.mealPattern} schedule, protein target ${profile.proteinTargetG} g/day).
Tag major recommendations [Strong Consensus], [Emerging Evidence], or [Coaching Convention]. Never diagnose.
Recent circuits: ${JSON.stringify(recent)}`;

  const r = await callAi(settings, { system: sys, user: prompt.slice(0, 2000), thinking: 'low', timeoutMs: COACH_TIMEOUT_MS });
  if (r.ok) return { isFallback: false, text: r.note ? `${r.text}\n\n*(${r.note})*` : r.text };
  const label = aiLabel(settings);
  if (r.error.startsWith('HTTP')) {
    return { isFallback: true, error: r.error, text: `Could not reach ${label} — ${explainAiError(r.error, settings.provider)} (Settings → AI).` };
  }
  if (r.timedOut) return { isFallback: true, error: r.error, text: `${label} ${r.error}.` };
  return { isFallback: true, error: r.error, text: `Offline or network error (${r.error}).` };
}
