# EvidenceFit: delivery record (tier T1, personal use)

## Brief
- **Outcome:** two people (the owner and spouse) follow an evidence-based 60+ plan, log sessions and protein on their phones, and get safe, rule-based progression, deload and protein guidance.
- **Scope (v1):** installable offline web app (PWA); per-person profiles on one device; health screen; weekly plan; session logger; protein logger; function tests; trends; on-device coach rules; optional Gemini coach; JSON backup/restore; CSV export.
- **Non-goals (v1):** accounts, cloud sync between phones, wearables, app-store release.
- **Tier rationale:** health data, but only for the owners, stored only on their own device, no server. Raise to T2 if anyone outside the household uses it or if cloud sync is added.

## Decisions
| # | Decision | Why | Revisit if |
|---|---|---|---|
| D1 | Keep local-first, no backend | Matches prototype; zero running cost; no third party holds health data | Phone-to-phone sync is wanted |
| D2 | Vite + React + TypeScript + Tailwind, PWA via vite-plugin-pwa | Prototype was React + Tailwind; adds type safety and offline install | — |
| D3 | Rules engine split out as pure functions with unit tests | The safety logic is the product; it must be testable | — |
| D4 | AI coach off by default, explicit consent, key never in backups or URLs, name not sent | Prototype sent medications and conditions to Google with no consent and leaked the key in backups | — |
| D5 | Default plan revised (see below) while keeping 3 gym / 2 home / active Sat / rest Sun. **Accepted by the owner 2026-11-21.** | Prototype plan missed several 60+ requirements | Owner prefers the original |
| D6 | Base font 112.5%, 44 px touch targets | Users are 60+ | — |

## Defects found in the prototype and what was done
| Severity | Defect | Fix |
|---|---|---|
| High | `isActiveRegularly` collected but unused: ACSM screening logic not applied (known disease + inactive should cap intensity) | `screen()` implements all four outcomes; RPE cap shown on every exercise; intervals blocked until clearance is recorded |
| High | Sleep (7 h) and resting HR (baseline) pre-filled, so every session logged "normal" values and the sleep/HR deload triggers could never fire | Fields start blank; blank = not logged; rules ignore blanks |
| High | Reps and RPE pre-filled with targets: saving untouched sets recorded fake performance and drove progression | Sets start blank; blank sets are not saved; explicit "Done as planned" button |
| High | AI reply written to whichever profile is active when it returns (switching person mid-request put one person's chat on the other's profile) | Writes target the profile id that asked |
| High | Gemini key in the URL, stored in backups; health data sent without consent | Header auth, excluded from backups, consent toggle, data minimised |
| High | localStorage write failures silently ignored (data loss in private mode or full storage) | Persistent red banner; `navigator.storage.persist()` requested |
| Med | Backup import not validated: a malformed file could white-screen the app | Full schema coercion and migration (v1 → v2); error boundary |
| Med | No way to delete a wrongly logged session; errors permanently skewed progression | Session history with delete |
| Med | Double tap on Save created duplicate sessions | Duplicate detection |
| Med | Performance-drop rule used total volume, so a planned lighter day (fewer sets) triggered a deload | Uses per-set work |
| Med | Progression rounded +4% to 0.5 kg (10 kg dumbbell → 10.5 kg, which does not exist) | Smallest available increment per exercise (default 1 kg under 20 kg, 2.5 kg above) |
| Med | API retried 4× with backoff on a bad key (≈7 s wait) and when no key was set | No call without key and consent; 4xx not retried; 30 s timeout |
| Med | Warnings for glaucoma/osteoporosis were generic; Surya Namaskar (head-down) still prescribed | Per-exercise contraindication checks |
| Low | First run loaded a fictional "Rajesh" demo as the user's data | Welcome screen; demo only on request |
| Low | In-progress session lost when switching tabs | Drafts persisted per person |
| Low | Timer drifted when the phone throttled timers | End-timestamp timer, vibration, screen wake lock |
| Low | CSV formula injection | Cells neutralised |
| Low | Curd and Greek yoghurt treated as the same 12 g | Split: curd 7 g, Greek yoghurt 18 g |

## Plan changes (trainer review, Module 4: 60+)
- Power: sit-to-stand moved from 8–10 reps to **3 × 5, fast concentric** (power work is low-rep and stops before speed drops); fast step-ups added on Gym B.
- Added **hip hinge** (dumbbell RDL), **farmer's carry**, **pulls in the gym**, **overhead press** at home, **Pallof press** (anti-rotation).
- Aerobic: walks were set at RPE 6/10 (too hard for "conversational"); now **RPE 3–4** and **≈165 min/week**; one **4 × 4 interval** session added (blocked until cleared if disease present).
- Wall sit changed to the **BP protocol: 4 × 2 min, 3×/week** (Edwards 2023 network meta-analysis).
- Balance on 3 days plus optional daily; tandem walk added.
- Gym days alternate A/B/A instead of three identical days.

## Verification evidence (2026-11-21, Node 22, Chromium via Playwright, Pixel 7 viewport)
| Check | Command | Result |
|---|---|---|
| Type check | `npm run typecheck` | pass |
| Unit tests (acceptance criteria AC-1 … AC-10) | `npm test` | 43/43 pass |
| Production build | `npm run build` | pass; 690 KB precached (≈200 KB gzip) |
| End-to-end journeys J1–J8 on phone width | `npm run build && npm run e2e` | 20/20 pass, no console errors |

Not verified: real iPhone/Android install and offline mode on device; live Gemini call (no key); screen-reader pass; performance on a low-end phone.

## Release (GitHub Pages, chosen 2026-11-21; Android first)
1. Push to `main`. `.github/workflows/deploy.yml` runs type check, unit tests and build, then publishes `dist/` to GitHub Pages. Pull requests are tested, never published.
2. One-time: repository Settings → Pages → Source: **GitHub Actions**.
3. On each Android phone: open the Pages URL in Chrome → menu → **Install app**. Open it once online; it then works offline.
4. Updates: the installed app picks up a new version on next open. Data is untouched (storage key unchanged, migrations in `parseState`).
5. Rollback: revert the commit on `main` (or re-run the previous successful workflow run).

Android install evidence (Chromium, Pixel 7 emulation): manifest errors none; installability errors none; service worker registered; app reloads offline after first visit. Not yet confirmed on a physical phone.

## Release 1.1 (2026-11-21): changes from first use

| Owner feedback | Change | Guess to confirm |
|---|---|---|
| Fish / chicken as small, medium, large | Tap a food, then pick a size; each size shows what it looks like and its protein grams. Prawns and milk added. | Portion weights and grams are typical values; real pieces vary by about 20%. |
| Can add but not subtract protein | Each logged item has a visible Remove button, with Undo. | |
| Machines in kg or lb? | Per-exercise "Weights marked in kg / lb" switch (default kg), remembered in the plan. You type what the stack shows; stored in kg; progression advice uses your unit (5 lb step on lb machines). Hidden on bodyweight moves. | Default kg. |
| How to decide pain level; left/right leg/arm | "Pain ?" opens a 0–10 guide (effort is not pain; 1–3 carry on; 4–5 modify; 6+ or sharp stop). Any pain above 0 asks side and body part, saved with the session, in CSV and backup, and passed to the coach swap. Chest pain shows an urgent-care warning. | Read as recording where it hurts, not separate left/right sets. |
| Push-ups; triceps push-downs | Push-ups named plainly (floor, or hands on a bench). Cable triceps push-down added after push-ups on Gym A days: 2 × 10–15 at RPE 7.5, twice a week (4 direct sets; pressing already trains triceps). Saved plans upgrade in place (programVersion 2), keeping the owner's edits. | Gym A (Mon/Fri) placement. |
| (found in testing) | A weight typed in set 1 now carries to blank later sets, so progression is not misread as bodyweight. | |

Evidence: 52 unit tests (new AC-11 units, AC-12 plan upgrade, AC-13 portions and pain), 28/28 phone end-to-end checks.

## Release 1.2 (2026-11-21): owner's answers to the 1.1 questions

- **Left and right logged separately** for one-sided exercises (step-up, one-arm row, single-leg balance, bird-dog, and any custom exercise named "each leg", "one-arm", "single-leg", lunge, etc.). Rows show 1L, 1R, 2L, 2R; progression needs both sides at the top of the range. Pain on a left/right row pre-selects that side. Per-exercise override in the plan ("Log left and right sides separately"). Side is saved, exported to CSV and sent to the coach.
- **Band triceps push-down on home days** (Tue/Thu), 2 × 12–15 at RPE 7.5, after the biceps curl. Direct triceps work is now 8 sets a week in total (gym cable 4 + home band 4), within a 60+ weekly range alongside pressing. Saved plans upgrade in place (programVersion 3).
- **AI coach (Gemini) kept** as an optional extra: off by default, needs consent and the owner's own key, local summary when off. Decision D-open closed.

Evidence: 56 unit tests (AC-14 added), 30/30 phone end-to-end checks.

## Backup and restore (runbook)
- Settings → *Download backup* (all people). The app nags after 14 days. Keep copies in Google Drive.
- Restore: Settings → *Restore from backup* → confirm. Accepts prototype (v1) backups.
- iPhone note: Safari can delete website data for sites not added to the home screen after weeks of non-use. Install to the home screen.

## Known limitations / deferred
- No sync between the two phones (use one phone with two profiles, or backup/restore).
- Weekly hard sets per muscle are not computed (needs muscle mapping per exercise).
- Recharts makes the bundle large; could lazy-load the Progress tab.
- Gemini model name defaults to the prototype's `gemini-3-flash-preview`; editable in Settings.
- Guidance is general and does not replace a doctor; screening is self-reported.
