# Deployment guide

How to take SoulSync AI from your laptop to a public beta:

| Piece | Where | Config file |
|---|---|---|
| Frontend (Next.js) | **Vercel** | [`vercel.json`](../vercel.json) |
| API + Socket.IO (Express) | **Render** *or* **Railway** | [`render.yaml`](../render.yaml) · [`backend/railway.json`](../backend/railway.json) |
| Database | **MongoDB Atlas** | — |
| Photo storage | **Cloudinary** (optional, ready) | — |
| Email | **Resend** / SendGrid / SMTP | — |
| Payments | **Stripe** (USD) / **Razorpay** (INR) | — |
| Errors (optional) | **Sentry** | — |

```
Browser ──https──▶ Vercel (Next.js) ──REST + WebSocket──▶ Render/Railway (API) ──▶ MongoDB Atlas
                                                                │
                              Stripe / Razorpay ──webhooks──────┘──▶ Resend · Cloudinary · Sentry
```

Work through this top to bottom, then use [`LAUNCH_CHECKLIST.md`](LAUNCH_CHECKLIST.md).
Every key you will need, where to get it and where it goes: [`API_KEYS.md`](API_KEYS.md).
Every step below can be done on free/test tiers first.

> **Golden rule:** deploy with everything paid **off**. Paid features are behind feature
> flags that ship disabled, so a fresh deploy behaves exactly like the free product. You
> switch things on later from `/admin/flags`, without redeploying.

---

## 0. Before you start

- A GitHub repo containing this project (Render, Railway and Vercel all deploy from Git).
- Node 22.12+ locally (`backend/package.json` "engines" allows 22.12 – 24; `render.yaml` pins Node 24, the same as the live service).
- Generate secrets you'll paste later:
  ```bash
  openssl rand -hex 64     # JWT_SECRET (>= 32 chars is enforced in production)
  openssl rand -hex 24     # METRICS_TOKEN, CRON_SECRET
  ```
- Validate a candidate environment *before* deploying — it runs the exact checks the server does at boot:
  ```bash
  cd backend
  NODE_ENV=production npm run check:env
  ```

## 1. MongoDB Atlas

1. Create a cluster (M0 free is fine for beta; M10+ when you have real traffic — it adds backups).
2. **Database Access** → add a user with a strong generated password and the `readWrite` role on one database (e.g. `soulsync`).
3. **Network Access** → allow your API host. Render/Railway use shared egress IPs that change, so for a beta the usual choice is `0.0.0.0/0` **combined with** the strong credentials above; move to a private link / static egress IPs when you upgrade.
4. **Connect → Drivers** → copy the `mongodb+srv://…` string, add the database name and `?retryWrites=true&w=majority`.
5. Turn on **backups** (Atlas → Backup) as soon as your tier allows.

The API creates its own collections and indexes on first boot. The connection has explicit
socket/server-selection timeouts, so a database outage fails fast and the readiness probe
flips to `503` instead of hanging requests.

## 2. API on Render (or Railway)

### Render (Blueprint)

1. Render dashboard → **New → Blueprint** → select the repo. It reads [`render.yaml`](../render.yaml).
2. Fill the prompted variables (see the table in §9). Secrets marked `generateValue` are created for you.
3. Deploy. The health check is `/api/health/ready` — Render only routes traffic once MongoDB is reachable.

Notes on the blueprint:

- **Plan:** use an always-on instance. Free plans sleep, which drops WebSocket connections and delays the first request.
- **Build:** `npm ci --include=dev && npm run build` — TypeScript is a dev dependency and is needed to compile. Runtime is `node dist/server.js`. `backend/.npmrc` (`include=dev`) keeps devDependencies installed even when `NODE_ENV=production` is set and a dashboard Build Command is a plain `npm install` (otherwise the build fails with `tsc: not found`).
- **TypeScript is pinned to 7.0.x** (`~7.0.2` + `package-lock.json`). TypeScript 7 removed `"moduleResolution": "node10"`; `backend/tsconfig.json` uses `"module": "CommonJS"` + `"moduleResolution": "Bundler"` (needs TypeScript 6 or newer — it fails on 5.x). Don't loosen the pin to `^`/`latest`, and commit `package-lock.json` whenever it changes. TypeScript 7 ships a native compiler as optional platform packages, so don't install with `--omit=optional`.
- **`NODE_ENV=production` has consequences:** the server refuses to start unless `JWT_SECRET` is ≥ 32 characters, `CLIENT_URL` is `https://`, `PAYMENT_PROVIDER` isn't `mock` and rate limiting is on — and **photo uploads turn off** unless Cloudinary is configured or `LOCAL_UPLOADS=on` (see the photo section below).
- **`mongodb-memory-server`** (tests only) would download a MongoDB binary during every build that installs devDependencies; `backend/package.json` disables that postinstall (`config.mongodbMemoryServer.disablePostinstall`).
- **`TRUST_PROXY=1`:** Render puts exactly one proxy in front of the app. Without this, every visitor shares one IP and the rate limiter locks everyone out together.

### Railway

New Project → **Deploy from GitHub** → set the service **root directory** to `backend`. [`backend/railway.json`](../backend/railway.json) supplies build/start/health settings. Add the same variables (with `TRUST_PROXY=1`).

### Scaling note (important)

Socket.IO rooms and online-presence are held in the API process's memory. **Run one instance** for the beta —
that comfortably serves thousands of concurrent chats. Before scaling to several instances, add the
Socket.IO Redis adapter (and sticky sessions or websocket-only transport). Everything else (rate limits use the
database-independent per-instance store, scheduled jobs use a database lock) is safe to scale, but the rate-limit
counters are per instance.

## 3. Frontend on Vercel

1. Vercel → **Add New → Project** → import the repo. Framework is auto-detected as Next.js; keep the **root directory** at the repo root (the frontend lives there; `backend/` is a separate project).
2. **Environment variables:**

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://<your-api-host>/api` |
   | `NEXT_PUBLIC_SOCKET_URL` | *(optional)* only if the WebSocket origin differs from the API origin |

3. Deploy.

`NEXT_PUBLIC_*` variables are baked in **at build time** (and feed the Content-Security-Policy's `connect-src`),
so changing them requires a redeploy.

The build already ships production security headers ([`next.config.ts`](../next.config.ts)): a CSP scoped to your
API/WebSocket origins, `X-Frame-Options: DENY`, HSTS, `Referrer-Policy`, `Permissions-Policy`, and no `X-Powered-By`.

## 4. Wire the two together

After both deploys you know both URLs. Set on the **API**:

| Variable | Value |
|---|---|
| `CLIENT_URL` | your Vercel URL, e.g. `https://soulsync.vercel.app` (**must be `https://`** — enforced) |
| `CLIENT_ORIGINS` | extra allowed origins, comma-separated: your custom domain, a staging site. *(Vercel preview URLs are not allowed unless you list them.)* |
| `API_PUBLIC_URL` | `https://<your-api-host>/api` — enables one-click `List-Unsubscribe` headers in email |

Redeploy the API. Then open the site → **Register** → the request should succeed. If the browser console
shows a CORS error, `CLIENT_URL`/`CLIENT_ORIGINS` doesn't match the exact origin (scheme + host, no trailing slash).

## 5. Email

Set `EMAIL_PROVIDER` to `brevo`, `resend` or `sendgrid` and mail goes through a fallback chain — **Brevo → Resend → SendGrid**,
each only if its key is set; the provider named in `EMAIL_PROVIDER` is tried first. (`smtp` is standalone, with no fallback.)
See [API_KEYS.md](API_KEYS.md#3-email-verification-welcome-match-alerts-weekly-report) for each provider's key.

**Brevo (primary)**
1. Create an account → **Senders, domains & dedicated IPs** → add and authenticate your sending domain (SPF, DKIM; add DMARC too).
2. **SMTP & API → API Keys** → create an API key (`xkeysib-…`). (Only have the SMTP key `xsmtpsib-…`? It works through Brevo's SMTP relay
   instead — also set `SMTP_USER` to the SMTP login from the SMTP tab; see [API_KEYS.md](API_KEYS.md#3-email-verification-welcome-match-alerts-weekly-report).)
3. Set `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY=…`, `EMAIL_FROM="SoulSync AI <sender-verified-in-brevo@yourdomain.com>"` (a sender verified in Brevo), optionally
   `EMAIL_REPLY_TO`, and `API_PUBLIC_URL` (for the one-click unsubscribe header).
4. Run `npm run check:email` (Brevo key, verified sender, SPF/DKIM/DMARC, templates), then
   `npm run check:email -- --send-test --to you@example.com` to send a real test email through the live chain.

**Resend (optional fallback)**
1. Create an account → **Domains** → add your sending domain and add the DNS records it shows (SPF, DKIM; add a DMARC record too).
2. Wait for the domain to verify, then create an API key.
3. Set `RESEND_API_KEY=…` (and `EMAIL_PROVIDER=resend` if you want Resend first instead of Brevo).

Send yourself a test: register with your own address and check the welcome + verification emails arrive
(not in spam). Admin → **System → Email log** shows every attempt with its outcome and any provider error.

Behaviour worth knowing: the app never fails a request because email failed; notification emails go only to
**verified** addresses and respect each member's preferences; message alerts are throttled to one per
conversation per 30 minutes.

## 6. Payments (do this last, in test mode first)

Even with a provider configured, checkout stays closed until you switch on the **`billing`** flag.

### Stripe (USD)

1. Dashboard (test mode) → **Products**: create **Premium** and **Premium Plus**, each with a **monthly** and a **yearly** recurring price. That's four price IDs.
2. **Developers → Webhooks → Add endpoint**: URL `https://<your-api-host>/api/billing/webhook/stripe`, events:
   `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`.
3. Copy the endpoint's **signing secret**.
4. Set on the API: `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and
   `STRIPE_PRICE_PREMIUM_MONTHLY`, `STRIPE_PRICE_PREMIUM_YEARLY`, `STRIPE_PRICE_PLUS_MONTHLY`, `STRIPE_PRICE_PLUS_YEARLY`.
5. Test end-to-end with test cards (`4242 4242 4242 4242`) — or locally with the Stripe CLI:
   `stripe listen --forward-to localhost:5000/api/billing/webhook/stripe`.

### Razorpay (INR)

1. Dashboard (test mode) → **Subscriptions → Plans**: create four plans (Premium/Plus × monthly/yearly) and copy their `plan_…` IDs.
2. **Settings → Webhooks**: URL `https://<your-api-host>/api/billing/webhook/razorpay`, a secret of your choosing, events:
   `subscription.activated`, `subscription.charged`, `payment.failed`, `subscription.pending`, `subscription.halted`, `subscription.updated`, `subscription.cancelled`, `subscription.completed`.
3. Set: `PAYMENT_PROVIDER=razorpay`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, and the four `RAZORPAY_PLAN_*` IDs.

### How webhooks are handled (so you can trust and debug them)

- The signature is verified against the **raw body** before anything else; a bad signature is `400` and changes nothing.
- Each provider event is recorded once (idempotent): a redelivery is a harmless `200`.
- An event that can't be applied *yet* (e.g. an invoice arriving before its checkout) answers `503`, so the provider retries later.
- Prices come from the server's plan table and the provider's own price/plan IDs — never from anything the browser sends.

### Going live

Repeat with live keys, live webhook endpoint and live price IDs, do one real purchase with a small amount and refund it, then switch `billing` on for everyone.
`PAYMENT_PROVIDER=mock` (the sandbox) is **refused in production** by the boot-time checks.

## 7. Photo storage (Cloudinary)

Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` for production. The profile form's **Upload photo**
button then asks `POST /api/uploads/sign` for a short-lived **signed** ticket confined to the member's own folder and to image
formats, and uploads straight to Cloudinary — the API secret never leaves the server and image bytes never pass through the API.
Replacing or removing a photo deletes the old one from Cloudinary.

Without Cloudinary, development uses the free local fallback (`LOCAL_UPLOADS=auto`: files under `backend/uploads/`, validated,
re-encoded to WebP with EXIF stripped, 256 px thumbnail). It is **off in production** by default because the disk is ephemeral on
Render/Railway; if you enable it anyway (`LOCAL_UPLOADS=on`), mount a persistent disk and set `UPLOAD_DIR` to it. With neither,
members can paste an image link.

## 8. Scheduled jobs

Two jobs run: `subscription-expiry` (every 15 min) and `weekly-report` (hourly check; sends Monday ≥ 08:00 UTC, once per member per ISO week).

- **Simplest:** leave `JOBS_ENABLED=true`. They run inside the API, guarded by a database lock so several instances never double-run.
- **External cron** (e.g. a Render Cron Job or GitHub Actions, useful if your host sleeps): set `JOBS_ENABLED=false`, set `CRON_SECRET`, and call
  ```bash
  curl -X POST https://<api>/api/internal/jobs/subscription-expiry -H "x-cron-secret: $CRON_SECRET"
  curl -X POST https://<api>/api/internal/jobs/weekly-report        -H "x-cron-secret: $CRON_SECRET"
  ```
  every 15 minutes and hourly respectively.

Run either manually any time from **Admin → System → Run now**.

## 9. Environment variables

`backend/.env.example` documents every variable. The ones that matter for launch:

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | ✓ | `production` |
| `MONGODB_URI` | ✓ | Atlas connection string |
| `JWT_SECRET` | ✓ | ≥ 32 chars in production |
| `CLIENT_URL` | ✓ | `https://…` in production |
| `CLIENT_ORIGINS` | | Extra origins (custom domain, staging) |
| `API_PUBLIC_URL` | recommended | Enables one-click unsubscribe headers |
| `TRUST_PROXY` | ✓ | `1` on Render/Railway |
| `ADMIN_EMAILS` | ✓ | Becomes admin once that email is verified |
| `EMAIL_PROVIDER` + key, `EMAIL_FROM` | recommended | Otherwise emails are only logged. `brevo` → Resend → SendGrid fallback chain |
| `GROQ_API_KEY`, `GEMINI_API_KEY` | recommended | Groq answers first, Gemini is the fallback; with neither the built-in engine is used |
| `PAYMENT_PROVIDER` + keys | for monetisation | Never `mock` in production |
| `METRICS_TOKEN` | recommended | ≥ 16 chars; `/api/metrics` is disabled without it |
| `SENTRY_DSN` | recommended | Error tracking |
| `CRON_SECRET` / `JOBS_ENABLED` | one of them | See §8 |
| `CLOUDINARY_*` | optional | Photo uploads |
| `ANTHROPIC_API_KEY` etc. | optional | Without one, the built-in AI engine is used |
| `RATE_LIMIT_*` | | Defaults are sensible; **cannot be disabled** in production |

The server **refuses to start** in production if: `JWT_SECRET` is short, `CLIENT_URL` isn't `https`, the sandbox
payment provider is selected, rate limiting is disabled, or a chosen provider is missing its credentials. It prints
which setting is wrong.

## 10. Your first admin

1. Set `ADMIN_EMAILS=you@yourdomain.com` on the API and redeploy.
2. Register that address on the site and **click the verification link** in the email. An address in `ADMIN_EMAILS` becomes an admin *only after it's verified*, so nobody can claim it by registering first.
3. Sign in → account menu → **Admin dashboard**.
   (Alternative, from a shell on the server: `npm run make-admin -- you@yourdomain.com`.)

## 11. Monitoring

| What | How |
|---|---|
| Uptime | Point an external monitor (UptimeRobot, Better Stack…) at `GET /api/health` (liveness). Use `/api/health/ready` for "is the database up". |
| Errors | Set `SENTRY_DSN`. Unexpected 5xx responses are reported with the request id; request bodies and auth headers are stripped first. Browser render errors are reported through `/api/client-errors`. |
| Metrics | `GET /api/metrics` with `Authorization: Bearer $METRICS_TOKEN` (Prometheus format: request latency by route, socket connections, emails, payments, webhooks). |
| Logs | Structured JSON with a request id on every line and in the `x-request-id` response header — quote it from a user's bug report to find the exact request. |
| In-app | **Admin → System**: database, providers, jobs, email failures, and launch warnings. |

Suggested alerts: readiness failing for > 2 min; 5xx rate > 1%; webhook `error` outcomes > 0; email failures in 24h rising.

## 12. Rollback and kill switches

- **Bad deploy:** Render/Railway/Vercel each keep previous builds — roll back from their dashboards.
- **Bad feature:** flip its flag off in **Admin → Feature flags**; it takes effect within seconds, no deploy.
  (`billing` off stops new checkouts but never blocks cancellation.)
- **Data:** restore from an Atlas snapshot. Payment records are deliberately kept when an account is deleted.

## 13. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Browser: CORS error | `CLIENT_URL` / `CLIENT_ORIGINS` doesn't exactly match the site origin |
| Chat/notifications never go live | WebSocket blocked, or `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_SOCKET_URL` wrong (rebuild after changing) |
| Everyone gets `429` at once | `TRUST_PROXY` not set to `1` behind Render/Railway |
| Webhook `400` | Wrong signing secret, or something re-serialising the body in front of the API |
| Webhook `503` | Expected occasionally — the provider will retry |
| No emails arrive | `EMAIL_PROVIDER=log`; unverified recipient; check Admin → System → Email log |
| Deploy fails at boot | Read the message: it names the exact misconfigured variable |
| `/api/health/ready` is `503` | MongoDB unreachable — check Atlas network access and the connection string |
| `/api/metrics` is `404`/`401` | `METRICS_TOKEN` unset (disabled) or wrong |
