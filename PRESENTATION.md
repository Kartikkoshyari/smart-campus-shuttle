# Hackathon presentation guide

## The pitch in one breath

> Students waste time at shuttle stops because they cannot see where the shuttle is or whether it has a seat. Smart Campus Shuttle shows every shuttle on a campus map with live arrival times and seat counts, and lets students book a seat from any stop. Seats are checked by the server, so the shuttle can never be overbooked.

Say straight after it, before anyone asks:

> Today's movement is a **simulation** on demo coordinates, clearly labelled on screen. It is not live GPS and it is not our university's real map. The booking, accounts and security are fully real.

## Setup on the demo laptop

Open these before you walk up, each signed in and positioned:

| Window                   | Account                          | Page                    |
| ------------------------ | -------------------------------- | ----------------------- |
| 1. Student (main screen) | `student@shuttle.test` or yours  | Dashboard               |
| 2. Operator              | `operator@shuttle.test` or yours | Operator console, SH-01 |
| 3. Administrator         | `admin@shuttle.test` or yours    | Admin overview          |
| Phone (Option B only)    | a second student account         | Dashboard               |

- **Option A (demo only):** use separate windows of the **same browser**. They share the demo through browser storage. A phone would run its own separate demo.
- **Option B (Supabase):** any device works. A phone on mobile data proves it is a real shared system.
- Ten minutes before: Admin → **Start a fresh demo**, speed **1x**, zoom the browser to 110–125% so the back row can read it.

## The 5-minute demo

| Time      | Do                                                                                                                                                      | Say                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:30 | Landing page. Point at the yellow label.                                                                                                                | The pitch, then the honesty line above.                                                                                                      |
| 0:30–1:15 | Window 1: the map with two shuttles moving in opposite directions. Point at the departure board, then switch to **Route**.                              | "SH-01 runs clockwise, SH-02 anticlockwise on the same loop. Every stop has an arrival time that counts down in real seconds."               |
| 1:15–2:15 | **Book a seat**: Main Gate → Boys' Hostel. Show the journey check, book, show the code `SCS-…`.                                                         | "The app picks the run that actually reaches your destination after your pickup. If the shuttle has already left your stop, it tells you."   |
| 2:15–2:40 | Try Central Library → Academic Block on SH-01.                                                                                                          | "This journey goes against SH-01's direction, so it is explained, not booked."                                                               |
| 2:40–3:20 | Window 2: operator presses **Pause**. Switch back to Window 1 (or show the phone): **Paused**. Press **5x**, then back to **1x**.                       | "One operator controls the shuttle; every screen follows instantly. Operators can control only their own shuttle; the database checks that." |
| 3:20–4:10 | Window 3: admin overview with seats in use. **Bookings** tab: find the booking. **Users** tab: roles. **Shuttles and stops**: try seats below bookings. | "Administrators manage people and shuttles. You cannot set fewer seats than are already booked, and nobody can promote themselves."          |
| 4:10–5:00 | Close on the architecture slide.                                                                                                                        | "React and Leaflet on the front, Supabase PostgreSQL with Row Level Security on the back, 228 automated tests and 11 browser tests."         |

If you have only **2 minutes**: landing label → book a seat → operator pause seen on the student screen → one sentence on security.

## The three roles

| Role          | Can                                                                                            | Cannot                                         |
| ------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Student       | See shuttles, stops, ETAs and seats; book and cancel their own seats                           | See other students' bookings; control shuttles |
| Operator      | Start, pause, resume, reset and change the speed of their assigned shuttle; see its passengers | Control other shuttles; change roles           |
| Administrator | Everything above for every shuttle; manage roles, shuttle names and seats; start a fresh demo  | Remove their own administrator role            |

New accounts are always students. A role can only be changed in the database, by an administrator, never by the browser.

## Architecture (for one slide)

```
 Browser (React + TypeScript, Vite)
 ├── Leaflet map with OpenStreetMap tiles  ──┐  falls back to a route diagram offline
 ├── Simulator: position = clock + time       │  pure TypeScript, no GPS
 └── Services (one interface, two versions)   │
       ├── Local demo   → browser storage     │  works with no backend at all
       └── Supabase     → HTTPS + Realtime ───┘
                              │
 Supabase
 ├── Auth (email + password)
 ├── PostgreSQL
 │    ├── book_seat / cancel_booking / control_shuttle / admin_* functions
 │    │     check auth.uid() and the caller's role, lock the shuttle row
 │    └── Row Level Security on every table; no direct writes from browsers
 └── Realtime: clocks, seats and bookings pushed to every screen
```

## What is real and what is simulated

| Real                                                          | Simulated                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Accounts, roles, sign-in (Supabase Auth)                      | Shuttle positions: computed from a timetable along a drawn route         |
| Bookings, cancellations, capacity, booking codes (PostgreSQL) | Stop coordinates: demo values, not any real university                   |
| Security rules (Row Level Security and server functions)      | Speed: 6 m/s with a 15-second stop at each stop, adjustable to 2x and 5x |
| Realtime sync between devices                                 |                                                                          |

## Questions the jury may ask

**Is this real GPS?**
No, and the screen says so. Shuttle positions come from a simulation clock. The design keeps the map, ETAs and bookings separate from where the position comes from, so a real GPS feed from a driver's phone could replace the simulator later without changing the booking system.

**How do you stop two people taking the last seat?**
Booking runs inside one database function. It locks the shuttle's row (`SELECT … FOR UPDATE`) before counting seats, so two requests for the last seat take turns and the second one is told the shuttle is full. Tests run twelve simultaneous bookings against five seats and get exactly five.

**Could a student make themselves an admin from the browser?**
No. The browser has no write access to any table. New accounts are created as students by a database trigger whatever the browser sends, and role changes go through a function that checks the caller is already an administrator.

**Where are the API keys?**
Only the Supabase publishable key is in the website, which is designed to be public; Row Level Security protects the data. The secret key is never used. The app even refuses a secret key if someone pastes one in by mistake.

**What happens when the internet fails?**
In demo mode, everything except the map tiles runs in the browser; the map switches to a route diagram automatically. With Supabase, the app shows a clear message and a **Try again** button.

**How did you test it?**
228 automated tests: the simulator, the booking rules, every screen, and the real SQL migrations running in an in-memory PostgreSQL (PGlite) with different users signed in. Plus 11 browser tests in Chromium, including accessibility scans (WCAG 2 A and AA) and a phone-width check.

**Why does the seat count hold a seat for the whole trip?**
A booked seat is counted from booking until drop-off for the whole shuttle. It is simpler and can never overbook. Counting per section of the route would fit more passengers and is the next improvement.

**What would you build next?**
A driver app sharing real GPS (with the driver's consent), per-section seat counting, push notifications ("your shuttle is 2 minutes away"), more routes, and usage reports for the transport office.

## Backup plan

| If this fails | Do this                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------- |
| Venue Wi-Fi   | Phone hotspot. If that also fails, run `npm run preview` on the laptop (local demo mode). |
| Map tiles     | Nothing: the app switches to the Route diagram by itself. Say "offline fallback".         |
| Supabase      | Open the Option A (demo only) deployment, or `npm run preview` without `.env.local`.      |
| The laptop    | Open the deployed link on any borrowed laptop or phone.                                   |
| Everything    | Play the screen recording you made the day before.                                        |

Keep a second deployment in **Option A** (no Supabase variables) as a ready backup link.

## Demo-day checklist

**The day before**

- [ ] `npm run verify` and `npm run test:e2e` pass.
- [ ] Deployed site checked with the list in DEPLOYMENT.md section 6, including on a phone using mobile data.
- [ ] Supabase project opened in the dashboard, so it is not paused.
- [ ] Demo accounts created and roles set (student, operator for SH-01, administrator).
- [ ] A 2-minute screen recording of the full demo saved on the laptop and a phone.
- [ ] QR code of the site address on your last slide.

**One hour before**

- [ ] Laptop charged, charger packed, notifications and sleep turned off.
- [ ] Windows 1–3 open and signed in; the phone signed in as a second student.
- [ ] Admin → **Start a fresh demo**; all shuttles at **1x**.
- [ ] Browser zoom set; bookmarks bar hidden; other tabs closed.

**On stage**

- [ ] Say "simulation, not GPS" in the first 30 seconds.
- [ ] Keep to the script; finish on the architecture slide and the QR code.
