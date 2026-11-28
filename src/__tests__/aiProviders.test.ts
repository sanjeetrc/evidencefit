// Ported from the throwaway rolldown scripts (see CLAUDE.md → Testing). Each check logs PASS/FAIL;
// the test fails if any check failed (the console output names which).
import { expect, it } from 'vitest';
import { askCoach, explainAiError, isAiReady, listCompatibleModels, parseQuickWithAI, testAi } from '../ai/index';
import { thinkingConfigFor } from '../ai/gemini';
import { groqReasoningFor, stripThink } from '../ai/groq';
import { createFreshState, normalizeState } from '../lib/storage';

it('AI providers (Gemini/Groq) with stubbed fetch', async () => {
  let fail = 0;
  const eq = (label: string, got: unknown, want: unknown) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) { fail++; console.log('FAIL', label, '\n   got ', JSON.stringify(got), '\n   want', JSON.stringify(want)); }
  };

  // --- model-specific speed settings ---
  eq('2.5 flash off', thinkingConfigFor('gemini-2.5-flash', 'off'), { thinkingBudget: 0 });
  eq('2.5 pro', thinkingConfigFor('gemini-2.5-pro', 'off'), { thinkingBudget: 128 });
  eq('3.5 flash-lite', thinkingConfigFor('gemini-3.5-flash-lite', 'off'), { thinkingLevel: 'low' });
  eq('2.0 flash none', thinkingConfigFor('gemini-2.0-flash', 'off'), null);
  eq('groq llama none', groqReasoningFor('llama-3.3-70b-versatile', 'off'), null);
  eq('groq gpt-oss', groqReasoningFor('openai/gpt-oss-20b', 'off'), { reasoning_effort: 'low' });
  eq('groq qwen3 off', groqReasoningFor('qwen/qwen3-32b', 'off'), { reasoning_effort: 'none' });
  eq('strip think', stripThink('<think>hmm\nok</think>{"exercises":[]}'), '{"exercises":[]}');
  eq('explain 401 groq', explainAiError('HTTP 401', 'groq').includes('key'), true);

  // --- storage: old data (no provider fields) loads as Gemini, unchanged ---
  const fresh = createFreshState();
  const old = JSON.parse(JSON.stringify(fresh));
  old.aiCoach = { enabled: true, apiKey: 'gk', model: 'gemini-2.5-flash', consentAt: '2026-01-01' };
  const n = normalizeState(old)!;
  eq('old settings migrate', n.aiCoach, { enabled: true, provider: 'gemini', apiKey: 'gk', model: 'gemini-2.5-flash', consentAt: '2026-01-01', groqApiKey: '', groqModel: 'llama-3.3-70b-versatile', groqConsentAt: null });
  eq('old settings still ready', isAiReady(n.aiCoach), true);
  // Gemini consent does not count for Groq
  const switched = normalizeState({ ...old, aiCoach: { ...old.aiCoach, provider: 'groq', groqApiKey: 'qk' } })!;
  eq('groq needs its own consent', [switched.aiCoach.enabled, isAiReady(switched.aiCoach)], [false, false]);
  const groqOn = normalizeState({ ...old, aiCoach: { ...old.aiCoach, provider: 'groq', groqApiKey: 'qk', groqConsentAt: '2026-11-24' } })!;
  eq('groq with consent ready', isAiReady(groqOn.aiCoach), true);

  // --- stubbed network ---
  const sent: { url: string; headers: Record<string, string>; body: any }[] = [];
  let mode: 'ok' | '400then-ok' = 'ok';
  const PARSE_JSON = '{"exercises":[{"name":"Leg press","sets":3,"reps":10}]}';
  (globalThis as any).fetch = (url: string, init: any) => {
    const body = JSON.parse(init.body);
    sent.push({ url, headers: init.headers, body });
    const isGroq = url.includes('groq');
    const hasExtras = isGroq ? 'reasoning_effort' in body : !!body.generationConfig?.thinkingConfig;
    if (mode === '400then-ok' && hasExtras) return Promise.resolve(new Response('{}', { status: 400 }));
    const prompt: string = isGroq ? body.messages[body.messages.length - 1].content : body.contents[0].parts[0].text;
    const text = prompt.startsWith('Extract') ? PARSE_JSON : 'OK';
    const payload = isGroq
      ? { choices: [{ message: { content: text } }] }
      : { candidates: [{ content: { parts: [{ text: 'thinking…', thought: true }, { text }] } }] };
    return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
  };

  const gem = { ...fresh.aiCoach, enabled: true, consentAt: 'x', apiKey: 'gk', model: 'gemini-3.5-flash-lite' };
  const groq = { ...fresh.aiCoach, enabled: true, provider: 'groq' as const, groqConsentAt: 'x', groqApiKey: 'qk', groqModel: 'llama-3.3-70b-versatile' };

  await (async () => {
    // Gemini
    let p = await parseQuickWithAI('leg press 3x10', gem);
    eq('gemini parse', p.entries?.[0]?.name, 'Leg press');
    eq('gemini key header', sent[0].headers['x-goog-api-key'], 'gk');
    eq('gemini config', sent[0].body.generationConfig, { temperature: 0.1, maxOutputTokens: 1024, responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'low' } });

    // Groq parse
    sent.length = 0;
    p = await parseQuickWithAI('leg press 3x10', groq);
    eq('groq parse', p.entries?.[0]?.name, 'Leg press');
    eq('groq url', sent[0].url, 'https://api.groq.com/openai/v1/chat/completions');
    eq('groq auth', sent[0].headers.Authorization, 'Bearer qk');
    eq('groq body', [sent[0].body.model, sent[0].body.response_format, sent[0].body.max_completion_tokens, sent[0].body.temperature, 'reasoning_effort' in sent[0].body],
      ['llama-3.3-70b-versatile', { type: 'json_object' }, 1024, 0.1, false]);
    eq('groq never sees gemini key', JSON.stringify(sent[0]).includes('gk'), false);

    // Groq coach: system + user messages
    sent.length = 0;
    const c = await askCoach('hi', fresh.profiles[0], groq);
    eq('groq coach', [c.isFallback, c.text, sent[0].body.messages.map((m: any) => m.role)], [false, 'OK', ['system', 'user']]);

    // Groq reasoning model rejected setting → retried without it
    sent.length = 0; mode = '400then-ok';
    const t = await testAi({ ...groq, groqModel: 'openai/gpt-oss-20b' });
    eq('groq 400 → retry', [t.ok, sent.length, 'reasoning_effort' in sent[0].body, 'reasoning_effort' in sent[1].body], [true, 2, true, false]);
    mode = 'ok';

    // Off → no network call
    sent.length = 0;
    eq('off: no call', [(await testAi({ ...groq, enabled: false })).ok, sent.length], [false, 0]);

    // --- "model not compatible" handling ---
    // JSON mode rejected → plain retry (no response_format, max_tokens), reply with prose around JSON still parses
    (globalThis as any).fetch = (url: string, init: any) => {
      const body = JSON.parse(init.body);
      sent.push({ url, headers: init.headers, body });
      if (body.response_format) return Promise.resolve(new Response(JSON.stringify({ error: { message: 'json mode is not supported with this model' } }), { status: 400 }));
      return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: 'Here you go:\n```json\n' + PARSE_JSON + '\n```' } }] }), { status: 200 }));
    };
    sent.length = 0;
    p = await parseQuickWithAI('leg press 3x10', groq);
    eq('json mode rejected → plain retry parses', [p.entries?.[0]?.name, sent.length, 'response_format' in sent[1].body, sent[1].body.max_tokens], ['Leg press', 2, false, 1024]);

    // Decommissioned model → message from the API + hint
    (globalThis as any).fetch = () => Promise.resolve(new Response(JSON.stringify({ error: { message: 'The model `llama-old` has been decommissioned and is no longer supported.', code: 'model_decommissioned' } }), { status: 400 }));
    const bad = await testAi({ ...groq, groqModel: 'llama-old' });
    const why = bad.ok ? '' : explainAiError(bad.error, 'groq');
    eq('decommissioned explained', [why.includes('decommissioned'), why.includes('Find compatible models')], [true, true]);

    // Model lists
    (globalThis as any).fetch = (url: string) => Promise.resolve(new Response(JSON.stringify(url.includes('groq')
      ? { data: [{ id: 'llama-3.1-8b-instant', active: true }, { id: 'whisper-large-v3', active: true }, { id: 'old-model', active: false }, { id: 'meta-llama/llama-guard-4-12b', active: true }, { id: 'openai/gpt-oss-20b', active: true }] }
      : { models: [
        { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent', 'countTokens'] },
        { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
        { name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3-flash', supportedGenerationMethods: ['generateContent'] },
      ] }), { status: 200 }));
    eq('groq model list', (await listCompatibleModels(groq)).models, ['llama-3.1-8b-instant', 'openai/gpt-oss-20b']);
    eq('gemini model list', (await listCompatibleModels(gem)).models, ['gemini-2.5-flash', 'gemini-3-flash']);
    (globalThis as any).fetch = () => Promise.resolve(new Response(JSON.stringify({ error: { message: 'Invalid API Key' } }), { status: 401 }));
    eq('model list bad key', (await listCompatibleModels(groq)).error?.includes('Invalid API Key'), true);

    console.log(fail ? `${fail} FAILED` : 'ALL AI PROVIDER TESTS PASSED');
  })();
  expect(fail, 'checks failed — see the FAIL lines above').toBe(0);
});
