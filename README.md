# SoulSync AI

An AI-powered dating platform. This repo contains the marketing site, the
Phase 2 authentication/profile foundation, Phase 3 match discovery, Phase 4
real-time chat, Phase 5 — the AI interview, personality report and
AI-scored matches — and Phase 6, the production platform (notifications,
email, premium plans and payments, admin dashboard, analytics, safety,
referrals and deployment). A Next.js frontend and a separate Express/MongoDB
backend.

## Tech stack

**Frontend** — Next.js 15 (App Router), TypeScript, Tailwind CSS, Shadcn UI,
Framer Motion, GSAP, Lenis, Socket.IO client.

**Backend** (`backend/`) — Node.js, Express, TypeScript, MongoDB Atlas via
Mongoose, JWT auth, bcrypt password hashing, Zod validation, Socket.IO,
`express-rate-limit`, and the official Anthropic, OpenAI and Google GenAI SDKs
(each loaded only when that provider is configured).

## Project structure

```
SoulSync-AI/
├─ src/                     # Next.js app (landing page + app pages)
│  ├─ app/
│  │  ├─ page.tsx           # Landing page
│  │  ├─ login/             # /login
│  │  ├─ register/          # /register
│  │  ├─ onboarding/        # /onboarding (create or edit profile)
│  │  ├─ dashboard/         # /dashboard
│  │  ├─ discover/          # /discover — browse + like profiles
│  │  ├─ likes/             # /likes — incoming / outgoing tabs
│  │  ├─ matches/           # /matches
│  │  ├─ ai-interview/      # /ai-interview — chat with the AI interviewer
│  │  ├─ personality-report/# /personality-report — your AI-generated profile
│  │  └─ messages/          # /messages, /messages/[conversationId]
│  │     └─ layout.tsx      # Scopes SocketProvider to the chat route subtree
│  ├─ components/
│  │  ├─ auth/              # Auth forms + shared auth UI
│  │  ├─ dashboard/         # Dashboard view
│  │  ├─ discover/          # Profile card + discover grid
│  │  ├─ likes/             # Like card + tabbed likes view
│  │  ├─ matches/           # Match card (reuses the compatibility ring)
│  │  ├─ chat/              # socket-provider, conversations list, chat view,
│  │  │                     # message bubble/input, typing indicator
│  │  ├─ ai/                # interview view, streaming text, thinking/analysing
│  │  │                     # states, personality report, match pill + insights,
│  │  │                     # dashboard AI section
│  │  ├─ shared/            # EmptyState, ProfileMedia — cross-page reuse
│  │  └─ ui/                # Shadcn UI primitives
│  ├─ hooks/
│  │  ├─ use-require-auth.ts
│  │  └─ use-ai-compatibility.ts   # lazy, cached per-match AI insight fetch
│  ├─ lib/
│  │  ├─ api/               # Typed API calls (auth, profile, discover, likes,
│  │  │                     # matches, conversations, messages, ai)
│  │  ├─ validators/        # Zod schemas mirroring the backend
│  │  ├─ api-client.ts      # fetch wrapper (attaches JWT, parses errors)
│  │  ├─ auth-storage.ts    # localStorage token helpers
│  │  ├─ ai-format.ts       # archetype/trait copy, tier labels, display helpers
│  │  └─ format.ts          # getInitials, relationship-goal labels, time formatting
│  └─ types/                # api.ts (shared REST types), socket.ts (Socket.IO event types)
│
└─ backend/                 # Express API
   └─ src/
      ├─ config/            # env validation, MongoDB connection
      ├─ controllers/       # req/res only — thin
      ├─ services/          # business logic
      ├─ models/            # Mongoose schemas (User, Profile, Like, Match,
      │                     # Conversation, Message, InterviewSession,
      │                     # AIProfile, MatchInsight)
      ├─ validators/        # Zod request schemas
      ├─ middleware/        # auth (JWT), validation, rate limiting, error handling
      ├─ routes/
      ├─ ai/                # AI layer: provider abstraction (providers/), controlled
      │                     # vocabularies, interviewer, analysis (LLM + built-in
      │                     # engine), compatibility engine, explanations, prompt
      │                     # validation + response sanitization
      ├─ socket/            # Socket.IO server setup, JWT auth middleware,
      │                     # event handlers, presence tracking, typed event contracts
      ├─ utils/             # ApiResponse, ApiError, asyncHandler, jwt,
      │                     # compatibility engine, public-profile shaping
      ├─ app.ts             # Express app (middleware + routes)
      └─ server.ts          # HTTP server + Socket.IO, connects to DB, listens
```

## Prerequisites

- Node.js 18+
- A MongoDB connection string — either a free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) cluster, or a local `mongod` instance.

## Setup

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Fill in `backend/.env`:

| Variable | Description |
|---|---|
| `PORT` | Port the API listens on (default `5000`) |
| `MONGODB_URI` | MongoDB Atlas (or local) connection string |
| `JWT_SECRET` | Long random string used to sign JWTs (e.g. `openssl rand -hex 64`) |
| `JWT_EXPIRES_IN` | Token lifetime, e.g. `7d` |
| `CLIENT_URL` | Frontend origin, for CORS (`http://localhost:3000` in dev) |
| `AI_PROVIDER` | `auto` (default), `claude`, `openai`, `gemini`, or `local` — see [AI providers](#ai-providers) |
| `GROQ_API_KEY` / `GROQ_MODEL` | Optional. When set, Groq is the primary AI provider and Gemini the automatic fallback (default model `qwen/qwen3.8-27b`) |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | Optional. With none set, the app runs on the built-in analysis engine |
| `BREVO_API_KEY` | Optional. Primary email provider (`EMAIL_PROVIDER=brevo`); Resend and SendGrid keys are its fallbacks. An API key (`xkeysib-…`) uses Brevo's REST API; an SMTP key (`xsmtpsib-…`) plus `SMTP_USER` uses its SMTP relay. A failed send is retried once, then falls back |
| `EMAIL_FROM` / `EMAIL_REPLY_TO` | The single sender identity every email uses (must be verified with your provider) and an optional Reply-To |
| `ANTHROPIC_MODEL` / `OPENAI_MODEL` / `GEMINI_MODEL` | Optional model overrides (defaults: `claude-opus-5`, `gpt-4o-mini`, `gemini-flash-lite-latest`) |
| `AI_REQUEST_TIMEOUT_MS` | Per-request provider timeout (default `30000`) |

```bash
npm run dev
```

The API starts at `http://localhost:5000`. Check it with `curl http://localhost:5000/api/health`.

**No AI key is needed to run Phase 5** — the interview, report and matching all
work on the built-in engine; add a key later to upgrade the question writing,
analysis and match explanations.

### 2. Frontend

From the project root:

```bash
cp .env.local.example .env.local
npm install
npm run dev
```

`.env.local` only needs one variable:

```
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

The site runs at `http://localhost:3000`. The Socket.IO client connects to
the API origin derived from `NEXT_PUBLIC_API_URL` (strips the trailing
`/api`) — set `NEXT_PUBLIC_SOCKET_URL` explicitly only if that origin isn't
what you want (e.g. the API is behind a different host/port than the REST
routes in some deployment).

Both servers need to be running for registration, login, onboarding and the
dashboard to work — the landing page itself has no backend dependency.

## Auth flow

```
Register (POST /api/auth/register)
        ↓
Login (POST /api/auth/login) → JWT returned
        ↓
Token stored in localStorage
        ↓
Profile exists?  ──No──→ /onboarding → create profile (POST /api/profile)
        │Yes                                    │
        ↓                                        ↓
   /dashboard  ←───────────────────────────────────
```

Phase 5 extends that into conversation-based matching:

```
Basic profile → /ai-interview (15–25 answers) → AI analysis → AIProfile
        → /personality-report → /discover ("AI Recommended", scored) → /matches
        (AI insights) → chat
```

The dashboard's "Your AI profile" section is the funnel into it: interview
status, personality summary, and your top AI matches. Onboarding itself is
unchanged — it still lands on `/dashboard`.

- `/onboarding` is shared by both flows: if the signed-in user already has a
  profile, the form loads pre-filled and submits via `PUT /api/profile`
  ("Update"); otherwise it's empty and submits via `POST /api/profile`
  ("Complete profile").
- `/onboarding` and `/dashboard` are client-guarded: they check for a token on
  mount and redirect to `/login` if it's missing or rejected by `GET /api/auth/me`.
- Registration does **not** log the user in automatically (it matches the
  API contract, which only issues a token from `/login`) — it redirects to
  `/login` with a success banner.

From `/dashboard`, quick actions lead into match discovery:

```
/discover → like a profile → /likes (Incoming tab, on the other person's side)
        → accept → Match created → /matches
```

`/discover`, `/likes`, and `/matches` are guarded the same way as
`/onboarding` and `/dashboard` — same `useRequireAuth` hook, untouched.

From `/matches`, "Start Conversation" leads into chat:

```
/matches → Start Conversation (POST /api/conversations/start/:matchId)
        → /messages/[conversationId] → join_conversation (socket room)
        → send_message / message_received (live) → /messages (conversation list)
```

A Conversation can only be created between two matched users — the same
`matchId` always resolves to the same Conversation (idempotent
find-or-create), so re-opening a chat from either side never creates a
duplicate. `/messages` and `/messages/[conversationId]` are guarded the same
way as the other app routes; the Socket.IO connection itself is scoped to
that route subtree via `src/app/messages/layout.tsx`, so it opens on entering
`/messages` and closes on leaving it.

## API reference

Base URL: `http://localhost:5000/api`

| Method | Route | Auth | Body | Notes |
|---|---|---|---|---|
| `GET` | `/health` | — | — | Liveness check |
| `POST` | `/auth/register` | — | `fullName, email, password` | `email` must be unique |
| `POST` | `/auth/login` | — | `email, password` | Returns `{ user, token }` |
| `GET` | `/auth/me` | Bearer | — | Returns the signed-in user |
| `POST` | `/profile` | Bearer | `age, gender, city, bio?, interests?, relationshipGoal, profileImage?` | 409 if a profile already exists |
| `PUT` | `/profile` | Bearer | any subset of the above | 422 if the body is empty; omitted fields are left untouched |
| `GET` | `/profile/me` | Bearer | — | 404 if no profile yet |
| `GET` | `/discover` | Bearer | query: `page?, limit?, city?, relationshipGoal?` | Excludes yourself, matched users, and anyone you've already liked. Phase 5 adds `aiReady` and a per-user `ai: { score, tier, reasons } \| null` (additive; `users` + `pagination` are unchanged) |
| `POST` | `/likes/send/:userId` | Bearer | — | 400 liking yourself, 409 duplicate like or already matched |
| `GET` | `/likes/incoming` | Bearer | — | Pending likes sent to you |
| `GET` | `/likes/outgoing` | Bearer | — | Everyone you've liked, with status |
| `POST` | `/likes/accept/:likeId` | Bearer | — | 403 if it's not your like to accept; creates a Match and returns it, populated |
| `POST` | `/likes/reject/:likeId` | Bearer | — | 403 if it's not yours; 409 if it's already a match |
| `GET` | `/matches` | Bearer | — | Each entry includes `compatibilityScore` and `sharedInterests` |
| `POST` | `/conversations/start/:matchId` | Bearer | — | Idempotent find-or-create; 403 if `matchId` doesn't belong to you |
| `GET` | `/conversations` | Bearer | — | List of conversations with the other participant's public profile, `lastMessage`, `lastMessageAt`, and `unreadCount` |
| `GET` | `/conversations/:id/messages` | Bearer | query: `page?, limit?` | Latest page first internally, returned in chronological order; 403 if you're not a participant |
| `POST` | `/messages/send` | Bearer | `conversationId, content, type?` | REST fallback alongside the `send_message` socket event; both paths emit the same socket events |
| `POST` | `/messages/read/:messageId` | Bearer | — | 403 if you're not the receiver; no-ops if already read |
| `GET` | `/ai/status` | Bearer | — | One round trip for the dashboard: interview status/progress, whether a basic profile exists, and a personality summary once analysed |
| `GET` | `/ai/interview` | Bearer | — | The interview transcript + progress (`not_started` when there isn't one) |
| `POST` | `/ai/interview/start` | Bearer | — | Idempotent. 409 `PROFILE_REQUIRED` without a basic profile |
| `POST` | `/ai/interview/answer` | Bearer | `content` (≤ 1000 chars) | Returns the next question. 422 for empty / oversized / non-linguistic input and for prompt-injection attempts; 409 for a double-submit. The 25th answer auto-completes and returns the AI profile |
| `POST` | `/ai/interview/complete` | Bearer | — | Finish early (needs ≥ 15 answers, else 409). Idempotent |
| `POST` | `/ai/interview/restart` | Bearer | — | Discards the interview; your existing AI profile keeps working until a new analysis replaces it |
| `GET` | `/ai/profile/me` | Bearer | — | Your full AI profile (personality report). 404 until the interview is done. **Only ever returned to its owner** |
| `GET` | `/ai/recommendations` | Bearer | query: `limit?` (1–30, default 10) | Un-liked, un-matched people ranked by AI compatibility |
| `GET` | `/ai/compatibility/:userId` | Bearer | — | Score, six-dimension breakdown, reasons and explanation. `available: false` (with `viewer_not_ready` / `other_not_ready`) when either side hasn't done the interview |

Protected routes expect `Authorization: Bearer <token>`. AI routes are rate
limited per user (300 requests / 15 min overall; 60 / 15 min on the routes that
can trigger a model call) and answer `429` in the standard envelope.

### Socket.IO events

Connects to the API origin (not `/api`) with JWT auth:
`io(SOCKET_URL, { auth: { token } })`. A connection is rejected at the
handshake if the token is missing or invalid.

| Direction | Event | Payload | Notes |
|---|---|---|---|
| → server | `join_conversation` | `{ conversationId }` | Joins the room; 403-equivalent `error` event if you're not a participant. Also syncs back the other participant's *current* online/offline status, since `user_online`/`user_offline` below are transition-only events |
| → server | `leave_conversation` | `{ conversationId }` | Leaves the room |
| → server | `send_message` | `{ conversationId, content }`, ack callback | Ack is `{ success, message }` or `{ success: false, error }` — the UI awaits this rather than trusting a fire-and-forget emit |
| → server | `typing_start` / `typing_stop` | `{ conversationId }` | Debounced client-side (2s of inactivity auto-fires `typing_stop`) |
| ← server | `message_received` | `{ message }` | To the receiver's personal room |
| ← server | `message_sent` | `{ message }` | To the sender's *other* connected sockets/devices, so a message sent from one tab appears in another |
| ← server | `user_typing` / `user_stopped_typing` | `{ conversationId, userId }` | Broadcast to the conversation room, excluding the sender |
| ← server | `message_read` | `{ messageId, conversationId, readAt }` | Lets the sender's UI flip a single-check to a double-check |
| ← server | `user_online` / `user_offline` | `{ userId }` | Sent only to that user's active conversation partners (looked up via their Conversations), not broadcast globally |
| ← server | `error` | `{ message }` | Emitted instead of throwing, for any handler failure (bad conversationId, not a participant, etc.) |

### Response shape

```jsonc
// success
{ "success": true, "message": "...", "data": { /* ... */ } }

// error
{ "success": false, "message": "...", "error": /* validation details, or omitted */ }
```

Validation failures return `422` with `error` as an array of
`{ path, message }`. Duplicate email on register returns `409`. Invalid or
missing tokens return `401`.

## AI interview, personality report & AI matching (Phase 5)

Instead of matching on a form, users chat with an AI interviewer. From 15–25
answers it builds an **AIProfile** (personality type, Big-Five trait scores,
communication style, values, lifestyle, emotional traits, relationship goals,
strengths, summary, confidence). That profile drives a six-dimension
compatibility score, stored match explanations, and the ranked
recommendations.

### AI providers

`backend/src/ai/providers/` defines one interface — `AIProvider.complete()` —
with three implementations built on the **official SDKs** (`@anthropic-ai/sdk`,
`openai`, `@google/genai`), each imported lazily so only the configured one
loads. Adding a provider is one new file plus one `case` in the factory.

**Groq → Gemini failover.** When `GROQ_API_KEY` is set, every AI request goes through
`services/aiClient.ts` (`generateAIResponse`): Groq first, Gemini if Groq fails for any
reason, and the built-in engine if both do. `AI_PROVIDER` is then only consulted for
`local`. The provider that actually answered is stored with the result and counted in
`/api/metrics` (`ai_requests_total`). Email has the same shape in `services/emailClient.ts`
(`sendEmail`): Brevo → Resend → SendGrid.

| `AI_PROVIDER` (no Groq key) | Behaviour |
|---|---|
| `auto` (default) | First provider with a key, in the order Claude → OpenAI → Gemini; none → built-in engine |
| `claude` / `openai` / `gemini` | Force one (its key becomes required at startup) |
| `local` | Never call an external AI |

Claude calls use `effort` rather than sampling parameters (current models
reject `temperature`), and — unless `ANTHROPIC_REFUSAL_FALLBACK=false` — opt
into the server-side refusal fallback so a safety-declined request is re-run on
Anthropic's recommended fallback model instead of failing.

**The built-in engine is a first-class path, not a stub.** Every AI task has a
deterministic implementation — a hand-written question bank (32 questions, four
per topic), a keyword-lexicon analyzer, and template explanations — and
`tryComplete()` is the single place the "provider or built-in" decision is made.
A missing key, a timeout, an HTTP error, a refusal, malformed JSON, or an
out-of-vocabulary answer all fall back to it, so the interview never dies on a
vendor outage. Reports say which engine produced them, and the built-in engine's
confidence is capped at 70 (an LLM's at 95): keyword matching can see words, not
meaning.

### Interview flow

- 8 topics (personality, hobbies, values, lifestyle, communication, career,
  family, relationship expectations) cycle in order, so 15 questions touch every
  topic. The opener is always the hand-written "tell me about yourself"; later
  questions are written by the provider (reacting to the last answer) or drawn
  from the bank. A generated question is only used if it is a well-formed,
  non-repeated question — otherwise the bank supplies one.
- 15 answers unlock the report; the interview can continue to 25, where it
  completes automatically. State lives server-side, so it survives reloads and
  can be resumed on another device.
- Answers are recorded with an atomic compare-and-set on `awaitingAnswer`, so a
  double-click or a second tab gets a clean `409` instead of two answers to one
  question; a session whose next question was never written (server restart
  mid-request) heals itself on the next read.
- The "streaming" text in the UI is a client-side progressive reveal of the
  finished question (the request returns whole), paced like token streaming and
  disabled for `prefers-reduced-motion`; screen readers get the complete text at
  once.

### Analysis & the controlled vocabulary

Everything except `interests` is constrained to fixed vocabularies
(`ai/taxonomy.ts`: 7 communication styles, 18 values, 15 lifestyle traits, 12
emotional traits, 7 goal tags). That is what makes two people's profiles
comparable at all — free-text traits ("loves growth" / "self-improvement")
would almost never overlap — and it doubles as response sanitization: a model
cannot put arbitrary text into fields other users' matches are computed from.
The personality *type* is not free text either: it's the nearest of eight
archetypes to the person's Big-Five scores, so it is consistent across providers.

### Compatibility engine

`ai/compatibility.ts`, deterministic and model-free, so a whole Discover page is
scored instantly:

| Dimension | Weight | How it's scored |
|---|---|---|
| Values | 25 | Cosine similarity of value tags |
| Interests | 20 | Cosine similarity of interests (profile + AI, aliases folded: "Travelling" = "travel") |
| Communication | 15 | Style-pairing matrix (same style best; complementary pairs above clashing ones) |
| Lifestyle | 15 | Cosine similarity, minus a penalty for opposed pairs (early riser / night owl, homebody / social, spontaneous / organized) |
| Relationship goals | 15 | Half exact-tag overlap, half same-intent-group overlap (marriage ≈ long-term commitment) |
| Personality | 10 | Trait-by-trait similarity (extraversion tolerates a gap; agreeableness and stability also reward being high) blended with emotional-trait overlap |

A dimension either person has no data for is dropped and the remaining weights
renormalized — missing data never reads as incompatibility. The existing
Phase 3 score on `Match.compatibilityScore` (`utils/compatibility.ts`) is
untouched; the AI score is additive.

### Match explanations

The score and the reasons are decided by the engine; the AI's only job is to
*phrase* them. For **matched** pairs the explanation is written once (by the
provider when configured, else from a template), stored in `MatchInsight`
(one document per canonically-ordered pair), and regenerated only when either
person's AI profile changes — or retried after 10 minutes if it was a template
because no provider answered. Non-matched pairs (Discover, recommendations) get
the free template, so model spend is limited to people who actually matched.

### Security & privacy

- **Rate limiting** — per user id (not IP), stricter on model-triggering routes.
- **Prompt validation** — answers are stripped of control / zero-width /
  bidi-override characters, length-bounded, required to contain letters or
  digits, and checked against a narrow set of flagrant injection patterns
  (deliberately narrow: "I ignore drama" and "I have a system for planning"
  pass). What reaches a prompt is wrapped in `<transcript>` tags with angle
  brackets neutralized, and every system prompt tells the model the contents are
  untrusted data.
- **Response sanitization** — model output is JSON-parsed, schema-validated,
  forced into the vocabularies, clamped, and stripped of markup / links /
  markdown before it is stored. Interests containing code-like characters are
  dropped, not "cleaned". The frontend also renders everything as plain text.
- **Privacy** — the full AI profile is returned only to its owner. Other users
  see a score and the *intersection* of what you share ("you both value
  honesty"), never your traits. When a provider is configured, interview text
  and structured facts are sent to that vendor — worth a line in a real privacy
  policy.

## Production platform (Phase 6)

Phase 6 turns the MVP into something you can put in front of the public:
notifications, email, premium plans and payments, an admin dashboard,
analytics, safety tooling, referrals and a waitlist — plus the hardening,
tests and deployment files to launch it. **Nothing from Phases 1–5 was
removed or changed in behaviour**; everything new is additive, and everything
that costs money or changes how the app behaves ships **switched off**.

> **Deploying?** Start with [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), then
> work through [`docs/LAUNCH_CHECKLIST.md`](docs/LAUNCH_CHECKLIST.md). Every key and
> secret you need, and where it goes, is in [`docs/API_KEYS.md`](docs/API_KEYS.md).

### Feature flags — paid features are off until you turn them on

Every paid or behaviour-changing feature sits behind a flag that an admin flips
from **`/admin/flags`** — no code change, no deploy, effective within seconds.
A flag resolves as **admin dashboard → `FEATURE_FLAGS` env var → built-in default**.
Perks are gated *twice*: the flag must be on **and** the member's plan must include it.

| Flag | Default | What it controls |
|---|---|---|
| `billing` | off | Members can start / upgrade a paid plan (cancelling always works) |
| `like_limits` | off | Free members capped at 20 likes/day |
| `unlimited_likes` | off | Paid plans are exempt from that cap |
| `advanced_filters` | off | Age / gender / interest filters in Discover |
| `priority_recommendations` | off | Free: 5 AI recommendations · Premium: 15 · Plus: 30 |
| `profile_boost` | off | Boosted profiles rank first in others' recommendations (1 hour) |
| `ai_deep_analysis` | off | In-depth AI report — **uses your AI provider (paid API usage)** |
| `read_receipts_insights` | off | Read-time analytics on messages you sent |
| `referral_rewards` | off | Pay out Premium time for referral milestones (tracking always runs) |
| `waitlist_mode` | off | Registration requires an invite or referral code |
| `referrals`, `profile_views`, `notifications`, `email_notifications`, `reports`, `blocking` | **on** | Low-risk / safety features |

API behaviour: a switched-off feature answers `403 { code: "FEATURE_DISABLED" }`;
a feature the member's plan lacks answers `402 { code: "UPGRADE_REQUIRED",
requiredPlan }`; hitting the free like cap answers `402 { code: "LIKE_LIMIT_REACHED" }`.
The frontend turns each of these into a calm upgrade prompt.

### Plans

| | Free | Premium | Premium Plus |
|---|---|---|---|
| Likes per day | 20 | Unlimited | Unlimited |
| AI recommendations | 5 | 15 | 30 |
| Advanced filters | — | ✓ | ✓ |
| Read receipts insights | — | ✓ | ✓ |
| AI deep analysis | — | — | ✓ |
| Profile boost | — | — | 4 / month |
| Price (USD / INR) | 0 | $9.99 · ₹799 /mo | $19.99 · ₹1,599 /mo |

Plans live in one file — [`backend/src/features/plans.ts`](backend/src/features/plans.ts) —
which the API, pricing page and tests all read. A member's effective plan is the
best of their live paid subscription and any complimentary grant (admin comps,
referral rewards); a cancelled subscription keeps working until the period they
paid for ends.

### What's in the box

- **Notifications** — in-app + real-time (Socket.IO) + a Notification Center at `/notifications`
  and a bell in the navbar. Events: new like, match, new message, profile view, AI recommendation
  (plus subscription, referral and safety updates). Bursts are merged ("×3 messages"), messages
  aren't announced while you're reading that chat, and members can mute each type.
- **Email** — welcome, verification, match, new-message, weekly compatibility report and more, with
  plain-text alternatives, HTML-escaped user data, one-click unsubscribe, and per-category
  preferences. Provider is pluggable: **Resend, SendGrid, SMTP** (or `log` in development). Email
  never blocks or fails the action that triggered it; every attempt is recorded for admins.
- **Payments** — provider abstraction over **Stripe** (USD) and **Razorpay** (INR): checkout,
  upgrade, cancel, payment history. Webhooks are signature-verified, idempotent, and retry-safe
  (out-of-order events answer `503` so the provider retries). A **sandbox provider** (`mock`)
  exercises the whole flow with no real payment and is refused in production.
- **Admin dashboard (`/admin`)** — KPIs (total / active users, registrations, matches, messages,
  premium subscribers + MRR), analytics with charts, user management (search, suspend, delete,
  grant plans), the moderation queue, feature flags, waitlist, system health, email + audit logs.
  Every admin action is written to an audit log.
- **Analytics** — registrations, interview completion rate, match rate, message rate, premium
  conversion, a member-journey funnel, and daily time series for six metrics.
- **Safety** — report a member (with chat context) and block them (symmetric: neither sees the
  other in Discover, recommendations, likes or chat). Moderators resolve reports with dismiss /
  warn / hide message / suspend / delete. Suspended members are signed out and refused everywhere,
  including live sockets. Admins can't be moderated.
- **Growth** — referral codes and invite-by-email, successful-referral tracking (a friend counts
  once they finish the AI interview), a reward ladder (1 → 7 days Premium, 3 → 30 days,
  5 → 30 days Plus, 10 → 90 days Plus, paid retroactively when `referral_rewards` is enabled), and
  an invite-only waitlist mode.
- **Production hardening** — structured JSON logs with request ids, Prometheus metrics, liveness +
  readiness probes, optional Sentry, layered rate limits, strict API security headers (and a CSP
  on the frontend), environment validation with production-only guards, graceful shutdown.

### New frontend routes

`/notifications` · `/pricing` · `/billing` · `/billing/mock-checkout` (sandbox only) · `/premium`
(your perks) · `/settings` · `/referrals` · `/waitlist` · `/verify-email` · `/unsubscribe` ·
`/admin` · `/admin/analytics` · `/admin/users` · `/admin/moderation` · `/admin/flags` ·
`/admin/waitlist` · `/admin/system`

Small additive touches to existing screens: the navbar shows the bell and an account menu when
signed in (logged-out visitors see exactly what they did before); the dashboard gains a
verify-email banner, a plan card and working "Account settings" / "Invite friends" shortcuts;
profile cards, match cards and the chat header gain a report/block menu; Discover gains the
premium filters; the personality report gains the deep-analysis section.

### New API endpoints (all under `/api`)

| Area | Endpoints |
|---|---|
| Features | `GET /features/public` · `GET /features` |
| Notifications | `GET /notifications` · `GET /notifications/unread-count` · `POST /notifications/:id/read` · `POST /notifications/read-all` · `DELETE /notifications/:id` |
| Account | `POST /account/verify-email` · `POST /account/resend-verification` · `GET`/`PUT /account/settings` · `POST /account/unsubscribe` |
| Billing | `GET /billing/plans` · `GET /billing/overview` · `POST /billing/checkout` · `POST /billing/upgrade` · `POST /billing/cancel` · `GET /billing/payments` · `POST /billing/webhook/:provider` (raw body, signature-verified) |
| Premium perks | `GET /premium/likes/allowance` · `GET`/`POST /premium/boost` · `GET`/`POST /premium/deep-analysis` · `GET /premium/read-receipts` |
| Safety | `POST /safety/reports` · `GET`/`POST /safety/blocks` · `DELETE /safety/blocks/:userId` |
| Growth | `GET /growth/referrals` · `POST /growth/referrals/invite` · `POST /growth/waitlist` · `POST /growth/profile-views/:userId` |
| Admin (admin role) | `/admin/overview`, `/admin/analytics/{timeseries,funnel,rates,revenue}`, `/admin/users…`, `/admin/reports…`, `/admin/feature-flags…`, `/admin/audit-log`, `/admin/email-log`, `/admin/jobs…`, `/admin/waitlist…`, `/admin/system` |
| Operations | `GET /health` · `GET /health/ready` · `GET /metrics` (token) · `POST /internal/jobs/:name` (cron secret) · `POST /uploads/sign` · `POST /client-errors` |

### Becoming an admin

Set `ADMIN_EMAILS=you@example.com` (comma-separated) in the backend environment. That address
becomes an admin **once its email is verified** — registering an address alone grants nothing, so
nobody can claim yours by signing up first. Or promote directly on the server:
`npm run make-admin -- you@example.com`. Roles are read from the database on every request, so
demoting an admin takes effect immediately.

### Testing

The backend has **470 automated tests** (unit + integration) that boot the real Express app,
Socket.IO server and event listeners against a throwaway in-memory MongoDB. Test runs are hermetic:
they pin the environment so they can never touch your real database, an AI provider, email, or a
payment provider (Stripe/Razorpay/Resend/SendGrid are exercised against local HTTP doubles with real
signatures).

```bash
cd backend
npm test                 # everything (unit + integration)
npm run test:unit        # fast, no database
npm run test:integration
```

`mongodb-memory-server` downloads a MongoDB binary on first use. If that's blocked (or you'd rather
use one you have installed), point it at a local `mongod`:

```powershell
$env:MONGOMS_SYSTEM_BINARY = "C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe"
$env:MONGOMS_SYSTEM_BINARY_VERSION_CHECK = "false"
```

**End-to-end** tests drive the real web app in a browser — see [`e2e/README.md`](e2e/README.md).

## Design notes

A few deliberate choices worth knowing about:

- **`bcryptjs` instead of `bcrypt`** — same hashing algorithm and API, but a
  pure-JS implementation with no native build step, which avoids
  node-gyp/native-module friction across dev machines and deploy targets.
- **JWT in `localStorage`, sent as `Authorization: Bearer`** — simpler than
  cookie-based auth for a decoupled frontend/backend running on different
  origins in dev, at the cost of some XSS exposure that cookie+`httpOnly`
  storage would avoid. If this goes further toward production, moving to an
  `httpOnly`, `SameSite` cookie (with CSRF protection) is the natural
  hardening step — the API client already isolates all token handling in
  `src/lib/auth-storage.ts` and `src/lib/api-client.ts`, so that change stays
  contained to those two files.
- **`helmet`** was added to the backend beyond the explicit spec — standard,
  low-risk security headers, not a structural change.
- Every request-validating Zod schema is duplicated (not shared) between
  `backend/src/validators` and `src/lib/validators` — the two are separate
  npm packages with separate dependency trees, so this is intentional, not
  drift waiting to happen.
- **Compatibility scoring** (`backend/src/utils/compatibility.ts`): same
  relationship goal and same city are binary — full weight (30, 20) or
  nothing. Shared interests aren't binary, so that weight (50) scales by
  Jaccard similarity (shared ÷ union) rather than being all-or-nothing for a
  single matching interest. The score is computed once, at accept time, and
  stored on the Match; `sharedInterests` shown on `/matches` is recomputed
  live against the viewer's *current* interests rather than stored, so it
  stays accurate if either profile changes after the match.
- **Match pairs are canonically ordered** (`userOne`/`userTwo` sorted by id
  string, see `orderUserIds`) so the same two people can never end up with
  two Match documents regardless of who liked whom first — enforced by a
  unique compound index, not just application logic.
- Likes are a request/accept/reject flow, not swipe-style mutual matching: a
  Match is only ever created by an explicit `accept`, even if both people
  happen to like each other independently before either accepts.
- **Conversation pairs are canonically ordered** the same way Match pairs
  are, with a unique compound index on `participants` — the same two matched
  users can never end up with two Conversation documents.
- **Presence is scoped, not global**: `user_online`/`user_offline` are only
  sent to a user's actual conversation partners (found by querying their
  Conversations on connect/disconnect), not broadcast to every connected
  socket. This keeps the event volume proportional to someone's actual chat
  activity and doesn't leak online/offline status to strangers.
- **The `join_conversation` handler proactively syncs current presence.**
  `user_online`/`user_offline` are pure transition events — if the other
  participant was already online *before* your socket connected, you'd never
  otherwise learn their status. On `join_conversation`, the server looks up
  the other participant's current presence and emits it directly to the
  joining socket, closing that gap.
- **`send_message` is ack-based, not fire-and-forget** — the client passes a
  callback and waits for `{ success, message }` (or `{ success: false, error
  }`) before rendering the message as sent, so a failed send surfaces as an
  error rather than a silently-missing message.
- **REST send and socket send converge on the same code path**: `POST
  /messages/send` (used as a fallback, and by anything that isn't a live
  socket connection) emits the exact same `message_received` /
  `message_sent` socket events the live path does, via the shared
  `message.service.ts`. There's exactly one way a message gets created, no
  matter which transport triggered it.
- **`image` is a reserved `Message.type`** — the schema and UI both branch on
  it, but no upload pipeline exists yet; only `text` is currently producible.
  This is a deliberate placeholder for a later phase, not an oversight.
- **Chat scroll behavior** (`src/components/chat/chat-view.tsx`): the message
  list auto-scrolls to bottom only when a message is *appended* (new message,
  either end), never when older history is *prepended* (via "load earlier
  messages") — prepending instead preserves the reader's scroll position by
  measuring `scrollHeight` before the fetch and correcting `scrollTop` by the
  delta after. The chat's own scroll container uses `data-lenis-prevent` so
  the site-wide Lenis smooth-scroll doesn't hijack it.
- **Phase 5 touches earlier phases only where the spec asked, and additively**:
  the Discover *controller* gains `aiReady` + a per-user `ai` field (the
  discover service and its exclusion/pagination logic are untouched), the Matches
  card gains an AI-insights panel (its ring shows the AI score, relabelled
  "AI Match", once loaded), the Dashboard gains an AI section, and Discover gains
  an "AI Recommended" tab beside the unchanged "Everyone" view. Onboarding,
  auth, likes and chat are not modified.
- **Per-match AI insights load lazily** — each card fetches its own insight only
  once it scrolls into view, with a 60-second in-memory cache — so a long matches
  list doesn't fire a request per card, or replay the "analysing" state on
  revisit.
- **Dashboard and Matches integration are additive only**: the Phase 4 spec
  explicitly called for a "Start Conversation" button on `/matches` and a
  Messages stat card on `/dashboard`, both wired to the same
  `GET /api/conversations` data — no other existing page, route, or auth flow
  was touched.

## Scripts

**Frontend** (from project root): `npm run dev`, `npm run build`, `npm run lint`, `npm run test:e2e` (browser tests — see `e2e/README.md`)

**Backend** (from `backend/`): `npm run dev`, `npm run build`, `npm run start` (runs the build output), `npm run typecheck`, `npm test` / `test:unit` / `test:integration`, `npm run check:env` (validate your environment as the server would at boot), `npm run check:ai` / `npm run check:email` (live-verify your AI and email providers), `npm run make-admin -- you@example.com`
