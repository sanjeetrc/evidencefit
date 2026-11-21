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
  await page.getByRole('button', { name: /Fish \/ pomfret 100 g/ }).click();
  await page.getByRole('button', { name: /Paneer 100 g/ }).click();
  check('J2 protein chips add to today', (await page.locator('text=43 g').first().count()) > 0);
  check('J2 60+ per-meal target shown (0.4 g/kg = 30 g)', await page.getByText(/at least 30 g at each meal/).isVisible());

  // J3: log Monday's session with "done as planned", save, see it in history
  await page.getByLabel('Session template').selectOption('Mon');
  await page.getByLabel('Sleep hours').fill('7');
  const leg = page.getByRole('article', { name: 'Leg press' });
  await leg.getByLabel('Leg press set 1 load kg').fill('60');
  await leg.getByRole('button', { name: 'Done as planned' }).click();
  await shot('02-today-logger');
  await page.getByRole('button', { name: 'Save session' }).click();
  check('J3 session saved', await page.getByText(/Session saved: 1 exercise/).isVisible());
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Progress' }).click();
  check('J3 session in history', await page.getByText(/Leg press 3×/).isVisible());
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
  check('J6 backup excludes API key', !backup.includes('TEST-SECRET-KEY'));
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
