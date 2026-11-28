import { httpError, timedRequest, type AiRequest, type AiResult, type Connection } from './request';

// ===== Google Gemini (generateContent REST API) =====

/**
 * Newer Gemini models "think" before answering by default, which is what makes simple requests slow.
 * Turn it down per model family; unknown models get nothing (they may not support the field).
 */
export function thinkingConfigFor(model: string, thinking: AiRequest['thinking']): Record<string, unknown> | null {
  const m = model.toLowerCase();
  if (/gemini-2\.5/.test(m)) {
    if (/pro/.test(m)) return { thinkingBudget: 128 }; // Pro models can't switch thinking off
    return { thinkingBudget: thinking === 'off' ? 0 : 512 };
  }
  if (/gemini-(?:[3-9]|\d{2,})/.test(m)) return { thinkingLevel: 'low' };
  return null;
}

/** Text-chat models this key can call with generateContent (skips embedding/image/audio/live variants). */
export async function listGeminiModels(apiKey: string, signal?: AbortSignal): Promise<string[]> {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {
    headers: { 'x-goog-api-key': apiKey.trim() }, signal,
  });
  if (!res.ok) throw new Error(await httpError(res));
  const data = await res.json() as { models?: { name?: string; supportedGenerationMethods?: string[] }[] };
  return (data.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => String(m.name ?? '').replace(/^models\//, ''))
    .filter((n) => /^gemini/.test(n) && !/embedding|image|tts|audio|live|robotics|computer-use|vision/.test(n));
}

export function callGemini(conn: Connection, req: AiRequest): Promise<AiResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(conn.model)}:generateContent`;
  const thinkingConfig = thinkingConfigFor(conn.model, req.thinking);
  const base: Record<string, unknown> = {
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(req.maxTokens ? { maxOutputTokens: req.maxTokens } : {}),
  };
  return timedRequest(
    req,
    (signal, full) => {
      // Plain retry drops JSON mode and thinking control (the prompt still asks for JSON).
      const generationConfig = {
        ...base,
        ...(full && req.json ? { responseMimeType: 'application/json' } : {}),
        ...(full && thinkingConfig ? { thinkingConfig } : {}),
      };
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': conn.apiKey.trim() },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: req.user }] }],
          ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
          ...(Object.keys(generationConfig).length ? { generationConfig } : {}),
        }),
        signal,
      });
    },
    (data) => {
      const d = data as { candidates?: { content?: { parts?: { text?: unknown; thought?: boolean }[] } }[] };
      const parts = d?.candidates?.[0]?.content?.parts ?? [];
      return parts.filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text as string).join('');
    },
    'a faster model (e.g. a “flash-lite” one)',
  );
}
