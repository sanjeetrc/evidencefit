import { describe, expect, it, vi } from 'vitest';
import { askCoach, buildSystemPrompt } from './coach';
import { createBlankProfile } from '../domain/state';
import { runAudit } from '../domain/engine';

const profile = createBlankProfile('Private Person', 66, 74);
const audit = runAudit(profile);
const on = { enabled: true, apiKey: 'KEY123', model: 'm', consentAt: '2026-11-21' };
const noSleep = () => Promise.resolve();
const resp = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });

describe('AC-10 AI coach', () => {
  it('AC-10.1 makes no network call when off, without consent, or without a key', async () => {
    const f = vi.fn();
    for (const settings of [{ ...on, enabled: false }, { ...on, consentAt: null }, { ...on, apiKey: ' ' }]) {
      const r = await askCoach({ prompt: 'hi', profile, audit, settings, fetchImpl: f, sleep: noSleep });
      expect(r.isFallback).toBe(true);
    }
    expect(f).not.toHaveBeenCalled();
  });
  it('AC-10.2 sends the key in a header, never in the URL', async () => {
    const f = vi.fn().mockResolvedValue(resp(200, { candidates: [{ content: { parts: [{ text: 'ok' }] } }] }));
    const r = await askCoach({ prompt: 'hi', profile, audit, settings: on, fetchImpl: f, sleep: noSleep });
    expect(r).toEqual({ text: 'ok', isFallback: false });
    const [url, init] = f.mock.calls[0];
    expect(url).not.toContain('KEY123');
    expect(init.headers['x-goog-api-key']).toBe('KEY123');
  });
  it('AC-10.3 does not retry a 403 (bad key); retries a 503 up to 4 attempts', async () => {
    const f403 = vi.fn().mockResolvedValue(resp(403));
    const r = await askCoach({ prompt: 'hi', profile, audit, settings: on, fetchImpl: f403, sleep: noSleep });
    expect(f403).toHaveBeenCalledTimes(1);
    expect(r.text).toMatch(/check the API key/);
    const f503 = vi.fn().mockResolvedValue(resp(503));
    await askCoach({ prompt: 'hi', profile, audit, settings: on, fetchImpl: f503, sleep: noSleep });
    expect(f503).toHaveBeenCalledTimes(4);
  });
  it('AC-10.4 prompt omits the person\'s name (data minimisation)', () => {
    expect(buildSystemPrompt(profile, audit)).not.toContain('Private Person');
  });
});
