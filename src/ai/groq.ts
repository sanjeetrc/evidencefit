import { httpError, timedRequest, type AiRequest, type AiResult, type Connection } from './request';

// ===== Groq (OpenAI-compatible chat completions API) =====
export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/** Active text-chat models for this key (skips speech, TTS and safety-classifier models). */
export async function listGroqModels(apiKey: string, signal?: AbortSignal): Promise<string[]> {
  const res = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { Authorization: `Bearer ${apiKey.trim()}` }, signal,
  });
  if (!res.ok) throw new Error(await httpError(res));
  const data = await res.json() as { data?: { id?: string; active?: boolean }[] };
  return (data.data ?? [])
    .filter((m) => m.active !== false && typeof m.id === 'string')
    .map((m) => m.id as string)
    .filter((id) => !/whisper|tts|playai|orpheus|guard|safeguard|distil/i.test(id))
    .sort();
}

/** Reasoning models on Groq: keep their thinking short so replies stay fast. Others get nothing. */
export function groqReasoningFor(model: string, thinking: AiRequest['thinking']): Record<string, unknown> | null {
  const m = model.toLowerCase();
  if (/gpt-oss/.test(m)) return { reasoning_effort: 'low' };
  if (/qwen3/.test(m)) return { reasoning_effort: thinking === 'off' ? 'none' : 'default' };
  return null;
}

/** Some reasoning models put their thinking inline as <think>…</think>; drop it. */
export const stripThink = (s: string) => s.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

export function callGroq(conn: Connection, req: AiRequest): Promise<AiResult> {
  const reasoning = groqReasoningFor(conn.model, req.thinking);
  const messages = [
    ...(req.system ? [{ role: 'system', content: req.system }] : []),
    { role: 'user', content: req.user },
  ];
  return timedRequest(
    req,
    // Plain retry drops JSON mode and reasoning settings, and uses the older max_tokens name.
    (signal, full) => fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${conn.apiKey.trim()}` },
      body: JSON.stringify({
        model: conn.model,
        messages,
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.maxTokens ? (full ? { max_completion_tokens: req.maxTokens } : { max_tokens: req.maxTokens }) : {}),
        ...(full && req.json ? { response_format: { type: 'json_object' } } : {}),
        ...(full && reasoning ? reasoning : {}),
      }),
      signal,
    }),
    (data) => {
      const d = data as { choices?: { message?: { content?: unknown } }[] };
      const content = d?.choices?.[0]?.message?.content;
      return typeof content === 'string' ? stripThink(content) : '';
    },
    'a smaller model (e.g. llama-3.1-8b-instant)',
  );
}
