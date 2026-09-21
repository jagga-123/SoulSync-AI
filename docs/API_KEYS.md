# API keys and secrets: the complete list

Every key the app can use, where to get it, whether you need it, and **where to put it**.
Nothing else needs a key.

**Where things go**

| Place | What it holds |
|---|---|
| `backend/.env` (local) — or **Render / Railway → Environment** (live) | **Every secret.** AI, email, payments, database, JWT… |
| **Vercel → Environment Variables** (frontend) | **Only** `NEXT_PUBLIC_API_URL` (and optionally `NEXT_PUBLIC_SOCKET_URL`). Never put a secret here — `NEXT_PUBLIC_*` values are visible to every visitor. |

`backend/.env` is git-ignored. After editing it locally, **restart the backend** (`tsx watch` reloads on code changes, not on `.env` changes).
Check your setup any time: `cd backend && NODE_ENV=production npm run check:env` (prints what's set, never the values).

---

## 1. Minimum for a public beta

| # | Variable | Where to get it | Goes in |
|---|---|---|---|
| 1 | `MONGODB_URI` | MongoDB Atlas → Connect → Drivers | backend |
| 2 | `JWT_SECRET` | **You generate it** (below) | backend |
| 3 | `CLIENT_URL` | Your Vercel URL, `https://…` | backend |
| 4 | `NODE_ENV=production` and `TRUST_PROXY=1` | fixed values | backend |
| 5 | `ADMIN_EMAILS` | Your own email (becomes admin once verified) | backend |
| 6 | AI: `GROQ_API_KEY` (primary) + `GEMINI_API_KEY` (fallback) | Groq console / Google AI Studio (section 2) | backend |
| 7 | Email: `EMAIL_PROVIDER=brevo` + `BREVO_API_KEY` (+ optional `RESEND_API_KEY` / `SENDGRID_API_KEY` fallbacks) + `EMAIL_FROM` | Brevo / Resend / SendGrid (section 3) | backend |
| 8 | `METRICS_TOKEN`, `CRON_SECRET` | **You generate them** | backend |
| 9 | `NEXT_PUBLIC_API_URL` | Your API URL + `/api` | **Vercel** |

Recommended: `SENTRY_DSN` (section 6), `API_PUBLIC_URL`.
Later, when you're ready: payments (section 4) and Cloudinary (section 5).

Generate the secrets you make up yourself (Node is already installed):

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"   # JWT_SECRET  (run again for each secret)
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"   # METRICS_TOKEN, CRON_SECRET
```

---

## 2. AI: Groq (primary) → Gemini (fallback)

Every AI request goes to **Groq first**. If Groq fails for any reason (error, timeout, rate limit), the same request goes to **Gemini**. If both fail, the app uses its built-in analysis engine, so nothing breaks. Groq is fast (well under a second), which matters because the interview makes one model call per answer.

**Groq** → get the key at **https://console.groq.com/keys**
**Gemini** → get the key at **https://aistudio.google.com/apikey → "Create API key"**

```env
GROQ_API_KEY=gsk_xxxxxxxx
GROQ_MODEL=qwen/qwen3.8-27b            # verified working on the project's Groq account — see below
GEMINI_API_KEY=your-key-here
GEMINI_MODEL=gemini-flash-lite-latest  # verified working; the "-latest" alias keeps following Google's current lite model
```

Both models were chosen by probing every model the accounts can use (`npm run check:ai -- --models` lists them and tests each configured provider live). `qwen/qwen3.8-27b` answered in ~0.4 s with valid JSON and uses the fewest tokens per call; `gemini-flash-lite-latest` passed 6/6 probes at ~1.4 s. Avoid `gemini-2.5-flash` (Google returns 404 for keys created recently) and `llama-3.3-70b-versatile` (not offered to this Groq account). Re-run `npm run check:ai` after changing a key or model.

- **`GROQ_API_KEY` set → Groq is always primary**, whatever `AI_PROVIDER` says (only `AI_PROVIDER=local` still switches all external AI off). Without a Groq key, the previous behaviour applies unchanged (`AI_PROVIDER=gemini`, `auto`, …).
- **Check the model against your account.** Groq only serves the models your organisation has access to: `GET https://api.groq.com/openai/v1/models` (with your key) lists them, and a wrong name fails with `model_not_found`. Every failure is logged as `AI provider groq failed`, so a wrong model shows up in the logs, not as an outage.
- **Free-tier limits.** On Groq's free `on_demand` tier `qwen/qwen3.8-27b` allows about 7,000 input tokens per minute, 1,000 requests per day. Every interview answer is one call and carries the transcript so far, so roughly 5–7 people interviewing at the same moment (or ~60 interviews a day) use it up. A short "try again in 1.2 s" from Groq is retried once; anything longer goes straight to Gemini, then to the built-in engine — members never see an error. Upgrade the Groq plan before real traffic.
- **Extra fallbacks.** If you also set `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY`, they are tried after Gemini (Groq → Gemini → OpenAI → Anthropic → built-in engine). They are optional.
- The AI powers the interview questions, personality analysis, match explanations, and the paid *AI deep analysis* perk. Which provider answered each request is stored with the result (`provider` / `providerModel`), logged, and counted in `/api/metrics` as `ai_requests_total{task,provider,status}`.
- The key is server-side only. Never put it in Vercel or in the frontend.
- Watch usage in Google AI Studio / Cloud Console and set a budget alert **before** turning on the `ai_deep_analysis` flag (it is the only feature that makes AI calls per paying user on demand).

---

## 3. Email (verification, welcome, match alerts, weekly report)

Until this is set, emails are only written to the server log (`EMAIL_PROVIDER=log`) and nobody receives anything.

With `EMAIL_PROVIDER=brevo`, `resend` or `sendgrid`, mail goes through a **fallback chain: Brevo → Resend → SendGrid**, each provider only if its key is set. If one fails, the next is tried; only if all fail is the email recorded as failed (Admin → System → Email log shows which provider actually delivered). `smtp` and `log` are standalone. The provider named in `EMAIL_PROVIDER` is tried first, so use `brevo` to get the order above.

**Brevo (primary)** → https://brevo.com — two ways to connect, the app picks by the key it finds:

*A. REST API (recommended: returns Brevo's message id, and can be checked against your verified senders)*
```env
EMAIL_PROVIDER=brevo
BREVO_API_KEY=xkeysib-xxxxxxxx                         # Brevo → SMTP & API → API keys tab
EMAIL_FROM="SoulSync AI <sender-verified-in-brevo@yourdomain.com>"     # must be a sender verified in Brevo
EMAIL_REPLY_TO=support@yourdomain.com                  # optional, a mailbox you read
```
*B0. SMTP relay only — simplest (`EMAIL_PROVIDER=smtp`): no Brevo API, no fallbacks, nothing else to configure*
```env
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=xxxxxx@smtp-brevo.com                        # Brevo → SMTP & API → SMTP tab → "Login"
SMTP_PASS=xsmtpsib-xxxxxxxx                            # an SMTP key from the same tab
EMAIL_FROM="SoulSync AI <a-sender-verified-in-Brevo@yourdomain.com>"
EMAIL_REPLY_TO=support@yourdomain.com
```
Every email is sent **From `EMAIL_FROM`** and **Reply-To `EMAIL_REPLY_TO`** — read from the environment and nowhere else. The code has no default and no fallback sender, and `EMAIL_FROM` is required for every provider except `log`, so the sender can't drift from the address you verified in Brevo. At startup the server logs `Active sender: <EMAIL_FROM>`, verifies the SMTP connection (a failure is logged as a warning and never stops the app), and `GET /api/email/health` reports `{ smtpConnected, provider, activeSender, replyTo, senderConfigured, readyForProduction, status, warnings }` — never hosts, logins or keys (the sender and reply-to are already visible in the headers of every email). It answers 503 when the SMTP login or connection fails, and `readyForProduction` stays `false` for a free-mail sender such as a gmail.com address (Gmail/Yahoo can't align SPF/DKIM/DMARC for it, so real mail may be rejected or spam-foldered).

*B. Brevo through `EMAIL_PROVIDER=brevo` with the SMTP key (keeps the Resend → SendGrid fallbacks)*
```env
EMAIL_PROVIDER=brevo
BREVO_API_KEY=xsmtpsib-xxxxxxxx                        # the SMTP key (SMTP & API → SMTP tab → "Generate a new SMTP key")
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=xxxxxx@smtp-brevo.com                        # the "Login" shown on that same SMTP tab — NOT necessarily your account email
EMAIL_FROM="SoulSync AI <sender-verified-in-brevo@yourdomain.com>"     # must be a sender verified in Brevo
```
- An SMTP key (`xsmtpsib-…`) is **not** accepted by Brevo's REST API ("Key not found"), and the API key isn't accepted by the relay — that's why the config differs. With B the app refuses to start until `SMTP_USER` is set (so a half-configured Brevo can't silently drop every email).
- If Brevo fails, the app logs the exact reason, retries **once** (only for temporary errors: timeouts, 5xx, 429), then falls back to Resend, then SendGrid. It never crashes or fails a sign-up because of email.
- If you turned on Brevo's **authorised IP** restriction (Security), add your server's IP or requests are refused.
- Brevo only sends from a **verified sender** (Senders, Domains & Dedicated IPs → Senders). For real deliverability also authenticate your **domain** there (it shows the SPF/DKIM/DMARC DNS records). A free-mail address (gmail.com) can be verified as a sender for testing, but can't be authenticated, so expect spam-foldering in production.
- Check everything at any time: `npm run check:email`; send a real test with `npm run check:email -- --send-test --to you@example.com` (`--all-templates` sends all 11 emails).

**Resend (first fallback)** → https://resend.com
```env
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_xxxxxxxx
EMAIL_FROM="SoulSync AI <sender-verified-in-brevo@yourdomain.com>"
```
Add your sending domain in Resend and publish the DNS records it shows (SPF + DKIM; add DMARC too). Until a domain is verified, Resend only delivers to your own account address, which is fine for testing.

**SendGrid (last fallback)** → https://sendgrid.com
```env
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG.xxxxxxxx
EMAIL_FROM="SoulSync AI <sender-verified-in-brevo@yourdomain.com>"     # must be a verified sender/domain
```

**Any SMTP server** (for example Gmail with an *app password*: Google Account → Security → 2-Step Verification → App passwords)
```env
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@gmail.com
SMTP_PASS=your-16-char-app-password
EMAIL_FROM="SoulSync AI <you@gmail.com>"
```

Also set `API_PUBLIC_URL=https://<your-api-host>/api` so notification emails (matches, messages, weekly report) carry the one-click `List-Unsubscribe` + `List-Unsubscribe-Post` headers that Gmail and Yahoo expect. Every email is sent under the single `EMAIL_FROM` identity, as HTML + plain text, in a mobile-friendly layout.

---

## 4. Payments (only when you're ready to charge; the `billing` flag stays off until then)

Choose **one** provider with `PAYMENT_PROVIDER`. (`mock` is the no-keys sandbox for development; it is **refused in production**.)
The prices shown in the app come from `backend/src/features/plans.ts`, but the provider charges **its own** price — **create yours to match**:

| Plan | Monthly | Yearly |
|---|---|---|
| Premium | $9.99 · ₹799 | $99 · ₹7,990 |
| Premium Plus | $19.99 · ₹1,599 | $199 · ₹15,990 |

**Stripe (USD)** → https://dashboard.stripe.com (start in *test mode*)
```env
PAYMENT_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_test_xxx                 # Developers → API keys      (sk_live_… when live)
STRIPE_WEBHOOK_SECRET=whsec_xxx               # Developers → Webhooks → your endpoint → Signing secret
STRIPE_PRICE_PREMIUM_MONTHLY=price_xxx        # Products: create 4 recurring prices,
STRIPE_PRICE_PREMIUM_YEARLY=price_xxx         #   then copy each price_… id
STRIPE_PRICE_PLUS_MONTHLY=price_xxx
STRIPE_PRICE_PLUS_YEARLY=price_xxx
```
Webhook endpoint: `https://<api>/api/billing/webhook/stripe` — events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`.

**Razorpay (INR)** → https://dashboard.razorpay.com (start in *test mode*; Subscriptions must be enabled on your account)
```env
PAYMENT_PROVIDER=razorpay
RAZORPAY_KEY_ID=rzp_test_xxx                  # Settings → API keys        (rzp_live_… when live)
RAZORPAY_KEY_SECRET=xxx
RAZORPAY_WEBHOOK_SECRET=xxx                   # you choose this when creating the webhook
RAZORPAY_PLAN_PREMIUM_MONTHLY=plan_xxx        # Subscriptions → Plans: create 4 plans,
RAZORPAY_PLAN_PREMIUM_YEARLY=plan_xxx         #   then copy each plan_… id
RAZORPAY_PLAN_PLUS_MONTHLY=plan_xxx
RAZORPAY_PLAN_PLUS_YEARLY=plan_xxx
```
Webhook endpoint: `https://<api>/api/billing/webhook/razorpay` — events: `subscription.activated`, `subscription.charged`, `payment.failed`, `subscription.pending`, `subscription.halted`, `subscription.updated`, `subscription.cancelled`, `subscription.completed`.
Amounts in paise: 79900 / 799000 (Premium) and 159900 / 1599000 (Plus).

---

## 5. Photo storage: Cloudinary (optional, can wait)

The profile form has an **Upload photo** button (preview, replace, remove; JPG/PNG/WebP, max 5 MB). Where the file goes depends on what is configured:

- **Nothing set, development** → stored on the API server's disk (`backend/uploads/`, free). Photos are re-encoded to WebP with EXIF/GPS stripped and get a 256 px thumbnail. This is switched **off in production** (most hosts wipe the disk on every deploy) unless you set `LOCAL_UPLOADS=on` and point `UPLOAD_DIR` at a persistent volume.
- **Cloudinary configured** (free plan is plenty for a beta) → the browser uploads straight to Cloudinary using a signature from this API, thumbnails come from a Cloudinary crop URL, and replaced/removed photos are deleted from Cloudinary.
- **Neither** → members can still paste an image link, exactly as before.

```env
CLOUDINARY_CLOUD_NAME=xxx        # Cloudinary dashboard → Product Environment Credentials
CLOUDINARY_API_KEY=xxx
CLOUDINARY_API_SECRET=xxx
```

---

## 6. Monitoring (recommended)

```env
SENTRY_DSN=https://xxx@oxxx.ingest.sentry.io/xxx    # sentry.io → New Project (Node) → Client Keys (DSN)
SENTRY_ENVIRONMENT=production                        # optional
METRICS_TOKEN=<generated, 16+ chars>                 # protects GET /api/metrics; unset = endpoint disabled in production
CRON_SECRET=<generated>                              # only needed if you trigger jobs from an external cron (JOBS_ENABLED=false)
```
An uptime monitor (UptimeRobot / Better Stack) on `GET /api/health` needs no key.

---

## 7. Everything else has a safe default. Leave it alone

`PORT` (Render/Railway set it), `JWT_EXPIRES_IN` (7d), `AI_REQUEST_TIMEOUT_MS`, `ANTHROPIC_*`, `OPENAI_*`, `RATE_LIMIT_*`, `LOG_LEVEL`, `JOBS_ENABLED`, `FEATURE_FLAGS`, `CLIENT_ORIGINS` (only for extra domains), `*_BASE_URL` and `STRIPE_API_*` (test doubles only).
The full annotated list is in [`backend/.env.example`](../backend/.env.example).

## 8. Safety rules for keys

- Keys live **only** in `backend/.env` or your host's environment page. Never in code, git, chat messages or screenshots.
- If a key is ever exposed, **rotate it** at the provider immediately (Google AI Studio, Resend, Stripe, …).
- Use **test/sandbox keys** first for Stripe, Razorpay and email; switch to live keys only after the test flow works end to end.
- `JWT_SECRET` must never change after launch unless you're happy to sign everyone out.
