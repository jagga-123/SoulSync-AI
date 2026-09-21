# Public beta launch checklist

Tick these off in order. Anything marked **🔑** needs real credentials or a real account that only you can
create — the code paths behind them are built and tested against local stand-ins, but they have not been run
against the live vendor.

Legend: ✅ already verified in this repository · ☐ you do this.

---

## 1. Verified in the repository (re-run any time)

| Check | Command | Status |
|---|---|---|
| Backend unit + integration tests (470) | `cd backend && npm test` | ✅ 470 / 470 |
| Backend type-check | `cd backend && npm run typecheck` | ✅ |
| Frontend lint, type-check, production build (34 routes) | `npm run lint && npm run build` | ✅ |
| Browser end-to-end (registration → live notifications → checkout → moderation → admin flags) | `npm run test:e2e` (see [`e2e/README.md`](../e2e/README.md)) | ✅ |
| Production environment guards | `NODE_ENV=production npm run check:env` | ✅ (fails on unsafe config) |

## 2. Infrastructure

- ☐ MongoDB Atlas cluster created, dedicated DB user (`readWrite` on one database), network access set, **backups on**
- ☐ API deployed on Render/Railway on an **always-on** plan, **single instance** (Socket.IO presence is in-memory)
- ☐ Frontend deployed on Vercel with `NEXT_PUBLIC_API_URL` pointing at the API
- ☐ Custom domains attached (site + API) with HTTPS; `CLIENT_URL` / `CLIENT_ORIGINS` updated to match
- ☐ `GET /api/health/ready` returns `200`; the platform health check uses it
- ☐ A registration works from the deployed site (proves CORS, DB, JWT end to end)
- ☐ WebSockets connect (send a message between two accounts; the bell updates without refreshing)

## 3. Configuration and secrets

- ☐ `NODE_ENV=production npm run check:env` passes with the production values (no errors)
- ☐ `JWT_SECRET` is a fresh 64-byte random value (not reused from dev)
- ☐ `TRUST_PROXY=1` on Render/Railway
- ☐ `ADMIN_EMAILS` set; **you verified that email address** and can open `/admin`
- ☐ `METRICS_TOKEN` and `CRON_SECRET` set to random values
- ☐ No secrets in git, in Vercel `NEXT_PUBLIC_*` variables, or in logs
- ☐ Admin → System shows **no launch warnings** you don't accept

## 4. Email 🔑

- ☐ Sending domain verified with the provider; **SPF, DKIM and DMARC** records published
- ☐ Registration delivers the welcome + verification emails to Gmail *and* Outlook — inbox, not spam
- ☐ The verification link works; an expired/used link shows a helpful message
- ☐ Unsubscribe link in a match/weekly email works and is honoured
- ☐ Admin → System → Email log shows `sent`, not `failed`

## 5. Payments 🔑 (leave the `billing` flag **off** until this section is done)

- ☐ Provider **test mode** end to end: checkout → plan active → receipt in Billing → upgrade → cancel → access until period end
- ☐ Webhook endpoint created; a **replayed** webhook does not double-charge or double-credit
- ☐ A failed test payment shows "payment failed" to the member and marks the plan past-due
- ☐ Price IDs / plan IDs match your real price list (the app charges what the provider's price says)
- ☐ Live mode: keys, webhook endpoint and prices swapped in; one real small purchase made **and refunded**
- ☐ Refund / dispute / support email address published; you know where to see payments in the provider dashboard
- ☐ *Then* switch `billing` on in Admin → Feature flags

## 6. Safety and moderation

- ☐ You have tested Report → it appears in Admin → Moderation → you can resolve it
- ☐ You have tested Block from a profile card and from a chat, and Unblock in Settings
- ☐ You have tested suspending an account: they're signed out immediately and can't log back in
- ☐ At least two people (with the admin role) can staff the moderation queue, and you've agreed a response time
- ☐ Community guidelines are written and linked (the suspension email refers to them)
- ☐ Age policy is stated: 18+ (a report reason exists for suspected under-age accounts)

## 7. Legal and privacy 🔑 (needs your lawyer / policy owner)

- ☐ Privacy policy published. It must say that, **when an AI provider is configured, interview answers are sent to that vendor** (Anthropic / OpenAI / Google), and what you retain
- ☐ Terms of service published; subscription, cancellation and refund terms match how billing actually works (cancel = access until period end)
- ☐ Data deletion: you have a process for "delete my account" requests (Admin → Users → Delete removes account, profile, matches, messages; payment records are retained for accounting)
- ☐ Cookie/storage note: the app stores a session token in the browser's local storage (no third-party cookies or trackers are added by Phase 6)
- ☐ Sub-processors listed (hosting, database, email, payments, error tracking, AI)

## 8. Monitoring and on-call

- ☐ External uptime monitor on `/api/health`, alerting to a channel you'll actually see
- ☐ `SENTRY_DSN` set; trigger a test error and confirm it arrives without any tokens or request bodies
- ☐ Metrics scraped (or at least confirmed reachable) with the `METRICS_TOKEN`
- ☐ Decide who is on call for the first week, and where they see alerts
- ☐ Scheduled jobs confirmed: Admin → System shows `subscription-expiry` and `weekly-report` with a recent successful run

## 9. Manual smoke test on production (15 minutes, two browsers)

- ☐ Register A and B → verify emails → complete profiles
- ☐ A likes B → **B's bell updates live** → B accepts → both see "It's a match!"
- ☐ Chat both ways; typing indicator; a message to an offline member produces a notification
- ☐ AI interview end to end → personality report → AI-scored Discover
- ☐ Settings: toggle a preference, reload, it persists
- ☐ Referrals page shows a code; the link `…/register?ref=CODE` credits the referrer as *pending*
- ☐ Pricing page correct in your currency; (test-mode) purchase → Premium features unlock immediately
- ☐ Mobile: 390px wide — no horizontal scrolling on pricing, billing, settings, notifications, admin

## 10. Rollout plan for the feature flags

Everything paid ships **off**. A calm order to turn things on (Admin → Feature flags), each one observed for a day:

1. **Day 0:** launch with defaults (notifications, email, referrals, reporting, blocking on).
2. **Waitlist mode** *(optional soft launch)*: turn `waitlist_mode` on, then invite people in batches from Admin → Waitlist so you control growth and support load.
3. **`billing`** — once §5 is done.
4. **`advanced_filters`, `priority_recommendations`, `read_receipts_insights`** — the low-cost Premium perks.
5. **`like_limits` + `unlimited_likes`** — introduces a paywall on existing behaviour; do this deliberately and announce it.
6. **`profile_boost`.**
7. **`ai_deep_analysis`** — last: it uses your AI provider and costs money per use. Set a budget alert with the provider first.
8. **`referral_rewards`** — pays out free Premium (including anything already earned), so turn it on when you're ready to honour it.

Each flag has a confirm dialog when it changes what people pay or get. **To roll back, flip the flag off** — it takes effect in seconds.

## 11. Launch day

- ☐ Announce to the first batch only; keep `waitlist_mode` on so you can pace it
- ☐ Watch Admin → Overview (registrations, active users), Admin → Moderation, Admin → System, Sentry
- ☐ Check the email log for failures every few hours on day one
- ☐ Reply to the first support emails fast — early impressions set the tone

## 12. First 72 hours

- ☐ Review Analytics: interview completion rate, match rate, message rate, funnel drop-offs
- ☐ Clear the moderation queue daily; look at anyone with multiple distinct reporters first
- ☐ Read the audit log for anything unexpected
- ☐ Reconcile a sample of payments in the provider dashboard against Admin → Analytics → Revenue
- ☐ Decide what to change before opening the next batch

---

## Known limitations (be aware, none block a beta)

- **Single API instance.** Presence and Socket.IO rooms are in memory. Add the Socket.IO Redis adapter before running more than one instance.
- **Rate-limit counters are per instance** (fine with one instance).
- **Real vendors not exercised.** Stripe, Razorpay, Resend, SendGrid, SMTP, Cloudinary and Sentry integrations are tested over real HTTP/SMTP against local stand-ins with genuine signatures and payload shapes — but not against the live services. That's what §4, §5 and §8 are for.
- **Photo upload button.** The signed-upload API is ready; the profile form still takes an image URL (unchanged from Phase 2).
- **Email verification is not required to log in** — it gates notification emails and admin promotion, not access.
- **Weekly report timing** is UTC (Mondays from 08:00) for everyone.
- **Chat moderation is reactive** — moderators see the reported member's messages in the reported chat; there is no proactive scanning.
