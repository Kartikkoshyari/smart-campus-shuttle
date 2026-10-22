# Smart Campus Shuttle

A campus shuttle app where students see the shuttle on a map, check stops, seats and ETAs, and book or cancel seats.

**Deploy** it as a website in about 15 minutes with [DEPLOYMENT.md](DEPLOYMENT.md). Presenting? See [PRESENTATION.md](PRESENTATION.md). Test results are in [TESTING.md](TESTING.md).

> **Demo mode is the default.** The shuttle moves along a predefined route by simulation. It is **not live GPS** and needs no driver, phone or location permission.

## Requirements

- Node.js 22.22 or newer (Node 24 LTS recommended)
- npm 10 or newer

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## Scripts

| Command                 | What it does                        |
| ----------------------- | ----------------------------------- |
| `npm run dev`           | Start the development server        |
| `npm run build`         | Type-check and build for production |
| `npm run preview`       | Serve the production build locally  |
| `npm test`              | Run all tests once                  |
| `npm run test:watch`    | Re-run tests when files change      |
| `npm run typecheck`     | Type-check without building         |
| `npm run lint`          | Check code style and React rules    |
| `npm run test:coverage` | Run tests with a coverage report    |
| `npm run test:e2e`      | Browser tests in Chromium (Phase 7) |
| `npm run verify`        | Typecheck, lint, test and build     |

## Demo accounts (local demo mode)

| Role          | Email                   | Password   |
| ------------- | ----------------------- | ---------- |
| Student       | `student@shuttle.test`  | `demo1234` |
| Operator      | `operator@shuttle.test` | `demo1234` |
| Administrator | `admin@shuttle.test`    | `demo1234` |

New registrations are always students. Local demo accounts live in this browser's storage and are **not secure**; real authentication and database security arrive in Phase 5.

## The demo shuttle simulator (Phase 3)

The shuttles move by **simulation, not GPS**. Two shuttles run the Campus Loop, SH-01 clockwise and SH-02 anticlockwise, at about 22 km/h, waiting 15 seconds at each stop. One loop takes about 11 minutes at 1x and about 2 minutes at 5x.

- Positions are worked out from a saved clock and the current time, so every tab in the same browser shows the same position, and a page reload continues where it left off.
- Pause, Resume, Reset and the speed buttons are on the **Operator console**. Operators control only their assigned shuttle; administrators control any shuttle.
- Only one animation loop runs, and it stops while every shuttle is paused.
- If map tiles cannot load (no internet), the app switches to the built-in **route diagram**. You can switch between Map and Route diagram at any time.
- Speeds, waiting times and start positions are in `src/data/campus.ts` (`simulationProfiles`).

### Phase 3 files

New: `src/simulator/routePath.ts`, `src/simulator/timeline.ts`, `src/simulator/clock.ts`, `src/simulator/controls.ts`, `src/components/SimulationProvider.tsx`, `src/components/CampusMap.tsx`, `src/components/MapPanel.tsx`, `src/hooks/useSimulation.ts`, `src/hooks/useShuttleMarkers.ts`, `tests/simulator.test.ts`, `tests/simulationUi.test.tsx`, `tests/mapPanel.test.tsx`.

Removed: `src/data/previewSnapshots.ts` (the fixed Phase 2 positions). If you copy these files into your existing folder instead of using this folder, delete that file.

No new packages are needed. Leaflet was installed in Phase 1.

### Phase 3 checklist

Run inside the project folder:

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run dev
```

`npm test` should report **7 test files and 85 tests passed**. Then check:

- [ ] Live board: the yellow SH-01 marker moves along the green route on the map, and the ETA counts down.
- [ ] The status changes between **Moving** and **At stop**, and "Stops ahead" shows an arrival time for every stop.
- [ ] Clicking **SH-02** highlights the second shuttle, which runs the other way round.
- [ ] Sign in as **Operator** in a second tab. Clicking **Pause** shows "Paused" and "On hold" on the student tab too, and the marker stops.
- [ ] **Resume** continues from the same place, without a jump.
- [ ] **5x** makes the shuttle move five times faster. **Reset** returns it to Main Gate, and **Start** sets it off again.
- [ ] **Route diagram** shows the same moving shuttle without any map tiles. With Wi-Fi off, the app switches to it on its own and explains why.
- [ ] The **DEMO SIMULATION — NOT LIVE GPS** label is visible on the live board and the operator console.

## Route-aware bookings (Phase 4)

Students book one seat for a journey on a shuttle's **current run**. A run is one trip round the loop, starting and ending at Main Gate.

| Rule                                                                  | What the student sees                                                                                                                    |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Both stops must be chosen and must be different                       | "Pickup and destination must be different stops."                                                                                        |
| The shuttle must serve both stops                                     | "SH-01 does not stop at …"                                                                                                               |
| The shuttle must not have left the pickup yet on this run             | "SH-01 has already left Academic Block on this run …", plus the stops that can still be boarded                                          |
| The destination must come after the pickup in the shuttle's direction | "On this run, SH-01 does not reach Academic Block after Central Library. The run ends at Main Gate.", plus the stops that can be reached |
| The shuttle must have a free seat                                     | "SH-01 is full …"                                                                                                                        |
| One active booking per student per shuttle                            | "You already have a booking on SH-01 …"                                                                                                  |

- Every booking gets a unique ID such as `SCS-7K4P2Q` (no 0/O or 1/I/L, so it is easy to read aloud).
- A booking can be cancelled until the shuttle leaves the pickup stop. Cancelling releases the seat at once.
- Seats are **counted, never stored as a running total**, so a seat cannot be released twice. Cancelling an already cancelled booking is refused.
- Bookings are made one at a time behind a lock, so two students can never take the same last seat (see `tests/localBooking.test.ts`).
- **Known limitation:** capacity is counted for the whole shuttle, not per stretch of road. A booking holds its seat from the moment it is made until drop-off.
- Resetting a shuttle ends that shuttle's open bookings ("Run ended") and frees their seats.

In local demo mode bookings are saved in this browser only. Phase 5 moves the same rules into the database.

### Phase 4 checklist

`npm test` should report **10 test files and 135 tests passed**. Then, signed in as the demo student:

- [ ] Book a seat from Main Gate to Central Library. You get a booking ID and the live board shows one fewer free seat.
- [ ] Choose Central Library to Academic Block. The form explains why and the Book seat button stays disabled.
- [ ] Wait until SH-01 has left Academic Block, then try to board there. The form says the shuttle has already left.
- [ ] My bookings shows the booking with a live pickup countdown. Cancel it; the confirmation dialog appears, then the seat is released and the booking moves to History.
- [ ] Sign in as Admin. The Admin overview lists every booking and the seats in use.

## Supabase: accounts and persistent bookings (Phase 5)

With Supabase connected, accounts, simulation clocks and bookings live in a PostgreSQL database. Every phone and laptop then sees the same shuttle and the same seats, and a pause on the operator console reaches every screen through Supabase Realtime. Without Supabase the app keeps working in local demo mode.

### What protects the data

- **Row Level Security** is on for every table. Anyone may read the network (routes, stops, shuttles, timetables, clocks). People may read only their own profile and bookings. Administrators may read everything.
- **No direct writes.** The browser cannot insert, update or delete any row. Bookings, cancellations and simulation controls go through database functions (`book_seat`, `cancel_booking`, `control_shuttle`). These check the caller with `auth.uid()` and apply every booking rule on the server.
- **Roles come from the database.** New accounts are always students, whatever the browser sends. Only the SQL editor (and, in Phase 6, administrators) can change a role.
- **No overbooking.** `book_seat` locks the shuttle row (`SELECT … FOR UPDATE`) before counting seats, so simultaneous bookings for the last seat take turns and only one succeeds. `cancel_booking` locks the booking row, so a booking cannot be cancelled twice.
- Only the **publishable** key is used in the browser. Never put the secret or service-role key in `.env.local`.

### Supabase setup (about 10 minutes)

1. Create a free project at [supabase.com](https://supabase.com). Choose a region near you (for example Mumbai) and save the database password somewhere safe.
2. **Optional, recommended for a hackathon demo:** go to **Authentication → Sign In / Providers → Email** and turn off **Confirm email**. New accounts can then sign in at once. With it on, the app tells new users to click the link in their email first.
3. Open **SQL Editor → New query**. Paste and run each file below **in this order**, one at a time. Each should finish with "Success. No rows returned":
   1. `supabase/migrations/20261021000001_schema.sql`
   2. `supabase/migrations/20261021000002_functions.sql`
   3. `supabase/migrations/20261021000003_security.sql`
   4. `supabase/migrations/20261021000004_admin.sql` (added in Phase 6)
   5. `supabase/migrations/20261022000005_demo_reset.sql` (added in Phase 8)
   6. `supabase/seed.sql`
4. Open **Project Settings → API Keys** and copy the **publishable** key. Copy the **project URL** from **Project Settings → Data API**.
5. In VS Code, copy `.env.example` to a new file called `.env.local` in the project folder, and paste in the two values:

   ```bash
   VITE_SUPABASE_URL=https://abcdefghijkl.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

6. Stop the dev server (Ctrl + C) and start it again with `npm run dev`. Vite only reads `.env.local` when it starts. The footer should now say **Saved to Supabase**.
7. Create accounts with **Create account** in the app. Everyone starts as a student. To make your **first** administrator (and, if you like, an operator), run this in the SQL Editor with your own email addresses. After that, administrators can change roles from the Users tab:

   ```sql
   update public.profiles set role = 'admin' where email = 'admin@yourmail.com';
   update public.profiles set role = 'operator', assigned_shuttle_id = 'sh-01' where email = 'driver@yourmail.com';
   ```

   Sign out and in again to see the new role.

If you change `src/data/campus.ts` (stops, shuttles, speeds), run `npm run db:seed` to regenerate `supabase/seed.sql`, then run that file in the SQL Editor again.

### Testing the database without Supabase

`npm test` includes `tests/database.test.ts`. It runs the **real migration files and seed** in an embedded PostgreSQL ([PGlite](https://pglite.dev)), signs in as different users, and checks RLS, booking rules, cancellation and simulation permissions. The file `tests/db/supabaseStub.sql` provides a test-only copy of the parts of Supabase the migrations use. Never run it on your Supabase project.

PGlite has a single connection, so it cannot run two bookings truly in parallel. The test checks the shuttle row lock instead, and the local demo tests (`tests/localBooking.test.ts`) run twelve simultaneous bookings against five seats.

### Phase 5 checklist

`npm test` should report **12 test files and 185 tests passed**. Then, with Supabase set up:

- [ ] The footer says **Saved to Supabase**, and the demo account buttons are gone from the sign-in page.
- [ ] Register a student, book a seat, then refresh. The booking is still there.
- [ ] Open the live board on a second device (or a private window). Pause SH-01 from an operator account; both screens show **Paused** within a second.
- [ ] Sign in as a second student. They cannot see the first student's booking. Book the last seat on a shuttle with capacity 1 from both at once; only one succeeds.
- [ ] In the SQL Editor, `select * from public.bookings;` shows the bookings with their booking IDs.

## Operator and admin dashboards (Phase 6)

**Operator console** (operators see only their assigned shuttle; administrators can open any shuttle):

- Start, Pause, Resume, Reset and 1x / 2x / 5x speed, as in Phase 3.
- **Passengers on this run:** every current booking with booking ID, name, journey and status (waiting or on board). It also lists, stop by stop, how many people board and get off, with arrival times.

**Admin overview**, in four tabs (the open tab is kept in the address, e.g. `/app/admin?tab=bookings`):

| Tab                | What administrators can do                                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Overview           | Active bookings, seats in use across the fleet, bookings and cancellations today, and a live card per shuttle with a **Control** button |
| Bookings           | Search by booking ID or passenger name, filter by status and shuttle, and cancel upcoming bookings (with confirmation)                  |
| Users              | See every account and change its role. Operators must be given a shuttle. Administrators cannot remove their own admin role             |
| Shuttles and stops | Rename shuttles and change their seats (never below the seats already booked). Stops and routes are shown read-only                     |

Stops, routes and timings stay in `src/data/campus.ts`, because every timetable is calculated from them. Run `npm run db:seed` after changing that file.

### Phase 6 database migration

If you set up Supabase in Phase 5, run one more file in the SQL Editor:

- `supabase/migrations/20261021000004_admin.sql`

It lets operators read bookings on their own shuttle, and adds `admin_update_user` and `admin_update_shuttle`. Both check the caller is an administrator, and the shuttle change uses the same row lock as booking. From now on, administrators can change roles in the app instead of the SQL Editor.

### Phase 6 checklist

`npm test` should pass every test (Phase 7 lists the current count). Then:

- [ ] As the demo student, book a seat on SH-01 and another on SH-02.
- [ ] As Admin, the Overview shows 2 active bookings and a card for each shuttle. **Control SH-02** opens the operator console for SH-02.
- [ ] Bookings tab: search for the student's name, filter by status, and cancel one booking. It turns to **Cancelled** and the seat is released.
- [ ] Users tab: make the student an operator of SH-02. Try to make yourself a student; the dialog explains why not.
- [ ] Shuttles and stops tab: rename SH-01 and set 12 seats. The live board shows the new name and "… of 12".
- [ ] As the operator, the console lists the SH-01 passenger and shows "1 boarding" at Main Gate.

## Testing and verification (Phase 7)

```bash
npm run verify                    # typecheck, lint, all unit tests, build
npx playwright install chromium   # first time only
npm run test:e2e                  # browser tests, including accessibility scans
```

[TESTING.md](TESTING.md) lists what each test proves, the coverage measured, what Phase 7 fixed, a manual check list for demo day and the known limitations.

### Phase 7 checklist

- [ ] `npm run verify` ends without errors and reports **16 test files, 228 tests passed** (15 files and 212 tests at the end of Phase 7).
- [ ] `npm run test:e2e` reports **11 passed** (9 at the end of Phase 7).
- [ ] `npm run test:coverage` passes its minimums; open `coverage/index.html` to browse it.
- [ ] Work through the manual checks in TESTING.md on your demo laptop.

## Deployment and presentation (Phase 8)

The app deploys as a normal website on **Vercel** or **Netlify**; visitors need only a browser. `vercel.json` and `netlify.toml` contain the build settings, page rewrites and security headers, so there is nothing to configure except the two optional Supabase variables.

| Guide                              | What is inside                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [DEPLOYMENT.md](DEPLOYMENT.md)     | Environment variables, Supabase setup, Vercel and Netlify steps, a live-site checklist, troubleshooting |
| [PRESENTATION.md](PRESENTATION.md) | The pitch, a 5-minute demo script, roles, architecture, jury questions, backup plan, demo-day checklist |

New in Phase 8:

- **Start a fresh demo** (Admin → Overview) removes every booking and restarts both shuttles at 1x, after a confirmation. Accounts, roles and shuttle settings are kept. In Supabase it runs in one database function, `admin_reset_demo`, that only administrators can call.
- `npm run preview` sends the production security headers, so you can test them locally.
- Confirmation emails return people to the site they signed up on.

### Phase 8 database migration

If your Supabase project already has the Phase 5 and 6 files, run only `supabase/migrations/20261022000005_demo_reset.sql` in the SQL Editor.

### Phase 8 checklist

- [ ] `npm run verify` and `npm run test:e2e` pass.
- [ ] As Admin, **Start a fresh demo** asks first, then the overview shows 0 seats in use.
- [ ] Deploy on Vercel or Netlify and work through the checklist in DEPLOYMENT.md section 6.
- [ ] Rehearse the demo in PRESENTATION.md at least twice, once from the backup link.

## Data modes

| Mode       | When                               | Where data lives                 |
| ---------- | ---------------------------------- | -------------------------------- |
| Local demo | No Supabase values in `.env.local` | This browser only (temporary)    |
| Supabase   | Valid values in `.env.local`       | Supabase PostgreSQL (persistent) |

Copy `.env.example` to `.env.local` to configure Supabase (Phase 5). Only the publishable key belongs in frontend config.

## Project structure

```
src/
  components/   reusable UI pieces
  pages/        one file per screen
  layouts/      page shells (sidebar, header)
  hooks/        reusable React logic
  services/     data access: local demo and Supabase versions of each service
  booking/      booking rules: journeys, booking states, booking IDs
  lib/          setup and configuration helpers
  types/        shared TypeScript types
  data/         demo routes, stops and shuttles
  simulator/    shuttle movement engine (no React)
  utils/        small pure helper functions
supabase/
  migrations/   database schema, functions, security policies (run in order)
  seed.sql      demo data, generated by scripts/generate-seed.ts
scripts/        tools such as the seed generator (npm run db:seed)
tests/          Vitest + React Testing Library tests
e2e/            Playwright browser tests (npm run test:e2e)
vercel.json     Vercel build settings and security headers
netlify.toml    Netlify build settings and security headers
```

## Build status

- [x] Phase 1 — project setup
- [x] Phase 2 — UI, navigation and dashboard
- [x] Phase 3 — map and shuttle simulator
- [x] Phase 4 — route-aware bookings
- [x] Phase 5 — Supabase auth, database and RLS
- [x] Phase 6 — operator and admin dashboards
- [x] Phase 7 — testing and verification
- [x] Phase 8 — deployment and presentation guide
