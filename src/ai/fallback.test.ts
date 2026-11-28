import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultAiSettings } from '../lib/storage';
import type { AiCoachSettings } from '../types';
import { __callAiForTests, backupProvider, isTransientAiError, parseQuickWithAI, testAi } from './index';

const gemini: AiCoachSettings = { ...createDefaultAiSettings(), enabled: true, provider: 'gemini', apiKey: 'gk', consentAt: '2026-11-26' };
const withGroq: AiCoachSettings = { ...gemini, groqApiKey: 'qk', groqConsentAt: '2026-11-26' };
const REQ = { user: 'hi', thinking: 'off' as const, timeoutMs: 45_000 };

const geminiOk = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
const groqOk = (text: string) => new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 });
const fail = (status: number) => new Response(JSON.stringify({ error: { message: status === 503 ? 'The model is overloaded.' : 'nope' } }), { status });

/** Stub fetch with a queue of replies per host; records which host each call went to. */
function stub(replies: { gemini?: Response[]; groq?: Response[] }) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', (url: string) => {
    const host = url.includes('groq') ? 'groq' : 'gemini';
    calls.push(host);
    const next = replies[host]?.shift();
    return Promise.resolve(next ?? fail(500));
  });
  return calls;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('isTransientAiError / backupProvider', () => {
  it('treats 5xx and 429 as busy, not 400/401/404', () => {
    expect(['HTTP 503 — overloaded', 'HTTP 500', 'HTTP 429 — quota', 'HTTP 502', 'HTTP 504'].every(isTransientAiError)).toBe(true);
    expect(['HTTP 400', 'HTTP 401', 'HTTP 404 — not found', 'Offline', 'took longer than 25s'].some(isTransientAiError)).toBe(false);
  });

  it('only offers the other provider when it has its own key and consent', () => {
    expect(backupProvider(gemini)).toBeNull();
    expect(backupProvider({ ...gemini, groqApiKey: 'qk' })).toBeNull(); // key but no consent
    expect(backupProvider(withGroq)).toBe('groq');
    expect(backupProvider({ ...withGroq, provider: 'groq' })).toBe('gemini');
  });
});

describe('callAi fallback', () => {
  it('Gemini 503 then OK → retried once, answer notes the second try', async () => {
    const calls = stub({ gemini: [fail(503), geminiOk('hello')] });
    const r = await __callAiForTests(gemini, REQ);
    expect(r.ok && r.text).toBe('hello');
    expect(r.note).toMatch(/second try/);
    expect(calls).toEqual(['gemini', 'gemini']);
  });

  it('Gemini 503 twice + Groq set up → Groq answers', async () => {
    const calls = stub({ gemini: [fail(503), fail(503)], groq: [groqOk('from groq')] });
    const r = await __callAiForTests(withGroq, REQ);
    expect(r.ok && r.text).toBe('from groq');
    expect(r.note).toMatch(/answered by Groq/);
    expect(calls).toEqual(['gemini', 'gemini', 'groq']);
  });

  it('Gemini 503 twice, Groq not consented → Gemini error, Groq never called', async () => {
    const calls = stub({ gemini: [fail(503), fail(503)], groq: [groqOk('x')] });
    const r = await __callAiForTests({ ...gemini, groqApiKey: 'qk' }, REQ);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/^HTTP 503/);
    expect(calls).toEqual(['gemini', 'gemini']);
  });

  it('backup also failing → reports the selected provider error', async () => {
    stub({ gemini: [fail(503), fail(503)], groq: [fail(500)] });
    const r = await __callAiForTests(withGroq, REQ);
    expect(!r.ok && r.error).toMatch(/^HTTP 503/);
  });

  it('401 (bad key) is not retried and does not fall back', async () => {
    const calls = stub({ gemini: [fail(401)], groq: [groqOk('x')] });
    const r = await __callAiForTests(withGroq, REQ);
    expect(!r.ok && r.error).toMatch(/^HTTP 401/);
    expect(calls).toEqual(['gemini']);
  });

  it('Settings "Test AI connection" checks only the selected provider (no retry, no fallback)', async () => {
    const calls = stub({ gemini: [fail(503)], groq: [groqOk('OK')] });
    const r = await testAi(withGroq);
    expect(!r.ok && r.error).toMatch(/^HTTP 503/);
    expect(calls).toEqual(['gemini']);
  });

  it('Quick-Log parse passes the note through', async () => {
    vi.useFakeTimers();
    try {
      stub({ gemini: [fail(503), fail(503)], groq: [groqOk('{"exercises":[{"name":"Leg press","sets":3,"reps":10,"load":100}]}')] });
      const p = parseQuickWithAI('leg press 100 3x10', withGroq);
      await vi.advanceTimersByTimeAsync(2000);
      const r = await p;
      expect(r.entries?.map((e) => [e.name, e.load, e.loadUnit])).toEqual([['Leg press', 100, 'lb']]);
      expect(r.note).toMatch(/answered by Groq/);
    } finally {
      vi.useRealTimers();
    }
  });
});
