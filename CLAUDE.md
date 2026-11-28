# EvidenceFit

EvidenceFit is a personal workout, protein and coaching web app:
- Built with React 19, TypeScript and Vite 8, styled with Tailwind v4.
- No backend. All data lives in the browser's `localStorage`.
- Deployed by hand to Netlify by uploading `dist/` (Netlify Drop → **New version** on the site *iridescent-cuchufli-c0953e*).
  - **Local git only** (branch `main`, no remote; the user doesn't want GitHub).
    - Commit when the user asks.
    - `.env.local`, `dist/`, `.history/` and `*.bak` are ignored.
    - `.gitattributes` keeps LF line endings.
  - Each build stamps `{ time, source, commit }` into `dist/version.json` and Settings → "App version".
    - `commit` is the short git hash, with `+changes` when there are uncommitted edits.
  - `source` is a hash of src/, public/, index.html, the package files, vite.config.ts and the Drive client ID.
    The same source always gives the same hash.
  - To check what Netlify serves, compare `<netlify-url>/version.json` with `dist/version.json`.
  - Built bundles differ byte-for-byte between builds because the time is embedded; compare `source`, not files.
- The main device is an Android phone running Chrome. The user develops on this Windows laptop and uses the
  Claude mobile app for coaching chats; they don't code from the phone.

## Commands
- `npm run dev`: dev server.
- `npm run build`: runs `tsc -b`, then `vite build`, writing to `dist/`. Always run it before saying something is done.
- `npx eslint src`: must stay clean.
- `npm test`: Vitest (`vitest run`). Runs `src/**/*.test.{ts,tsx}` in Node, using `vitest.config.ts`. Must pass.
  - It takes about 1 minute; the guided-voice test alone takes about 53 s on real timers.
  - Run one file with `npx vitest run src/ai`.
- `npm run preview -- --host`: serves `dist/` on the local network.
  - Phone test URL: `http://<laptop-ip>:4173/?voicedebug`. Netlify credits are scarce, so test this way before deploying.
  - The mic needs a secure context. On the phone, add that URL in `chrome://flags` → "Insecure origins treated as
    secure", or use USB port-forwarding to `localhost`.

## Layout (src/)
- `App.tsx`: shell only.
  - Handles persistence, cross-tab sync and the toast.
  - The Today tab is always mounted, hidden when not active; the other tabs mount on demand.
  - Progress, Coach and Settings are `React.lazy` chunks; Progress carries Recharts.
    - First load is about 307 kB (96 kB gzipped) instead of 803 kB.
    - `warmTabs()` fetches all three 2.5 s after start, so they open instantly.
  - `lib/build.ts`: `BUILD` / `buildLabel()` from the `__APP_BUILD__` define, which is null under Vitest.
  - `features/today/BackupReminder.tsx` sits above Today. It shows when there's data and neither a backup nor a
    clean Drive sync in the last 7 days (`backupReminderNeeded` in `lib/persist.ts`). "Remind me in 3 days" is a
    per-device snooze (`evidencefit_backup_snooze_until`).
- `main.tsx` calls `requestPersistentStorage()` (`navigator.storage.persist()`) on every start and
  `registerServiceWorker()` (production builds only). The Backup card in Settings shows the persistence status.
- `lib/backup.ts`: `downloadBackup()`, shared by the Backup card and the Today reminder.
- `components/NumberField.tsx`: use it for every numeric input.
  - It holds the typed text locally, saves in-range values as you type, and clamps on blur or Enter.
  - Never write `Number(v) || fallback` in an `onChange`: clearing the field snaps it to the fallback, so typing
    "72" gave "6072".
  - Ranges: age 18–110, weight 30–250 kg, protein target 20–400 g, sets 1–20, reps 1–600.
  - `normalizeProfile` resets an out-of-range age, weight or target to its default, which repairs data saved
    under the old bug.
- `types.ts`: all shared types. `lib/storage.ts`: storage keys, defaults, and every `normalize*` function.
- `domain/`: pure logic.
  - `exercise.ts`: muscles, MET values and calories, including the ACSM treadmill formula.
  - `exerciseLibrary.ts`: 91 exercises, search and history matching.
    - Mobility & Balance moves never get a default "to fail" value.
  - `QUICK_PRESETS` in `exercise.ts` holds the one-tap buttons.
    - Presets with `section: 'Mobility'` appear in their own "Mobility & stretching" row under Home.
    - Their sets, reps and unit must match `EXERCISE_LIBRARY`. Neither sets a weight unit (see **Weight unit** below).
  - `suggestion.ts`, `protein.ts`, `health.ts`.
  - `safety.ts`: the "Before you train" symptom list (`SAFETY_FLAGS`), the stop message, and `safetyCheckLine`.
  - `coachBrief.ts`: the "Copy for Claude" text. Each workout day includes its safety-check line.
- `voice/`: speech handling.
  - `speech.ts`: Web Speech API wrappers.
  - `useQuickMic.ts`: free dictation.
  - `guided.ts`: pure step logic and answer parsers.
  - `guidedController.ts`: framework-free session control.
  - `useGuidedVoice.ts`: React wiring.
  - `parseQuick.ts`: offline parser.
    - When both sets and reps are given ("3x10", "3 sets 12 reps", "3 sets of 12"), a bare number next to the
      name is the load in the default unit. "chest press 50 3x10" gives 50 lb.
      - `MASK_RES` first blanks out the sets, reps, time and RIR phrases using same-length masks, then
        `BARE_LOAD_RE` finds the load.
      - Without sets and reps, a lone number is still reps ("60 push-ups", "push-ups 20").
    - Treadmill speed accepts km/h or mph (× 1.609, `MPH_RE`).
    - The cases are in `src/voice/parseQuick.test.ts`.
    - Times, %, °, "to fail", "rir N" and "pain N" are never read as a load.
  - `glossary.ts`: fixes for common mishearings.
- `ai/`:
  - `index.ts`: the entry point the app uses (parse, coach, test, model list).
  - `gemini.ts`, `groq.ts`: one caller per provider.
  - `request.ts`: shared timeout, retry and error handling.
- `sync/`: Google Drive sync (see **Drive sync** below).
  - `googleDrive.ts`: sign-in token and Drive REST.
  - `driveContent.ts`: pure builders for the Doc and JSON content.
  - `useDriveSync.ts`: the React hook and `DriveSyncContext`.
- `features/today|progress|coach|settings|drive/`: UI for each tab.
  - `today/SafetyCheckCard.tsx` sits at the top of the Today tab. Once answered it collapses to "Checked ✓".
  - `today/LogDatePicker.tsx`: "Logging for" Today / Yesterday / 2 days ago / any day up to 60 days back.
    - `TodayTab` passes `logDate` to the circuit save and to `ProteinCard`'s `date`.
    - The state is `null` = follow today, so an app left open overnight moves on.
    - Never allow future dates. The safety check is always about today only.
    - `saveCircuit` inserts in **date order**. The AI coach (`slice(-6)`) relies on `circuitLogs` being sorted
      by date.
  - `progress/WorkoutDiary.tsx` is at the top of the Progress tab. It groups circuits by day (newest first, sorting
    by itself), shows each exercise via `describeEntry`, the day's protein and safety check, and has a
    "find an exercise" search. It shows 14 days at a time.
  - `progress/ProteinDiary.tsx` sits below it. It lists each day's protein total against the target; tapping a
    day opens what was eaten, grouped by meal.
    - The grouping and "x g to go" come from `groupProteinByMeal` and `proteinGapText` in `domain/protein.ts`,
      which the Today protein card also uses.
  - `drive/DriveSyncCard.tsx` (shown in Settings) and `drive/DriveSyncChip.tsx` (shown on Today and Coach).
- `public/`, offline and install files:
  - `manifest.webmanifest`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` and `apple-touch-icon.png`
    (generated "EF" icons).
  - `sw.js`, the offline shell:
    - same-origin GETs only;
    - pages are network first (cached as `/`);
    - `/assets/*` is cache first, keeping the newest 60.
  - At build time, the `swPrecache` plugin in `vite.config.ts` stamps `dist/sw.js`:
    - `BUILD` becomes the source hash plus the time, and `PRECACHE` becomes every `/assets` file.
    - So each deploy installs a new worker, which precaches every lazy tab (offline works even for a tab never
      opened) and deletes the old cache.
    - Keep the placeholder lines `const BUILD = 'dev';` and `const PRECACHE = [];`, or the build fails.
  - It never caches data; the log stays in localStorage.
- `public/_headers`: Netlify CSP, plus `Cache-Control: no-cache` for `/sw.js` and `/index.html`, so a new upload
  reaches the phone.
  - `connect-src` must list every AI host (Gemini, Groq) plus `accounts.google.com` and `www.googleapis.com`.
  - `script-src` and `frame-src` include `accounts.google.com`, for Google sign-in.

## Rules that must not break
- **Storage keys:** never rename `evidencefit_app_state_v1`, `evidencefit_circuit_draft_v2` or `evidencefit_pre_restore_v1`.
  Old data and backups must keep loading.
- **New persisted fields:**
  - Make them optional or give them a default in `normalize*`.
  - Example: `speedKmh` and `inclinePct` are only stored on treadmill entries.
  - Example: the AI settings keep the Gemini field names `apiKey`, `model` and `consentAt`, and add `provider`,
    `groqApiKey`, `groqModel` and `groqConsentAt`.
- **Weight unit (lb by default):** `Profile.defaultLoadUnit?: 'lb' | 'kg'` is optional; `normalizeProfile` makes anything
  other than `'kg'` into `'lb'`.
  - The library and `QUICK_PRESETS` carry **no** `loadUnit`. New entries take the profile's unit through the
    `defaultUnit` parameter of `entryForExercise`, `parseQuickText`/`parseQuickLine`, `interpretGuidedStep`,
    `buildGuidedEntry`, `parseQuickWithAI` and `normalizeEntry`. Each defaults to `'lb'`.
  - Only a spoken or typed unit ("kg", "kilos", "lb", "pounds", "£") overrides it. A repeated exercise keeps last
    time's unit.
  - A stored entry with a valid `loadUnit` is never changed on load.
  - Settings → "Mark all existing loads as lb" (`relabelLoadsAsLb` / `countKgEntries` in `lib/storage.ts`) relabels
    saved kg entries as lb **without converting the numbers**. It only appears while kg entries exist, and it doesn't
    touch the unsaved Today draft.
- **Safety checks:** `Profile.safetyChecks?: Record<YYYY-MM-DD, { at, flags: string[] }>` is optional.
  - `normalizeSafetyChecks` defaults it to `{}` and drops malformed entries.
  - `flags` holds `SAFETY_FLAGS` keys (`chest`, `breathless`, `dizzy`, `palpitations`, `swelling`, `calf`). Never rename
    a key; changing a label is fine. An empty `flags` means "None of these today".
  - A flagged day shows the red stop banner (call 108 / 112 for severe or lasting chest pain) but must **never**
    block logging or saving.
- **Backups:** the JSON export must strip every API key. Both the backup download and the Drive JSON go through
  `exportSafeState()` in `lib/storage.ts`; never strip keys anywhere else.
- **AI consent is per provider.** AI is optional, and when it fails Quick-Log falls back to the offline parser.
- **TypeScript settings:** `tsconfig` uses `verbatimModuleSyntax` (use `import type`) and `noUnusedLocals`.
- **Lint:** the hooks lint rule (`react-hooks/refs`) forbids reading refs during render.
- **Android speech quirks the voice code is built around:**
  - Never call `recognition.abort()`. A late abort kills the next session.
  - End a session with `stop()`.
  - Wait for `onend` before starting a new session.
  - Show "Listening" only after `onaudiostart`.
  - Keep `continuous = false` on Android.
  - See the comment at the top of `guidedController.ts`.
- **Guided voice routes:**
  - Standard: Exercise → Weight → Sets → Reps → To-fail.
  - Treadmill: Exercise → Speed → Incline → Minutes.
  - Use `guidedRoute`, `nextGuidedStep` and `guidedPrompt`; never hard-code step numbers.
- **UX for an older user:** large text (`text-base` or bigger for hints), tap targets at least 44 px, plain wording,
  and tap or type alternatives to every voice step.

## Drive sync
This lets Claude read the training log through its Google Drive connector. It runs in the browser only: no
backend and no client secret.
- **Turning it on:**
  - The build needs `VITE_GOOGLE_CLIENT_ID` in `.env.local` at build time. `*.local` is git-ignored, so never
    commit it.
  - Without it, `isDriveConfigured()` is false and every Drive UI element is hidden.
  - The OAuth client must be a **Web application** client. Its authorized JavaScript origins must include the
    Netlify URL and every local test origin used (e.g. `http://localhost:4173`).
- **Sign-in:**
  - Google Identity Services is loaded on demand from `accounts.google.com/gsi/client`.
  - The scope is `drive.file`, so the app sees only files it created.
  - The access token lives in module memory only, never in localStorage or backups, and expires after about 1 hour.
  - `requestTokenFromGesture()` must be called **synchronously inside a click handler**, or Android blocks the
    popup. That's why the script is preloaded: when sync is on, and when the Settings card mounts.
- **Files**, in a Drive folder `EvidenceFit`:
  - The Google Doc `EvidenceFit Coach Log`: "Last synced …" followed by `buildCoachBrief` for 56 days with health
    included, without "MY QUESTION:".
  - `evidencefit-data.json`: `exportSafeState` without `chatHistory`.
  - The first sync creates both with a multipart upload (the Doc as text/plain converted to a Google Doc).
    Later syncs `PATCH …/upload/drive/v3/files/{id}?uploadType=media`, which keeps the IDs, so Claude's link stays
    valid.
  - A stored ID that returns 404 is recreated; if the folder was deleted, the folder is recreated too.
- **When it syncs:**
  - Automatically after `saveCircuit` and after answering the safety check, via `drive.requestAutoSync()`.
  - From the Coach tab's "Sync to Drive now" button and from Settings.
  - Saving never waits for Drive.
- **Failures:**
  - On failure (offline, expired token, 5xx) `pendingSync` becomes true and the chip "Not synced — tap to retry" shows.
  - The next save or tap retries; a tap can also sign in again.
  - A 5xx gets one automatic retry with backoff.
- **Settings:** `AppState.driveSync?` holds `{ enabled, folderId?, docId?, jsonId?, lastSyncAt?, pendingSync? }`.
  - It's normalized by `normalizeDriveSync`: malformed IDs are dropped, and missing → undefined.
  - The file IDs aren't secret, so they may appear in backups.
  - Restoring a backup keeps this device's `driveSync`, as it does with `aiCoach`.
- **Disconnect** revokes the token and resets `driveSync` to `{ enabled: false }`. The files stay in Drive.

## Testing
**Vitest** (`npm test`) holds all the checks. When you change parsers, calorie maths, storage, AI requests or
Drive code, add a test.
- **Where tests live:**
  - New tests go next to the code as `*.test.ts`, written with `describe` / `it` / `expect`. Examples:
    `src/voice/parseQuick.test.ts`, `src/ai/fallback.test.ts`.
  - `src/__tests__/` holds the earlier rolldown scripts ported as-is, one `it` each:
    - weight unit, profile and bare load, coach brief, workout diary (React render), Drive;
    - AI providers, guided controller, library, mobility, RIR, safety, treadmill.
  - Each ported test logs PASS or FAIL lines and fails if any check failed. Console output is shown only for
    failing tests (`silent: 'passed-only'`).
- **Rules:**
  - `any` is allowed in test files only (eslint override).
  - Tests are type-checked by `tsc -b`.
  - Vitest loads `.env.local`, so `isDriveConfigured()` follows it.
- **Stubbing:**
  - Use `vi.stubGlobal('fetch', …)` and `vi.unstubAllGlobals()`.
  - For AI retry tests, `__callAiForTests` skips the 1.5 s wait.
- Stub `fetch` for network code. For Drive, `__setTokenForTests()` in `googleDrive.ts` sets a fake token.
- In Node 24, `navigator` is a read-only global, so stub it with `Object.defineProperty`.
- **React components:** write a `*.test.tsx` that uses `renderToStaticMarkup` (see `workoutDiary.test.tsx`).
  Vitest loads React once, so the old Vite `ssrLoadModule` workaround isn't needed.
- **Browser end-to-end:** use `playwright-core` installed in a scratch folder (not in the repo), with
  `executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'`, against `npm run preview` on
  `localhost:4173`.
  - Use a 390×844 mobile viewport.
  - The top `<nav>` is hidden at phone width, so filter locators with `locator('visible=true')`.
  - Headless Chrome returns `false` for `navigator.storage.persist()`. That's expected.

## Status and pending items
- **AI:**
  - Gemini often returns HTTP 503 (model overloaded); Groq is untested with a real key.
  - `callAi` in `ai/index.ts` handles busy errors (5xx and 429):
    - it retries once after 1.5 s, if that fits in half the request's time budget;
    - then it tries the **other** provider, but only if that provider has its own key and consent
      (`backupProvider`);
    - the answer carries a `note` ("Gemini was busy; answered by Groq"), shown in the coach reply and the
      Quick-Log toast;
    - timeouts and 4xx errors are not retried;
    - Settings → "Test AI connection" (`testAi`) never retries or falls back.
  - The user prefers coaching through their paid Claude subscription. The Coach tab's **Copy for Claude** button
    produces the brief to paste there.
  - Ideas discussed but not built:
    - a "Download brief" file button.
- **Calorie accuracy (offered, not done):**
  - Non-treadmill cardio MET values are low.
  - Yoga, stretching and pranayama values are high.
  - Lifted weight is ignored.
  - Totals are gross, not net.
- **Safety screen wording:** the old single-file build (`EvidenceFit.tsx` /
  `evidencefit_evidence_based_exercise_protein_companion.tsx`, with `RED_FLAG_ITEMS`) wasn't found on this laptop
  (checked the home folder, Downloads, Desktop and Documents). The safety screen uses the wording the user gave on
  2026-11-26. If the old file turns up, compare its wording with `SAFETY_FLAGS`.
- **Cleanup:** `App.tsx.orig.bak` is the pre-split backup and can be deleted once the user is happy.
  It doesn't contain `RED_FLAG_ITEMS`.
