// End-to-end smoke test of the critical journeys on a phone-sized screen.
// Usage: npm run build && npm run e2e   (serves dist/ with `vite preview`)
import { createRequire } from 'node:module';
// Uses the project's playwright if installed, else the machine's global one (via NODE_PATH).
const { chromium, devices } = createRequire(import.meta.url)('playwright');
import { preview } from 'vite';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const PORT = 4179;
const OUT = process.env.E2E_OUT || 'e2e/out';
mkdirSync(OUT, { recursive: true });
const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'silent' });

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });

try {
  await page.goto(`http://localhost:${PORT}/`);

  // J1: first run
  await page.getByLabel('Your name').fill('Test User');
  await page.getByLabel('Age').fill('66');
  await page.getByLabel('Weight (kg)').fill('74');
  await shot('01-welcome');
  await page.getByRole('button', { name: 'Start' }).click();
  check('J1 first run creates profile', await page.getByRole('heading', { name: "Today's readiness" }).isVisible());

  // J2: protein logging, 60+ per-meal target
  await page.getByRole('button', { name: 'Fish', exact: true }).click();
  check('J2 fish offers small / medium / large piece', (await page.getByRole('group', { name: 'Fish piece size' }).getByRole('button').count()) === 3);
  await page.getByRole('button', { name: 'More pieces' }).click();
  await page.getByRole('button', { name: 'Add 2 medium pieces: 28 g protein' }).click();
  await page.getByRole('button', { name: 'Paneer', exact: true }).click();
  await page.getByRole('group', { name: 'Paneer piece size' }).getByRole('button', { name: /^Large piece/ }).click();
  await page.getByRole('button', { name: 'More pieces' }).click();
  await page.getByRole('button', { name: 'More pieces' }).click();
  await page.getByRole('button', { name: 'Add 3 large pieces: 15 g protein' }).click();
  check('J2 pieces add to today (2 medium fish + 3 large paneer = 43 g)', (await page.locator('text=43 g').first().count()) > 0);
  await page.getByRole('button', { name: 'One less: Paneer: 3 large pieces' }).click();
  check('J2 minus takes one piece off', await page.getByText('Paneer: 2 large pieces').isVisible() && (await page.locator('text=38 g').first().count()) > 0);
  await page.getByRole('button', { name: 'One more: Paneer: 2 large pieces' }).click();
  await page.getByRole('button', { name: /^Remove Paneer/ }).click();
  check('J2 remove takes it off', (await page.getByRole('button', { name: /^Remove Paneer/ }).count()) === 0 && (await page.locator('text=28 g').first().count()) > 0);
  await page.getByRole('button', { name: 'Undo' }).click();
  check('J2 undo puts it back', (await page.locator('text=43 g').first().count()) > 0);
  check('J2 60+ per-meal target shown (0.4 g/kg = 30 g)', await page.getByText(/at least 30 g at each meal/).isVisible());

  // J3: log Monday's session with "done as planned", save, see it in history
  await page.getByLabel('Session template').selectOption('Mon');
  await page.getByLabel('Sleep hours').fill('7');
  const leg = page.getByRole('article', { name: 'Leg press' });
  await leg.getByLabel('Leg press set 1 load kg').fill('60');
  await leg.getByRole('button', { name: 'Done as planned' }).click();
  await leg.getByLabel('Leg press set 2 pain 0 to 10').fill('2');
  await leg.getByRole('button', { name: 'How to score pain' }).click();
  check('J3 pain guide explains the scale', await leg.getByText(/Effort, burning muscles and breathlessness are not pain/).isVisible());
  await leg.getByRole('group', { name: 'Leg press pain side' }).getByRole('button', { name: 'Left' }).click();
  await leg.getByLabel('Leg press pain area').selectOption('Knee');
  check('J3 mild pain guidance shown', await leg.getByText(/Mild pain \(2\/10\)/).isVisible());
  check('J3 push-ups and triceps push-down in Monday plan',
    (await page.getByRole('article', { name: /^Push-ups/ }).count()) === 1 && (await page.getByRole('article', { name: 'Cable triceps push-down' }).count()) === 1);
  const pd = page.getByRole('article', { name: 'Cable triceps push-down' });
  await pd.getByRole('group', { name: 'Cable triceps push-down weight unit' }).getByRole('button', { name: 'lb' }).click();
  await pd.getByLabel('Cable triceps push-down set 1 load lb').fill('50');
  await pd.getByRole('button', { name: 'Done as planned' }).click();
  await shot('02-today-logger');
  await page.getByRole('button', { name: 'Save session' }).click();
  check('J3 session saved', await page.getByText(/Session saved: 2 exercise/).isVisible());
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Progress' }).click();
  check('J3 session in history', await page.getByText(/Leg press 3×/).isVisible());
  // (weights typed once carry to the following sets: checked in the backup below)
  await shot('03-progress');

  // J4: health screen drives warnings (glaucoma → avoid head-down Surya Namaskar)
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Settings' }).click();
  await page.getByText('Glaucoma / retinal condition').click();
  await page.getByText('Cardiovascular disease').click();
  check('J4 screening shows vigorous restriction', await page.getByText('Moderate work is fine; vigorous needs clearance').first().isVisible());
  await shot('04-settings');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Today' }).click();
  await page.getByLabel('Session template').selectOption('Tue');
  const surya = page.getByRole('article', { name: /Surya Namaskar/ });
  check('J4 glaucoma flags Surya Namaskar', await surya.getByText(/Avoid: Head-down/).isVisible());
  const row = page.getByRole('article', { name: 'Dumbbell one-arm row' });
  check('J4 one-arm row has separate left and right sets',
    (await row.getByLabel('Dumbbell one-arm row set 1 left reps').count()) === 1 && (await row.getByLabel('Dumbbell one-arm row set 2 right reps').count()) === 1);
  check('J4 band triceps push-down on the home day', (await page.getByRole('article', { name: 'Band triceps push-down' }).count()) === 1);
  await page.getByLabel('Session template').selectOption('Wed');
  const intervals = page.getByRole('article', { name: /Intervals/ });
  check('J4 intervals blocked until cleared', await intervals.getByText(/Avoid: Vigorous/).isVisible());
  check('J4 RPE capped at 6', await page.getByText(/RPE 6 \(capped\)/).first().isVisible());

  // J9: evening road walk at 4.8 km/h
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Today' }).click();
  await page.getByLabel('Time of day').selectOption('Evening');
  await page.getByLabel('Cardio minutes').fill('30');
  await page.getByLabel('Speed km per hour').fill('4.8');
  check('J9 distance worked out from speed', await page.getByText(/That is 2\.4 km at 4\.8 km\/h/).isVisible());
  await page.getByRole('button', { name: 'Save walk' }).click();
  check('J9 walk listed on Today', await page.getByText('road: 30 min · 2.4 km · 4.8 km/h').isVisible());
  await shot('07-walk');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Progress' }).click();
  check('J9 walk shown in Progress', (await page.getByText(/Evening walk, road: 30 min · 2\.4 km · 4\.8 km\/h/).count()) > 0);
  check('J9 counts toward aerobic minutes', (await page.getByText(/^30 \/ 150\+$/).count()) > 0 || (await page.locator('text=/\b30 \/ 150\+/').count()) > 0);

  // J11: "Before you train" symptom check
  const nav = (n) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: n }).click();
  await nav('Today');
  check('J11 symptom check shown before training', await page.getByRole('heading', { name: 'Before you train' }).isVisible());
  await page.getByLabel('Dizziness, light-headedness or fainting').check();
  await page.getByRole('button', { name: 'Save: I have this' }).click();
  check('J11 a warning sign means no exercise today', await page.getByRole('alert').getByText('Do not exercise today').isVisible());
  await shot('08-symptom-stop');
  await page.getByRole('alert').getByRole('button', { name: 'Change' }).click();
  await page.getByLabel('Dizziness, light-headedness or fainting').uncheck();
  await page.getByRole('button', { name: 'None of these: I feel fine' }).click();
  check('J11 all clear is recorded', await page.getByText(/Before you train: checked.*no warning signs/).isVisible());

  // J12: log for an earlier day
  const yLabel = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(12); return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); });
  await page.getByRole('group', { name: 'Logging for' }).getByRole('button', { name: 'Yesterday' }).click();
  check('J12 earlier day is clearly marked', await page.getByText(new RegExp(`Logging for \\w+ ${yLabel}\\. Sessions, walks and protein`)).isVisible());
  check('J12 protein card follows the chosen day', await page.getByRole('heading', { name: `Protein on ${yLabel}` }).isVisible());
  check('J12 symptom check only for today', (await page.getByRole('heading', { name: 'Before you train' }).count()) === 0);

  // J13: type the whole circuit, read offline, save to the chosen day
  await page.getByText('Type or say the whole circuit').click();
  await page.getByLabel('Circuit in your words').fill('leg press 40 kg 3 by 12 rir 2, plank 3 x 30 seconds, hip thrust');
  await page.getByRole('button', { name: 'Read it' }).click();
  check('J13 circuit read into exercises', await page.getByText('3 × 12 reps · 40 kg · RPE 8').isVisible() && await page.getByText('3 × 30 sec').isVisible());
  check('J13 piece without reps is flagged, not saved', await page.getByText('No reps or time found for:').isVisible());
  await shot('09-circuit');
  await page.getByRole('button', { name: new RegExp(`Save circuit for ${yLabel} \\(2\\)`) }).click();
  check('J13 circuit saved', await page.getByText(new RegExp(`Circuit saved for ${yLabel}: 2 exercise`)).isVisible());
  const st = JSON.parse(await page.evaluate(() => localStorage.getItem('evidencefit_app_state_v1')));
  const prof = st.profiles.find((x) => x.id === st.activeProfileId);
  const circ = prof.workouts.find((w) => w.title === 'Circuit (typed or spoken)');
  const yISO = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  check('J13 saved to yesterday with 3 leg press sets', !!circ && circ.date === yISO && circ.exercises[0].sets.length === 3 && circ.exercises[0].sets[0].rpe === 8, circ ? circ.date : 'missing');
  await page.getByRole('group', { name: 'Logging for' }).getByRole('button', { name: 'Today' }).click();
  check('J12 back to today', await page.getByRole('heading', { name: 'Protein today' }).isVisible());

  // J5: persistence across reload
  await page.reload();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Progress' }).click();
  check('J5 data survives reload', await page.getByText(/Leg press 3×/).first().isVisible());

  // J6: backup excludes API key; corrupt import is rejected without crashing
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Gemini API key').fill('TEST-SECRET-KEY');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download backup/ }).click()]);
  const path = `${OUT}/backup.json`;
  await dl.saveAs(path);
  const backup = readFileSync(path, 'utf8');
  check('J6 backup has data', backup.includes('Leg press'));
  const saved = JSON.parse(backup).profiles[0].workouts[0].exercises.find((e) => e.name === 'Leg press');
  check('J6 one typed weight carries to every set', saved.sets.every((x) => x.loadKg === 60), saved.sets.map((x) => x.loadKg).join('/'));
  check('J6 backup excludes API key', !backup.includes('TEST-SECRET-KEY'));
  check('J6 backup keeps pain site and lb unit', backup.includes('"painSite": "Left knee"') && backup.includes('"loadUnit": "lb"'));
  writeFileSync(`${OUT}/corrupt.json`, '{"profiles": "nope"}');
  await page.locator('input[type=file]').setInputFiles(`${OUT}/corrupt.json`);
  check('J6 corrupt backup rejected with message', await page.getByText('Backup contains no profiles.').isVisible());

  // J7: AI coach off → no network call, local answer
  const gemini = [];
  page.on('request', (r) => r.url().includes('generativelanguage') && gemini.push(r.url()));
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Coach' }).click();
  await page.getByRole('button', { name: /Weekly audit/ }).click();
  await page.getByText(/Local summary/).waitFor();
  check('J7 coach off: local answer, no request to Google', gemini.length === 0);
  await shot('05-coach');

  // J10: one-click restore from Google Drive (Google is mocked; nothing leaves the machine)
  const driveCalls = [];
  await page.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body:
    "window.google={accounts:{oauth2:{initTokenClient:(c)=>(window.__clientId=c.client_id,{requestAccessToken:()=>setTimeout(()=>c.callback({access_token:'tok'}),10)}),revoke:(t,d)=>{window.__revoked=t;d&&d();}}}};" }));
  await page.route('https://www.googleapis.com/drive/v3/files**', (r) => {
    const u = r.request().url(); driveCalls.push({ u, auth: r.request().headers()['authorization'] });
    if (u.includes('alt=media')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: 2, activeProfileId: 'g1', aiCoach: { apiKey: 'FILE-KEY' },
      profiles: [{ id: 'g1', name: 'From Drive', age: 66, weightKg: 74, conditions: {}, medications: {}, defaultLoadUnit: 'lb',
        circuitLogs: [{ id: 'c1', date: '2026-11-26', location: 'Gym', climate: 'Normal', notes: '', entries: [{ id: 'e1', name: 'Bench press', sets: 3, load: 140, loadUnit: 'lb', reps: 9, unit: 'reps', rir: 1, pain: 0 }] }],
        proteinLogs: {} }] }) });
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ files: [{ id: 'FILEID', modifiedTime: '2026-11-28T04:35:38Z', size: '900' }] }) });
  });
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Settings' }).click();
  check('J10 Drive: no setup needed (client ID built in)', (await page.getByLabel('Google client ID').count()) === 0);
  await page.getByRole('button', { name: 'Restore from Google Drive' }).click();
  await page.getByText(/evidencefit-data\.json, saved .* has 1 person\(s\) and 1 session\(s\)/).waitFor({ timeout: 10000 });
  check('J10 Drive: finds the newest evidencefit-data.json with a read-only token', driveCalls.length === 2 && driveCalls.every((c) => c.auth === 'Bearer tok') && driveCalls[0].u.includes('evidencefit-data.json'));
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Progress' }).click();
  check('J10 Drive: Gemini-app session restored', await page.getByText(/Gym session \(Gemini app\)/).first().isVisible());
  check('J10 Drive: uses the built-in client ID', (await page.evaluate(() => window.__clientId)) === '911891516673-ebnqcbm5so459ouimcsorcl16ru7dfc6.apps.googleusercontent.com');
  check('J10 Drive: access revoked after download', (await page.evaluate(() => window.__revoked)) === 'tok');
  const stored = await page.evaluate(() => localStorage.getItem('evidencefit_app_state_v1') || '');
  check('J10 Drive: key inside the file not kept', !stored.includes('FILE-KEY'));

  // J8: layout fits phone width
  for (const tab of ['Today', 'Plan', 'Progress', 'Coach', 'Settings']) {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: tab }).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`J8 no horizontal scroll on ${tab}`, overflow <= 1, `overflow ${overflow}px`);
  }
  await shot('06-plan');

  check('No console or page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('Run completed', false, e.message);
  await shot('error');
} finally {
  await browser.close();
  await server.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
