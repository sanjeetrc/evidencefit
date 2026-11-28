// Ported from the throwaway rolldown scripts (see CLAUDE.md → Testing). Each check logs PASS/FAIL;
// the test fails if any check failed (the console output names which).
import { expect, it } from 'vitest';
import { createFreshState, exportSafeState, normalizeDriveSync, normalizeState } from '../lib/storage';
import { buildDriveDocText, buildDriveJson } from '../sync/driveContent';
import { __setTokenForTests, DriveError, isDriveConfigured, syncToDrive } from '../sync/googleDrive';

it('Google Drive sync content and REST flow', async () => {
  let fail = 0;
  const eq = (label: string, got: unknown, want: unknown) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) { fail++; console.log('FAIL', label, '\n   got ', JSON.stringify(got), '\n   want', JSON.stringify(want)); }
  };
  const has = (label: string, c: boolean, d = '') => { if (!c) { fail++; console.log('FAIL', label, d); } };

  // ---------- normalizeState with and without driveSync ----------
  const base = createFreshState('Secret Name', 66, 70);
  base.aiCoach = { ...base.aiCoach, apiKey: 'GEMINI-KEY', groqApiKey: 'GROQ-KEY', enabled: true, consentAt: 'x' };

  const without = normalizeState(JSON.parse(JSON.stringify(base)))!;
  has('without: loads', without !== null);
  eq('without: no driveSync key', 'driveSync' in without, false);

  const ID = '1AbCdEfGhIjKlMnOpQrStUv';
  const withSync = normalizeState({ ...JSON.parse(JSON.stringify(base)), driveSync: { enabled: true, folderId: ID, docId: ID + 'd', jsonId: ID + 'j', lastSyncAt: '2026-11-26T08:00:00.000Z', pendingSync: true } })!;
  eq('with: kept', withSync.driveSync, { enabled: true, folderId: ID, docId: ID + 'd', jsonId: ID + 'j', lastSyncAt: '2026-11-26T08:00:00.000Z', pendingSync: true });

  eq('junk dropped', normalizeDriveSync({ enabled: 'yes', folderId: 'x', docId: '../../etc', jsonId: 42, lastSyncAt: 'not a date', pendingSync: 'true', token: 'SECRET' }), { enabled: false });
  eq('not an object', normalizeDriveSync('on'), undefined);
  eq('array', normalizeDriveSync([1]), undefined);
  eq('round trip stable', normalizeState(JSON.parse(JSON.stringify(withSync)))!.driveSync, withSync.driveSync);
  eq('other fields unchanged by driveSync', withSync.profiles, without.profiles);

  // ---------- exportSafeState / JSON copy ----------
  const safe = exportSafeState(withSync);
  eq('export strips keys', [safe.aiCoach.apiKey, safe.aiCoach.groqApiKey, safe.aiCoach.enabled], ['', '', false]);
  eq('export keeps file IDs', safe.driveSync?.docId, ID + 'd');
  const p0 = withSync.profiles[0];
  p0.chatHistory = [{ id: 'm', role: 'user', text: 'private chat', timestamp: '' }];
  const json = buildDriveJson(withSync);
  has('json: no keys', !json.includes('GEMINI-KEY') && !json.includes('GROQ-KEY'));
  has('json: no chatHistory', !json.includes('chatHistory') && !json.includes('private chat'));
  has('json: restorable', normalizeState(JSON.parse(json)) !== null);

  // ---------- Doc text ----------
  const entry = { id: 'e', name: 'Leg press', sets: 3, reps: 10, unit: 'reps' as const, load: 100, loadUnit: 'lb' as const, rir: 2, pain: 0 };
  const wk = (date: string) => ({ id: date, date, location: 'Gym' as const, sleepHours: null, climate: 'Normal' as const, notes: '', entries: [entry], estKcal: 100, muscles: ['Quads' as const], benefits: [] });
  p0.circuitLogs = [wk('2026-11-26'), wk('2026-10-02'), wk('2026-09-30')]; // 55 days ago in, 57 days ago out
  p0.conditions.hypertension = true;
  p0.safetyChecks = { '2026-11-26': { at: 't', flags: ['dizzy'] } };
  const doc = buildDriveDocText(p0, new Date('2026-11-26T09:30:00'), '2026-11-26');
  console.log(doc);
  console.log('-----');
  has('doc: header first', doc.startsWith('Last synced 26 Nov 2026'), doc.split('\n')[0]);
  has('doc: 56 days', doc.includes('LAST 56 DAYS') && doc.includes('— 2 workouts'));
  has('doc: health included', doc.includes('Conditions: High blood pressure'));
  has('doc: safety line', doc.includes('Safety check: FLAGGED – Dizziness'));
  has('doc: no MY QUESTION', !doc.includes('MY QUESTION'));
  has('doc: no profile name', !doc.includes('Secret Name'));

  // ---------- syncToDrive against a fake Drive ----------
  // Vitest loads .env.local like a build does, so this follows whether a client ID is set there.
  eq('configured only when VITE_GOOGLE_CLIENT_ID is set', isDriveConfigured(), Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim()));
  type Call = { method: string; url: string; body: string };
  let calls: Call[] = [];
  let script: ((c: Call) => Response | undefined)[] = [];
  let n = 0;
  const setOnline = (v: boolean) => Object.defineProperty(globalThis, 'navigator', { value: { onLine: v }, configurable: true, writable: true });
  setOnline(true);
  (globalThis as any).fetch = async (url: string, init: any) => {
    const c = { method: init.method, url, body: String(init.body ?? '') };
    calls.push(c);
    const custom = script.shift()?.(c);
    if (custom) return custom;
    return new Response(JSON.stringify({ id: `NEWID${++n}xxxxxxxx` }), { status: 200 });
  };
  const content = { docText: 'DOC', json: '{"a":1}' };

  await (async () => {
    __setTokenForTests(null);
    try { await syncToDrive({}, content); has('no token throws', false); } catch (e) { eq('no token → auth', (e as DriveError).code, 'auth'); }
    __setTokenForTests('tok');

    // First run: folder + 2 multipart creates
    calls = []; n = 0;
    const ids = await syncToDrive({}, content);
    eq('first: 3 calls', calls.map((c) => c.method), ['POST', 'POST', 'POST']);
    has('first: folder', calls[0].body.includes('application/vnd.google-apps.folder') && calls[0].body.includes('"EvidenceFit"'));
    has('first: doc multipart', calls[1].url.includes('uploadType=multipart') && calls[1].body.includes('application/vnd.google-apps.document') && calls[1].body.includes('EvidenceFit Coach Log') && calls[1].body.includes('Content-Type: text/plain') && calls[1].body.includes('DOC'));
    has('first: json', calls[2].body.includes('evidencefit-data.json') && calls[2].body.includes('{"a":1}'));
    has('first: parent', calls[1].body.includes(`"parents":["${ids.folderId}"]`));

    // Later run: PATCH both in place
    calls = [];
    const again = await syncToDrive(ids, content);
    eq('update: 2 PATCH media', calls.map((c) => [c.method, c.url.includes(`/${ids.docId}?uploadType=media`) || c.url.includes(`/${ids.jsonId}?uploadType=media`)]), [['PATCH', true], ['PATCH', true]]);
    eq('update: same ids', again, ids);

    // Doc deleted in Drive → 404 → recreated in the folder
    calls = [];
    script = [() => new Response('{}', { status: 404 })];
    const re = await syncToDrive(ids, content);
    eq('404 doc: PATCH, POST create, PATCH json', calls.map((c) => c.method), ['PATCH', 'POST', 'PATCH']);
    has('404 doc: new doc id', re.docId !== ids.docId && re.jsonId === ids.jsonId);

    // Folder deleted too: create-in-folder 404 → recreate folder, then file
    calls = [];
    script = [() => new Response('{}', { status: 404 }), () => new Response('{}', { status: 404 })];
    const re2 = await syncToDrive(ids, content);
    eq('404 folder: PATCH, POST(file 404), POST folder, POST file, PATCH json', calls.map((c) => c.method), ['PATCH', 'POST', 'POST', 'POST', 'PATCH']);
    has('404 folder: new folder', re2.folderId !== ids.folderId);

    // 5xx once → retried automatically
    calls = [];
    script = [() => new Response('{}', { status: 503 })];
    await syncToDrive(ids, content);
    eq('503 retried once', calls.length, 3);

    // 5xx twice → server error (caller marks pendingSync)
    calls = [];
    script = [() => new Response('{}', { status: 503 }), () => new Response('{}', { status: 502 })];
    try { await syncToDrive(ids, content); has('5xx twice throws', false); } catch (e) { eq('5xx twice → server', (e as DriveError).code, 'server'); }

    // 401 → token dropped
    script = [() => new Response('{}', { status: 401 })];
    try { await syncToDrive(ids, content); } catch (e) { eq('401 → auth', (e as DriveError).code, 'auth'); }
    try { await syncToDrive(ids, content); } catch (e) { eq('after 401 token gone', (e as DriveError).code, 'auth'); }

    // Offline
    __setTokenForTests('tok');
    setOnline(false);
    try { await syncToDrive(ids, content); } catch (e) { eq('offline', (e as DriveError).code, 'offline'); }

    console.log(fail ? `${fail} FAILED` : 'ALL DRIVE TESTS PASSED');
  })();
  expect(fail, 'checks failed — see the FAIL lines above').toBe(0);
});
