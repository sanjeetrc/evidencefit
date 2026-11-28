// Smoke test on a phone-sized screen: serves dist/ under /evidencefit/ and checks the key journeys.
// Usage: npm run build && node e2e/smoke.mjs   (Playwright from the project or NODE_PATH)
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const { preview } = await import('vite');

const PORT = 4190;
const OUT = process.env.E2E_OUT || 'e2e/out';
mkdirSync(OUT, { recursive: true });
const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'silent' });
const URL0 = `http://localhost:${PORT}/evidencefit/`;
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
const browser = await chromium.launch();
const errors = [];
const newPage = async () => {
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  return page;
};
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const nav = (page, n) => page.getByRole('button', { name: n, exact: true }).last().click();

try {
  // A: first run, Today has no symptom check, walk logging works
  let page = await newPage();
  await page.goto(URL0);
  await page.getByLabel('Your name').fill('Test');
  await page.getByLabel('Age').fill('66');
  await page.getByLabel('Weight (kg)').fill('74');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByText(/Next Suggested Focus/).first().waitFor();
  check('A1 Today opens with the 4173 suggestion card', await page.getByText(/Next Suggested Focus/).first().isVisible());
  check('A2 no "Before you train" symptom check', (await page.getByText(/Before you train/i).count()) === 0);
  check('A3 walk card present', await page.getByRole('heading', { name: 'Walk or cardio' }).isVisible());
  await page.getByLabel('Time of day').selectOption('Evening');
  await page.getByLabel('Walk minutes').fill('30');
  await page.getByLabel('Walk speed km per hour').fill('4.8');
  check('A4 distance worked out from speed', await page.getByText('That is 2.4 km at 4.8 km/h.').isVisible());
  await page.getByRole('button', { name: 'Save walk' }).click();
  check('A5 walk saved and listed', await page.getByText(/Evening walk \(road\)/).first().isVisible() && await page.getByText(/30 min · 2\.4 km at 4\.8 km\/h/).isVisible());
  const st = JSON.parse(await page.evaluate(() => localStorage.getItem('evidencefit_app_state_v1')));
  const w = st.profiles[0].circuitLogs.find((x) => x.entries[0].name === 'Evening walk (road)');
  check('A6 walk stored as a circuit with speed and kcal', !!w && w.entries[0].speedKmh === 4.8 && w.entries[0].unit === 'min' && w.estKcal > 50, w ? `${w.estKcal} kcal` : 'missing');
  await page.screenshot({ path: `${OUT}/today.png`, fullPage: true });

  // B: Restore from Google Drive (Google mocked)
  const driveCalls = [];
  await page.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body:
    "window.google={accounts:{oauth2:{initTokenClient:(c)=>(window.__cid=c.client_id,window.__scope=c.scope,{requestAccessToken:()=>setTimeout(()=>c.callback({access_token:'tok'}),10)}),revoke:(t,d)=>{window.__revoked=t;d&&d();}}}};" }));
  const y = new Date(); y.setDate(y.getDate() - 1);
  await page.route('https://www.googleapis.com/drive/v3/files**', (r) => {
    const u = r.request().url(); driveCalls.push({ u, auth: r.request().headers()['authorization'] });
    if (u.includes('alt=media')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: 2, activeProfileId: 'g1', aiCoach: { apiKey: 'FILE-KEY' },
      profiles: [{ id: 'g1', name: 'From Drive', age: 66, weightKg: 74, conditions: {}, medications: {}, defaultLoadUnit: 'lb', proteinLogs: {},
        circuitLogs: [{ id: 'c1', date: iso(y), location: 'Gym', climate: 'Normal', notes: '', entries: [{ id: 'e1', name: 'Leg press', sets: 3, load: 140, loadUnit: 'lb', reps: 9, unit: 'reps', rir: 1, pain: 0 }] }] }] }) });
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ files: [{ id: 'FILEID', modifiedTime: '2026-11-28T04:35:38Z', size: '900' }] }) });
  });
  await nav(page, 'Settings');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Restore from Google Drive' }).click();
  await page.getByText('Restored from Google Drive.').waitFor({ timeout: 10000 });
  check('B1 Drive restore uses the built-in client ID, read-only', (await page.evaluate(() => window.__cid)) === '911891516673-ebnqcbm5so459ouimcsorcl16ru7dfc6.apps.googleusercontent.com'
    && (await page.evaluate(() => window.__scope)) === 'https://www.googleapis.com/auth/drive.readonly');
  check('B2 finds evidencefit-data.json with the token', driveCalls.length === 2 && driveCalls.every((c) => c.auth === 'Bearer tok') && driveCalls[0].u.includes('evidencefit-data.json'));
  check('B3 access revoked after download', (await page.evaluate(() => window.__revoked)) === 'tok');
  const st2 = await page.evaluate(() => localStorage.getItem('evidencefit_app_state_v1'));
  check('B4 restored data in place, file key not kept', st2.includes('From Drive') && st2.includes('Leg press') && !st2.includes('FILE-KEY'));
  check('B5 undo copy offered', await page.getByRole('button', { name: /Undo last restore/ }).isVisible());

  // C: data saved by the plan-based version (28 Nov) still loads
  page = await newPage();
  await page.goto(URL0);
  await page.evaluate((d) => localStorage.setItem('evidencefit_app_state_v1', JSON.stringify({ version: 2, activeProfileId: 'p1', aiCoach: { enabled: false, apiKey: '', model: 'x', consentAt: null },
    profiles: [{ id: 'p1', name: 'Old', age: 66, weightKg: 74, mealPattern: '3-meal', proteinTargetG: 104, conditions: {}, redFlags: {}, medications: {}, programVersion: 3, program: {},
      proteinLogs: { [d]: [{ id: 'f1', mealSlot: 'Lunch', name: 'Fish: 2 medium pieces', grams: 28 }] }, benchmarks: [], chatHistory: [],
      workouts: [{ id: 'w1', date: d, dayKey: 'Fri', title: 'Gym A', location: 'Gym', sleepHours: 7, restingHr: null, climate: 'Normal', notes: '',
        exercises: [{ exerciseId: 'x1', name: 'Leg press', repMin: 10, repMax: 12, unit: 'reps', targetRpe: 7, loadUnit: 'kg',
          sets: [{ loadKg: 60, reps: 12, rpe: 7, pain: 0 }, { loadKg: 60, reps: 11, rpe: 8, pain: 1 }] },
          { exerciseId: 'x2', name: 'Walk, road (evening)', repMin: 30, repMax: 30, unit: 'min', targetRpe: 4, cardio: { activity: 'Walk', surface: 'Road', timeOfDay: 'Evening', distanceKm: null, speedKmh: 4.8 },
            sets: [{ loadKg: 0, reps: 30, rpe: 4, pain: 0 }] }] }] }] })), iso(y));
  await page.reload();
  await page.getByText(/Next Suggested Focus/).first().waitFor();
  const st3 = JSON.parse(await page.evaluate(() => localStorage.getItem('evidencefit_app_state_v1')));
  const c = st3.profiles[0].circuitLogs?.[0];
  check('C1 plan-version session converted to a circuit', !!c && c.entries.length === 2 && c.entries[0].sets === 2 && c.entries[0].load === 60 && c.entries[0].rir === 2 && c.entries[0].pain === 1,
    c ? JSON.stringify(c.entries[0]) : 'none');
  check('C2 walk speed kept', !!c && c.entries[1].speedKmh === 4.8 && c.entries[1].unit === 'min');
  check('C3 protein kept', JSON.stringify(st3.profiles[0].proteinLogs).includes('Fish: 2 medium pieces'));
  check('No page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('Run completed', false, String(e).slice(0, 300));
} finally {
  await browser.close();
  await server.close();
  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
}
