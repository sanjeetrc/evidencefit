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
  check('J2 fish offers small / medium / large', (await page.getByRole('group', { name: 'Fish size' }).getByRole('button').count()) === 3);
  await page.getByRole('button', { name: 'Add Fish medium, 25 g protein' }).click();
  await page.getByRole('button', { name: 'Paneer', exact: true }).click();
  await page.getByRole('button', { name: 'Add Paneer medium, 18 g protein' }).click();
  check('J2 portions add to today', (await page.locator('text=43 g').first().count()) > 0);
  await page.getByRole('button', { name: /^Remove Paneer/ }).click();
  check('J2 remove takes it off', (await page.locator('text=25 g').first().count()) > 0 && (await page.getByRole('button', { name: /^Remove Paneer/ }).count()) === 0);
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
  await page.getByLabel('Session template').selectOption('Wed');
  const intervals = page.getByRole('article', { name: /Intervals/ });
  check('J4 intervals blocked until cleared', await intervals.getByText(/Avoid: Vigorous/).isVisible());
  check('J4 RPE capped at 6', await page.getByText(/RPE 6 \(capped\)/).first().isVisible());

  // J5: persistence across reload
  await page.reload();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Progress' }).click();
  check('J5 data survives reload', await page.getByText(/Leg press 3×/).isVisible());

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
