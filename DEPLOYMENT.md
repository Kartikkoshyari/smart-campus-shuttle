# Deploying Smart Campus Shuttle (Phase 8)

The finished site is a normal web page: anyone opens the link in a browser on a laptop or phone. It needs no app install, no special hardware and no GPS. The shuttle movement is a simulation (DEMO SIMULATION — NOT LIVE GPS).

You can deploy in two ways:

| Option             | What you get                                                            | Needs Supabase? |
| ------------------ | ----------------------------------------------------------------------- | --------------- |
| **A. Demo only**   | Each visitor's browser runs its own demo. Fastest; nothing can go down. | No              |
| **B. Full system** | Everyone shares the same shuttles, seats and accounts in real time.     | Yes             |

Both use the same code. The only difference is whether the two Supabase environment variables are set.

---

## 1. Before you start

1. On your computer, run `npm run verify`. It must finish without errors.
2. Put the project on GitHub. In VS Code: **Source Control** (Ctrl + Shift + G) → **Publish to GitHub** → choose **private** or public.
3. Check that `.env.local` was **not** uploaded. Open the repository on github.com: you should see `.env.example` but no `.env.local`. (`.gitignore` keeps it out.)

## 2. Environment variables

| Name                            | Value                                       | Where to find it                       |
| ------------------------------- | ------------------------------------------- | -------------------------------------- |
| `VITE_SUPABASE_URL`             | `https://<your-project-ref>.supabase.co`    | Supabase → Project Settings → Data API |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` (older projects: "anon") | Supabase → Project Settings → API Keys |

- For **Option A**, set **neither** of them.
- Never add the **secret** or **service_role** key. Anything starting with `VITE_` is readable by every visitor. If you do paste one by mistake, the app refuses to use it and shows a warning, but rotate that key in Supabase straight away.
- Vite copies these values into the site **when it builds**. After adding or changing them, you must **redeploy**.

## 3. Prepare Supabase (Option B only)

Do this once per Supabase project. If you followed the Phase 5 setup, you only need the steps marked **new**.

1. Open **SQL Editor → New query** and run each file **in this order**, one at a time. Each should end with "Success":
   1. `supabase/migrations/20261021000001_schema.sql`
   2. `supabase/migrations/20261021000002_functions.sql`
   3. `supabase/migrations/20261021000003_security.sql`
   4. `supabase/migrations/20261021000004_admin.sql`
   5. `supabase/migrations/20261022000005_demo_reset.sql` (**new** in Phase 8: the "Start a fresh demo" button)
   6. `supabase/seed.sql` (safe to run again at any time; it restores the demo shuttles)
2. **New:** open **Authentication → URL Configuration**.
   - **Site URL:** your deployed address, for example `https://smart-campus-shuttle.vercel.app`.
   - **Redirect URLs:** add `https://smart-campus-shuttle.vercel.app/**` and, for local work, `http://localhost:5173/**`.

   Confirmation emails then open your live site instead of `localhost`.

3. Optional for a hackathon: **Authentication → Sign In / Providers → Email** → turn off **Confirm email**, so new accounts can sign in at once.
4. Create your own account on the live site, then make it an administrator in the SQL Editor:

   ```sql
   update public.profiles set role = 'admin' where email = 'you@yourmail.com';
   ```

   Sign out and in again. From then on, change roles from **Admin → Users**.

## 4a. Deploy on Vercel

The project includes `vercel.json`, so Vercel already knows the build settings, the page rewrites and the security headers.

1. Sign in at [vercel.com](https://vercel.com) with GitHub.
2. **Add New… → Project**, then **Import** your repository.
3. Check the settings Vercel shows (they come from `vercel.json`):

   | Setting          | Value           |
   | ---------------- | --------------- |
   | Framework Preset | Vite            |
   | Install Command  | `npm ci`        |
   | Build Command    | `npm run build` |
   | Output Directory | `dist`          |

4. Open **Environment Variables** and add the two values from section 2 (Option B), or leave it empty (Option A).
5. Press **Deploy**. After about a minute you get an address such as `https://smart-campus-shuttle.vercel.app`.
6. If you later change an environment variable: **Deployments → ⋯ → Redeploy**.

If the build complains about the Node version, set **Project Settings → Build and Deployment → Node.js Version** to **22.x** or newer.

## 4b. Deploy on Netlify

The project includes `netlify.toml` with the same build settings, rewrites and headers.

1. Sign in at [app.netlify.com](https://app.netlify.com) with GitHub.
2. **Add new project → Import an existing project → GitHub**, and pick your repository.
3. Netlify reads `netlify.toml`, so the build command is `npm run build`, the publish directory is `dist`, and Node 22 is used.
4. Before or after the first deploy, open **Project configuration → Environment variables** and add the two values from section 2 (Option B only).
5. Press **Deploy**. Your site gets an address such as `https://smart-campus-shuttle.netlify.app`.
6. After changing an environment variable: **Deploys → Trigger deploy → Deploy site**.

Use the site address from Netlify as the **Site URL** in Supabase (section 3, step 2).

## 5. What the deployment files do

| File             | Purpose                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| `vercel.json`    | Build settings, rewrite of every page address to `index.html`, security headers                |
| `netlify.toml`   | The same, for Netlify                                                                          |
| `vite.config.ts` | `npm run preview` sends the same headers, so you can test them on your laptop before deploying |

The security headers:

- **Content-Security-Policy** lets the page load only its own scripts and styles, OpenStreetMap tiles and Supabase (`https://*.supabase.co` and `wss://*.supabase.co` for Realtime). Everything else is blocked.
- **Permissions-Policy** switches off location, camera and microphone. The app never asks for your location.
- **X-Frame-Options** and `frame-ancestors 'none'` stop other sites from embedding the app.
- Files in `/assets/` have names that change on every build, so browsers may cache them for a year.

`tests/deployConfig.test.ts` checks that both files agree. The browser tests run with these headers and fail on any blocked request.

## 6. Check the live site

Open the deployed address and tick these off. Use a phone on mobile data for at least one of them, so you know it works outside your own network.

- [ ] The landing page loads and shows **DEMO SIMULATION — NOT LIVE GPS**.
- [ ] Open `https://<your-site>/app/book` directly in a new tab. You reach the sign-in page, not a 404.
- [ ] The footer says **Saved to Supabase** (Option B) or **Local demo data** (Option A).
- [ ] Sign in, watch both shuttles move on the map and switch to the **Route** diagram.
- [ ] Book a seat and cancel it.
- [ ] Option B: register a new account from your phone; book there and see the booking on the laptop's **Admin → Bookings**.
- [ ] Option B: pause SH-01 on the operator console; the phone's board shows **Paused** within a second or two.
- [ ] Press F12 → **Console**. There are no red "Content Security Policy" errors.
- [ ] F12 → **Network** → click the first request → **Response Headers** include `content-security-policy` and `permissions-policy`.
- [ ] On a phone, nothing scrolls sideways and the menu opens and closes.
- [ ] As administrator, press **Start a fresh demo** just before presenting.

## 7. Troubleshooting

| What you see                                                        | Likely cause and fix                                                                                                                                                                                                       |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **404** when reloading `/app/...`                                   | The host is not reading `vercel.json` / `netlify.toml`. Keep them in the project's top folder (next to `package.json`). On Netlify, leave **Base directory** empty.                                                        |
| Footer still says **Local demo data** after adding Supabase         | Variables were added after the build, or are misspelled. Both names must start with `VITE_`. Redeploy after fixing.                                                                                                        |
| "A secret/service-role key was found…"                              | You pasted the secret key. Replace it with the **publishable** key, redeploy, and rotate the secret key in Supabase.                                                                                                       |
| "Shuttle positions could not be loaded"                             | Wrong project URL, the project is paused, or the migrations have not run. Check the URL, open the Supabase dashboard (free projects can be paused when unused) and run the SQL files in section 3.                         |
| "permission denied for function …" or "Could not find the function" | A migration is missing or ran out of order. Run the missing files in order (the error names the function), then run `notify pgrst, 'reload schema';` in the SQL Editor. Only `seed.sql` is meant to be run more than once. |
| **Start a fresh demo** says the demo was not reset                  | Run `20261022000005_demo_reset.sql` and make sure you are signed in as an administrator.                                                                                                                                   |
| The confirmation email opens `localhost`                            | Set **Site URL** and **Redirect URLs** in Supabase (section 3, step 2).                                                                                                                                                    |
| New users see "Open the confirmation link we emailed you"           | Email confirmation is on. Click the link, or turn **Confirm email** off for the demo.                                                                                                                                      |
| Other screens do not update until refreshed                         | Realtime is not reaching them. Check **Database → Publications → supabase_realtime** lists `shuttle_clocks`, `shuttles` and `bookings` (migration 3 adds them). Campus Wi-Fi may also block WebSockets; try mobile data.   |
| The map is grey and the **Route** diagram appears instead           | The network blocks OpenStreetMap tiles. The app keeps working with the diagram. If you changed the tile address, also add it to `img-src` in both deployment files.                                                        |
| Console shows "Refused to connect … Content Security Policy"        | You use a Supabase custom domain or a local Supabase (`http://127.0.0.1:54321`). Add that address to `connect-src` in **both** `vercel.json` and `netlify.toml`, then run `npm test`.                                      |
| Build fails at `npm ci`                                             | `package-lock.json` is out of date. Run `npm install` on your computer, commit the updated lock file and push.                                                                                                             |
| Build fails with a Node.js error                                    | Use Node 22 or newer (see sections 4a and 4b).                                                                                                                                                                             |

## 8. Running the production build on your laptop

Useful as a backup if the venue's internet fails (Option A works fully offline except for map tiles, and then shows the route diagram):

```bash
npm run build
npm run preview      # opens http://localhost:4173 with the production headers
```

To let a phone on the same Wi-Fi open it, run `npm run preview -- --host` and open the "Network" address it prints.
