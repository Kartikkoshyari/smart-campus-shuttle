# Testing and verification (Phases 7 and 8)

Every number on this page was produced by actually running the commands below on 22 October 2026, on Node 22 in a Linux container. Re-run them on your own machine before the demo; your numbers should match.

## The commands

| Command                 | What it checks                                                          | Result recorded          |
| ----------------------- | ----------------------------------------------------------------------- | ------------------------ |
| `npm run typecheck`     | TypeScript in the app, tests, scripts and end-to-end tests              | No errors                |
| `npm run lint`          | oxlint rules, including React hook rules                                | No warnings or errors    |
| `npm test`              | 16 Vitest files: logic, UI, services, database SQL, deployment settings | **228 passed, 0 failed** |
| `npm run test:coverage` | The same tests, with a coverage report in `coverage/`                   | See below                |
| `npm run test:e2e`      | 11 browser tests in real Chromium against the production build          | **11 passed, 0 failed**  |
| `npm run build`         | Production build                                                        | Builds without errors    |
| `npm run verify`        | typecheck, lint, test and build, one after another                      | Passes                   |

First time only, before `npm run test:e2e`, download the test browser:

```bash
npx playwright install chromium
```

The end-to-end tests build the app into `dist-e2e/` in **local demo mode** (Supabase variables are blanked), start `vite preview` on port 4173 with the same security headers as the deployed site, and drive Chromium. Any request blocked by the Content Security Policy fails the test. They never touch your Supabase project. Map tiles are served by the test itself, so they also work offline.

## Coverage

| Measure    | Result | Minimum enforced |
| ---------- | ------ | ---------------- |
| Statements | 83.30% | 78%              |
| Branches   | 73.48% | 68%              |
| Functions  | 86.75% | 80%              |
| Lines      | 85.39% | 80%              |

`npm run test:coverage` fails if any measure drops below the minimum (set just under what Phase 7 measured).

| Area                                         | Lines covered | Notes                                                                                                |
| -------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------- |
| `src/booking` (journey rules, states, codes) | 100%          | The heart of the booking logic                                                                       |
| `src/simulator`                              | 100%          | Movement, timetables, ETAs, controls                                                                 |
| `src/pages`                                  | 93%           |                                                                                                      |
| `src/services`                               | 82%           | Supabase versions are tested against a fake client                                                   |
| `src/components`                             | 70%           | `CampusMap` shows 0% here because jsdom cannot draw Leaflet maps; the browser tests cover it instead |

## Which test proves which requirement

| Requirement                                                      | Proved by                                                                                                |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Shuttle follows the route at a set speed and waits at stops      | `simulator.test.ts`                                                                                      |
| Play, pause, resume, reset and 1×/2×/5× speed                    | `simulator.test.ts`, `simulationUi.test.tsx`                                                             |
| ETAs count down in real seconds at every speed                   | `simulator.test.ts`                                                                                      |
| "DEMO SIMULATION — NOT LIVE GPS" label is always visible         | `app.test.tsx`, `simulationUi.test.tsx`, e2e "landing page"                                              |
| Map draws 8 stops and 2 shuttles, and the shuttles move          | e2e "the map draws the route and the shuttles move"                                                      |
| Without map tiles the app falls back to the route diagram        | `mapPanel.test.tsx`, e2e "without map tiles"                                                             |
| Pause on one screen pauses every other open screen               | e2e "pausing on the operator console…" (two tabs)                                                        |
| Only valid journeys on the shuttle's direction can be booked     | `journey.test.ts`, `localBooking.test.ts`, e2e "an impossible journey…"                                  |
| No overbooking, no duplicates, no double seat release            | `localBooking.test.ts` (parallel bookings), `database.test.ts` (same rules in PostgreSQL)                |
| Seats free up automatically after drop-off or a reset            | `localBooking.test.ts`, `database.test.ts`                                                               |
| Book and cancel from start to finish                             | `bookingUi.test.tsx`, e2e "a student books a seat and cancels it"                                        |
| New accounts are always students; roles come from the server     | `localAuth.test.ts`, `database.test.ts` (`handle_new_user`, RLS)                                         |
| Students cannot read others' bookings or write tables directly   | `database.test.ts` (row level security and revoked writes)                                               |
| Operators control only their assigned shuttle                    | `simulator.test.ts`, `localAdmin.test.ts`, `database.test.ts`                                            |
| Admins manage users and shuttles; cannot demote themselves       | `localAdmin.test.ts`, `adminUi.test.tsx`, `database.test.ts`                                             |
| Capacity can never be set below seats already booked             | `localAdmin.test.ts`, `database.test.ts`                                                                 |
| Service-role (secret) keys are refused in frontend config        | `env.test.ts`                                                                                            |
| Supabase services call the right functions and map errors        | `supabaseServices.test.ts`                                                                               |
| Realtime subscriptions are unique and cleaned up                 | `supabaseServices.test.ts`                                                                               |
| Admin "Start a fresh demo" clears bookings and restarts shuttles | `localAdmin.test.ts`, `database.test.ts`, `adminUi.test.tsx`, e2e "an administrator starts a fresh demo" |
| Vercel and Netlify get identical rewrites and security headers   | `deployConfig.test.ts`, e2e "the deployed security headers…" and the CSP check after every e2e test      |
| A crash shows a recovery screen, not a blank page                | `errorBoundary.test.tsx`                                                                                 |
| Accessibility (WCAG 2 A and AA, no serious or critical issues)   | e2e axe scans of landing, booking, my bookings, operator and all four admin tabs                         |
| Works on a 390 px phone with no sideways scrolling               | e2e "on a phone"                                                                                         |

## What Phases 7 and 8 found and fixed

- **Realtime channel clash in Supabase mode.** When a screen re-mounted quickly (React development mode does this on purpose), the app tried to reuse an already-subscribed channel and Supabase threw an error. Each subscription now gets its own channel name, and a test checks it.
- **Blank page on an unexpected error.** The whole app is now wrapped in an error screen with "Reload the page" and "Go to the home page".
- **Mismatched Playwright versions.** The accessibility checker pulled in a newer Playwright than the test runner, which broke type-checking. Both are now pinned to 1.56.0.
- **Confirmation emails pointed at the Site URL only.** Sign-up now asks Supabase to send people back to the site they registered on (`/login`).
- **The connection error only mentioned `.env.local`.** It now also points to the hosting site's environment variables.
- The axe accessibility scans found no serious or critical problems on any screen tested.
- A deliberate test removed the map tile host from the Content Security Policy: the browser tests failed with the blocked tile addresses, which shows the CSP check really works. The policy was then restored.

## Manual checks before the demo

Run these once on the laptop and browser you will present with.

- [ ] `npm run verify` passes.
- [ ] Landing page: the yellow **DEMO SIMULATION — NOT LIVE GPS** label is visible.
- [ ] Sign in as the student. Both shuttles move on the map; ETAs count down.
- [ ] Switch the map to **Route** and back.
- [ ] Book Main Gate → Boys' Hostel on SH-01. Write down the booking code; it appears in **My bookings**.
- [ ] Open a second window, sign in as the operator, press **Pause**. The student's board shows **Paused** within a second.
- [ ] Try 5× speed. The shuttle visibly speeds up; ETAs still count real seconds.
- [ ] As the admin, the booking appears in the Bookings tab; cancel it and check the seat count goes back up.
- [ ] Turn off Wi-Fi and reload. The route diagram appears and everything else still works (local demo mode only).
- [ ] Shrink the window to phone width. The menu button works and nothing scrolls sideways.
- [ ] Keyboard only: Tab through the booking form and book a seat without the mouse.
- [ ] In Supabase mode, sign in from two different browsers. A booking made in one appears in the admin view of the other.

## Known limitations

- The Supabase services are tested with a fake Supabase client, and the SQL with PGlite (real PostgreSQL in memory) plus a small stand-in for Supabase's `auth` and `realtime`. Neither replaces one run against your real Supabase project; use the last manual check above.
- Browser tests run in Chromium only. The app uses standard features, but check Safari and Firefox by hand if you will present on them.
- A seat is counted as taken for the whole shuttle from booking until drop-off, not per section of the route. This is simpler and never overbooks, but it can turn people away when the shuttle is not physically full.
- Local demo mode stores accounts and bookings in the browser. It is for demonstrations only and is not secure.
- Shuttle movement is a simulation along demo coordinates. It is not GPS and does not represent any real university's layout.
