# End-to-end tests

`phase6.e2e.mjs` drives the **real web app in a real browser** (Chromium via
[`playwright-core`](https://playwright.dev)) against a running backend, frontend and database. It covers:

- Logged-out experience unchanged (landing, public pricing, waitlist)
- Registration through a referral link → login → verify email via the emailed link
- **Live notifications**: a like, a match and a chat message arrive as a toast and a bell badge with no refresh
- The bell dropdown, the Notification Center (filter, mark all read), and settings persistence
- Referrals page and inviting by email
- Safety: report from a match card, block from Discover, unblock in Settings
- **Admin**: role guard, KPI overview + chart, analytics (table view, funnel), the moderation queue (suspend →
  the member can't log in), user search + reinstate, feature-flag switch with confirmation
- **Premium**: locked perk → sandbox checkout → plan active with receipt → perk unlocks → cancel keeps access
- Waitlist (invite-only) mode blocks sign-up with a path to the waitlist
- Mobile (390px): no horizontal overflow on five pages; the bell dropdown fits the screen
- No unexpected browser console errors or uncaught exceptions

## Run it

You need MongoDB, the backend and the frontend running, **with the sandbox payment provider** (`PAYMENT_PROVIDER=mock`).
Use a throwaway database — the suite creates users and toggles feature flags (it resets the flags it touches at the start).
It runs fine against the default rate limits; a run makes ~20 login/register calls (limit: 30 per 15 min per IP), so leave
about 15 minutes between back-to-back runs, or set `RATE_LIMIT_AUTH_MAX=200` on the test backend.

**Tip:** run the frontend as a production build (`next build` then `next start`) rather than `next dev` — pages load in
about a second instead of tens of seconds, and it exercises the real security headers (CSP).

```powershell
# 1. A throwaway MongoDB
mongod --dbpath C:\temp\soulsync-e2e --port 27099 --bind_ip 127.0.0.1

# 2. Backend (from backend/)
$env:PORT="5100"; $env:MONGODB_URI="mongodb://127.0.0.1:27099/soulsync_e2e"
$env:CLIENT_URL="http://localhost:3100"; $env:PAYMENT_PROVIDER="mock"; $env:EMAIL_PROVIDER="log"
$env:JWT_SECRET="e2e-secret-e2e-secret-e2e-secret"; $env:JOBS_ENABLED="false"
npm run dev            # or: npx tsx src/server.ts > backend.log

# 3. Frontend (from the project root) — a production build is fastest
$env:NEXT_PUBLIC_API_URL="http://localhost:5100/api"
npx next build; npx next start -p 3100

# 4. The suite (from the project root)
$env:E2E_MONGODB_URI="mongodb://127.0.0.1:27099/soulsync_e2e"
$env:E2E_BACKEND_LOG="C:\path\to\backend.log"       # optional: lets it click the emailed verify link
npm run test:e2e
```

Install the browser once with `npx playwright-core install chromium` (or set `CHROMIUM_PATH` to an existing Chrome/Chromium).

| Variable | Default | Purpose |
|---|---|---|
| `E2E_WEB_URL` | `http://localhost:3100` | Frontend origin |
| `E2E_API_URL` | `http://localhost:5100/api` | API base |
| `E2E_MONGODB_URI` | *(required)* | The backend's database — used only to promote the admin account |
| `E2E_BACKEND_LOG` | *(optional)* | Backend log, to read the verification link (the `log` email provider prints it); that step is skipped without it |
| `E2E_OUT_DIR` | `e2e/screenshots` | Screenshots (every run; failures are saved as `FAIL-*.png`) |
| `PLAYWRIGHT_CORE_PATH`, `CHROMIUM_PATH` | | Where `playwright-core` / the browser live, if not the defaults |

The process exits non-zero if any step fails. Screenshots are a handy visual review of the new screens.
