/**
 * Phase 6 end-to-end suite: drives the real web app in a real browser against a
 * running backend + frontend + database. See e2e/README.md for how to start the stack.
 *
 *   node e2e/phase6.e2e.mjs
 *
 * Configuration (environment variables):
 *   E2E_WEB_URL         frontend origin              (default http://localhost:3100)
 *   E2E_API_URL         API base incl. /api          (default http://localhost:5100/api)
 *   E2E_MONGODB_URI     database the backend uses — only to promote the admin (required)
 *   E2E_BACKEND_LOG     backend log file, to read the emailed verification link (optional)
 *   E2E_OUT_DIR         where screenshots go         (default ./e2e/screenshots)
 *   PLAYWRIGHT_CORE_PATH / CHROMIUM_PATH   override how playwright-core / the browser are found
 *
 * The backend must run with PAYMENT_PROVIDER=mock and EMAIL_PROVIDER=log. It works against the
 * default rate limits, but a run makes ~20 login/register calls (the auth limit is 30 per 15 minutes
 * per IP), so leave ~15 minutes between back-to-back runs or raise RATE_LIMIT_AUTH_MAX for the test backend.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH ?? "playwright-core");
const here = dirname(fileURLToPath(import.meta.url));

const WEB = (process.env.E2E_WEB_URL ?? "http://localhost:3100").replace(/\/$/, "");
const API = (process.env.E2E_API_URL ?? "http://localhost:5100/api").replace(/\/$/, "");
const OUT = resolve(process.env.E2E_OUT_DIR ?? resolve(here, "screenshots"));
const BACKEND_DIR = resolve(here, "../backend");
const PASSWORD = "Passw0rd!23";
const stamp = Date.now().toString(36);
// Test people get run-unique first names, so a database that already holds people from earlier runs can't confuse locators.
const sfx = stamp.slice(-4);
mkdirSync(OUT, { recursive: true });

if (!process.env.E2E_MONGODB_URI) {
  console.error("E2E_MONGODB_URI is required (the database the backend is using) so the admin account can be promoted.");
  process.exit(2);
}

// ---------------------------------------------------------------------------
// tiny harness
// ---------------------------------------------------------------------------

const results = [];
let currentPage = null;

async function step(name, fn) {
  const started = Date.now();
  try {
    const outcome = await fn();
    if (outcome === "skip") {
      results.push({ name, status: "skip" });
      console.log(`  - SKIP  ${name}`);
      return;
    }
    results.push({ name, status: "pass" });
    console.log(`  ✔ PASS  ${name} (${Date.now() - started}ms)`);
  } catch (err) {
    results.push({ name, status: "fail", error: err });
    console.log(`  ✖ FAIL  ${name}\n          ${String(err?.message ?? err).split("\n").slice(0, 4).join("\n          ")}`);
    if (currentPage) await currentPage.screenshot({ path: `${OUT}/FAIL-${name.replace(/\W+/g, "-").slice(0, 60)}.png`, fullPage: true }).catch(() => {});
  }
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json, data: json?.data };
}

async function apiUser(name, { profile = true } = {}) {
  const email = `${name.split(" ")[0].toLowerCase()}.${stamp}@e2e.test`;
  const registered = await api("POST", "/auth/register", { body: { fullName: name, email, password: PASSWORD } });
  check(registered.status === 201, `register ${name}: ${JSON.stringify(registered.body)}`);
  const login = await api("POST", "/auth/login", { body: { email, password: PASSWORD } });
  const user = { name, email, id: login.data.user.id, token: login.data.token };
  if (profile) {
    const created = await api("POST", "/profile", {
      token: user.token,
      body: { age: 29, gender: "other", city: "Testville", bio: `Hello, I'm ${name}`, interests: ["Travel", "Hiking"], relationshipGoal: "serious" },
    });
    check(created.status === 201, `profile ${name}: ${JSON.stringify(created.body)}`);
  }
  return user;
}

const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });
const bell = (page) => page.getByRole("button", { name: /^Notifications/ });

async function uiLogin(page, email) {
  await page.goto(`${WEB}/login`);
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/(dashboard|onboarding)/);
}

async function setFlag(adminToken, key, enabled) {
  const res = await api("PUT", `/admin/feature-flags/${key}`, { token: adminToken, body: { enabled } });
  check(res.status === 200, `set flag ${key}: ${JSON.stringify(res.body)}`);
}

function emailedLink(email, path) {
  if (!process.env.E2E_BACKEND_LOG) return null;
  const log = readFileSync(process.env.E2E_BACKEND_LOG, "utf8");
  const pattern = new RegExp(`${path}\\?token=([0-9a-f]{24}\\.[0-9a-f]{64})`, "g");
  for (const line of log.split("\n").reverse()) {
    if (!line.includes(email)) continue;
    const match = [...line.matchAll(pattern)].at(-1);
    if (match) return match[1];
  }
  return null;
}

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const consoleProblems = [];
const watch = (page, label) => {
  page.on("pageerror", (err) => consoleProblems.push(`[${label}] pageerror: ${err.message}`));
  page.on("console", (msg) => {
    // Expected 4xx responses (e.g. probing a gated feature) surface as "Failed to load resource" — not app bugs.
    if (msg.type() === "error" && !/Failed to load resource|WebSocket connection|net::ERR/.test(msg.text())) consoleProblems.push(`[${label}] ${msg.text()}`);
  });
};
const newContext = async (viewport = { width: 1280, height: 900 }) => {
  const context = await browser.newContext({ viewport });
  context.setDefaultTimeout(60_000);
  return context;
};

console.log(`\nSoulSync AI — Phase 6 end-to-end\n  web ${WEB}\n  api ${API}\n`);

// ---- warm up: a dev server compiles each route on first request, which would otherwise eat step time
{
  const routes = ["/", "/login", "/register", "/dashboard", "/discover", "/likes", "/matches", "/messages", "/notifications", "/settings", "/referrals", "/pricing", "/billing", "/premium", "/waitlist", "/verify-email", "/unsubscribe", "/personality-report", "/admin", "/admin/analytics", "/admin/users", "/admin/moderation", "/admin/flags", "/admin/waitlist", "/admin/system"];
  for (const route of routes) await fetch(`${WEB}${route}`).catch(() => {});
  console.log(`  warmed ${routes.length} routes\n`);
}

// ---- people --------------------------------------------------------------------
const bob = await apiUser(`Bob${sfx} E2E`);
await apiUser(`Carol${sfx} E2E`);
const adminUser = await apiUser("Root E2E");
{
  const promote = spawnSync(process.execPath, [resolve(BACKEND_DIR, "node_modules/tsx/dist/cli.mjs"), "scripts/make-admin.ts", adminUser.email], {
    cwd: BACKEND_DIR,
    env: { ...process.env, MONGODB_URI: process.env.E2E_MONGODB_URI, LOG_LEVEL: "silent" },
    encoding: "utf8",
  });
  check(promote.status === 0, `make-admin failed: ${promote.stdout}${promote.stderr}`);
}
// Start from the shipped defaults, so the suite is repeatable against the same database.
for (const key of ["billing", "advanced_filters", "waitlist_mode"]) {
  await api("DELETE", `/admin/feature-flags/${key}`, { token: adminUser.token });
}
const alice = { name: `Alice${sfx} E2E`, email: `alice.${stamp}@e2e.test`, token: "", id: "" };

// ---------------------------------------------------------------------------
console.log("Logged-out visitor");
{
  const context = await newContext();
  const page = await context.newPage();
  currentPage = page;
  watch(page, "visitor");

  await step("landing page keeps Sign in / Get Started and shows no bell", async () => {
    await page.goto(WEB);
    await page.getByRole("link", { name: "Sign in" }).first().waitFor();
    check(await page.getByRole("link", { name: "Get Started" }).first().isVisible(), "Get Started missing");
    check((await bell(page).count()) === 0, "a bell is shown to a logged-out visitor");
  });

  await step("pricing is public: three plans, paid checkout closed while billing is off", async () => {
    await page.goto(`${WEB}/pricing`);
    for (const name of ["Free", "Premium", "Premium Plus"]) await page.getByRole("heading", { name, exact: true }).waitFor();
    await page.getByText("Paid plans open very soon").waitFor();
    await page.getByRole("link", { name: "Sign up to choose Premium", exact: true }).waitFor();
    await shot(page, "01-pricing-logged-out");
  });

  await step("waitlist: join and get a position", async () => {
    await page.goto(`${WEB}/waitlist`);
    await page.fill("#waitlist-email", `wait.${stamp}@e2e.test`);
    await page.getByRole("button", { name: "Save my spot" }).click();
    await page.getByRole("heading", { name: "You're on the list" }).waitFor();
    await page.getByText(/^#\d+$/).waitFor();
  });

  await step("admin area refuses anonymous visitors", async () => {
    await page.goto(`${WEB}/admin`);
    await page.waitForURL(/\/login/);
  });
  await context.close();
}

// ---------------------------------------------------------------------------
console.log("\nNew member: register (with a friend's referral link), verify, live notifications");
const aliceContext = await newContext();
const alicePage = await aliceContext.newPage();
currentPage = alicePage;
watch(alicePage, "alice");

await step("register through the UI with a referral link", async () => {
  const { data: referral } = await api("GET", "/growth/referrals", { token: bob.token });
  await alicePage.goto(`${WEB}/register?ref=${referral.code}`);
  await alicePage.getByText("A friend invited you").waitFor();
  await alicePage.fill("#fullName", alice.name);
  await alicePage.fill("#email", alice.email);
  await alicePage.fill("#password", PASSWORD);
  await alicePage.fill("#confirmPassword", PASSWORD);
  await alicePage.getByRole("button", { name: "Create account" }).click();
  await alicePage.waitForURL(/\/login\?registered=1/);
  const summary = await api("GET", "/growth/referrals", { token: bob.token });
  check(summary.data.counts.invited === 1, `Bob's referral should show 1 invited, got ${JSON.stringify(summary.data.counts)}`);
});

await step("log in: dashboard shows the verify-email banner, the bell and the account menu", async () => {
  await uiLogin(alicePage, alice.email);
  await alicePage.goto(`${WEB}/dashboard`);
  await alicePage.getByText("Verify your email").waitFor();
  await bell(alicePage).waitFor();
  await alicePage.getByRole("button", { name: "Account menu" }).waitFor();
  alice.token = await alicePage.evaluate(() => localStorage.getItem("soulsync_token"));
  check(alice.token, "no session token stored");
  const me = await api("GET", "/auth/me", { token: alice.token });
  alice.id = me.data.user.id;
  await shot(alicePage, "02-dashboard-new-member");
});

await step("verify the email through the emailed link", async () => {
  const token = emailedLink(alice.email, "verify-email");
  if (!token) return "skip";
  await alicePage.goto(`${WEB}/verify-email?token=${token}`);
  await alicePage.getByRole("heading", { name: "Email verified" }).waitFor();
  await alicePage.goto(`${WEB}/dashboard`);
  await alicePage.getByText("Verify your email").waitFor({ state: "detached" });
});

await step("a bad verification link explains itself", async () => {
  const page = await aliceContext.newPage();
  await page.goto(`${WEB}/verify-email?token=${"0".repeat(24)}.${"0".repeat(64)}`);
  await page.getByRole("heading", { name: "Verification problem" }).waitFor();
  await page.close();
});

await step("finish Alice's profile (API) so she can take part", async () => {
  const created = await api("POST", "/profile", {
    token: alice.token,
    body: { age: 27, gender: "female", city: "Testville", bio: "Hi, I'm Alice", interests: ["Travel", "Cooking"], relationshipGoal: "serious" },
  });
  check(created.status === 201, JSON.stringify(created.body));
});

await step("a like arrives live: toast + bell badge, no reload", async () => {
  await alicePage.goto(`${WEB}/dashboard`);
  await bell(alicePage).waitFor();
  await alicePage.waitForTimeout(2500); // let the notification socket connect
  const liked = await api("POST", `/likes/send/${alice.id}`, { token: bob.token });
  check(liked.status === 201, JSON.stringify(liked.body));
  await alicePage.getByText("Someone likes you").first().waitFor();
  await alicePage.getByRole("button", { name: "Notifications, 1 unread" }).waitFor();
  await shot(alicePage, "03-live-like-toast");
});

await step("the bell lists it, and opening it goes to Likes and clears the badge", async () => {
  await bell(alicePage).click();
  const item = alicePage.getByRole("link", { name: /Someone likes you/ }).last();
  await item.waitFor();
  await shot(alicePage, "04-bell-dropdown");
  await item.click();
  await alicePage.waitForURL(/\/likes/);
  await alicePage.getByRole("button", { name: "Notifications", exact: true }).waitFor();
});

await step("accepting the like produces a live 'It's a match!' notification", async () => {
  const incoming = await api("GET", "/likes/incoming", { token: alice.token });
  const accepted = await api("POST", `/likes/accept/${incoming.data.likes[0].likeId}`, { token: alice.token });
  check(accepted.status === 200, JSON.stringify(accepted.body));
  await alicePage.getByText("It's a match!").first().waitFor();
});

await step("a chat message arrives live", async () => {
  const matches = await api("GET", "/matches", { token: alice.token });
  const started = await api("POST", `/conversations/start/${matches.data.matches[0].matchId}`, { token: bob.token });
  await alicePage.goto(`${WEB}/dashboard`);
  await bell(alicePage).waitFor();
  await alicePage.waitForTimeout(2500);
  await api("POST", "/messages/send", { token: bob.token, body: { conversationId: started.data.conversation.id, content: "hey Alice, nice to meet you" } });
  await alicePage.getByText(`New message from Bob${sfx}`).first().waitFor();
});

await step("Notification Center: list, unread filter, mark all read", async () => {
  await alicePage.goto(`${WEB}/notifications`);
  await alicePage.getByRole("heading", { name: "Notifications", exact: true }).waitFor();
  await alicePage.getByText("It's a match!").first().waitFor();
  await alicePage.getByRole("tab", { name: /unread/i }).click();
  await alicePage.getByRole("button", { name: "Mark all as read" }).click();
  await alicePage.getByText("No unread notifications").waitFor();
  await alicePage.getByRole("tab", { name: "all", exact: true }).click();
  await alicePage.getByText("It's a match!").first().waitFor();
  await shot(alicePage, "05-notification-center");
});

// ---------------------------------------------------------------------------
console.log("\nSettings, referrals, safety");

await step("settings: a preference toggle is saved and survives a reload", async () => {
  await alicePage.goto(`${WEB}/settings?group=notifications`);
  const likes = alicePage.locator("#pref-like");
  await likes.waitFor();
  check((await likes.getAttribute("aria-checked")) === "true", "likes should default to on");
  await likes.click();
  await alicePage.waitForTimeout(800);
  await alicePage.reload();
  await alicePage.locator("#pref-like").waitFor();
  check((await alicePage.locator("#pref-like").getAttribute("aria-checked")) === "false", "preference was not persisted");
  await alicePage.locator("#pref-like").click();
  await shot(alicePage, "06-settings");
});

await step("referrals: code, link, tiers, and inviting by email", async () => {
  await alicePage.goto(`${WEB}/referrals`);
  await alicePage.getByText("Your referral code").waitFor();
  check(/^[A-Z2-9]{8}$/.test((await alicePage.locator("span.font-display.tracking-\\[0\\.18em\\]").first().innerText()).trim()), "code format");
  await alicePage.getByText("1 week of Premium", { exact: true }).waitFor();
  await alicePage.getByLabel("Email addresses").fill(`friend.${stamp}@e2e.test`);
  await alicePage.getByRole("button", { name: "Send invitations" }).click();
  await alicePage.getByText("Invitation on the way.").waitFor();
  await shot(alicePage, "07-referrals");
});

await step("safety: report a match from the matches page", async () => {
  await alicePage.goto(`${WEB}/matches`);
  await alicePage.getByRole("button", { name: `Safety options for Bob${sfx}` }).waitFor();
  await alicePage.getByRole("button", { name: `Safety options for Bob${sfx}` }).click();
  await alicePage.getByRole("menuitem", { name: new RegExp(`Report Bob${sfx}`) }).click();
  await alicePage.getByLabel("Spam").check();
  await alicePage.getByLabel("Additional details").fill("E2E test report");
  await alicePage.getByRole("button", { name: "Send report" }).click();
  await alicePage.getByText(/Thanks — we.re on it/).waitFor();
  await shot(alicePage, "08-report-sent");
  await alicePage.getByRole("button", { name: "Done" }).click();
});

await step("safety: block someone from Discover, see them in Settings, unblock", async () => {
  await alicePage.goto(`${WEB}/discover`);
  await alicePage.getByText(`Carol${sfx} E2E`).first().waitFor();
  await alicePage.getByRole("button", { name: `Safety options for Carol${sfx}` }).click();
  await alicePage.getByRole("menuitem", { name: new RegExp(`Block Carol${sfx}`) }).click();
  await alicePage.getByRole("button", { name: `Block Carol${sfx}` }).click();
  await alicePage.getByText(`Carol${sfx} E2E`).first().waitFor({ state: "detached" });
  await alicePage.goto(`${WEB}/settings?group=blocked`);
  await alicePage.getByText(`Carol${sfx} E2E`).waitFor();
  await alicePage.getByRole("button", { name: "Unblock" }).click();
  await alicePage.getByText("You haven't blocked anyone.").waitFor();
});

// ---------------------------------------------------------------------------
console.log("\nAdmin dashboard");
const adminContext = await newContext();
const adminPage = await adminContext.newPage();
currentPage = adminPage;
watch(adminPage, "admin");

await step("a regular member is refused at /admin", async () => {
  const page = await aliceContext.newPage();
  await page.goto(`${WEB}/admin`);
  await page.getByRole("heading", { name: "Admins only" }).waitFor();
  await page.close();
});

await step("admin signs in and sees the KPI overview and a chart", async () => {
  await uiLogin(adminPage, adminUser.email);
  await adminPage.goto(`${WEB}/admin`);
  for (const label of ["Total users", "Active users (24h)", "New registrations (7d)", "Matches created", "Messages sent", "Premium subscribers"]) {
    await adminPage.getByText(label, { exact: true }).waitFor();
  }
  await adminPage.locator("svg[role=img]").first().waitFor();
  await shot(adminPage, "09-admin-overview");
});

await step("analytics: rates, trend chart with table view, funnel", async () => {
  await adminPage.goto(`${WEB}/admin/analytics`);
  await adminPage.getByText("Interview completion rate").waitFor();
  await adminPage.getByText("Premium conversion").waitFor();
  await adminPage.getByRole("tab", { name: "Matches" }).click();
  await adminPage.getByRole("button", { name: "View as table" }).click();
  await adminPage.getByRole("columnheader", { name: /matches/i }).waitFor();
  await adminPage.getByRole("button", { name: "View as chart" }).click();
  await adminPage.getByText("Conversion funnel").waitFor();
  await adminPage.getByText("Registered", { exact: true }).waitFor();
  await shot(adminPage, "10-admin-analytics");
});

await step("moderation queue: open the report, suspend the account", async () => {
  await adminPage.goto(`${WEB}/admin/moderation`);
  await adminPage.getByRole("button", { name: new RegExp(`Bob${sfx} E2E`) }).first().click();
  await adminPage.getByText("“E2E test report”", { exact: true }).waitFor();
  await adminPage.getByLabel(/Suspend the account/).check();
  await adminPage.getByLabel("Resolution note").fill("E2E: confirmed spam");
  await adminPage.getByRole("button", { name: "Suspend the account", exact: true }).click();
  await adminPage.getByRole("tab", { name: /Resolved/ }).click();
  await adminPage.getByRole("button", { name: new RegExp(`Bob${sfx} E2E`) }).first().waitFor();
  await shot(adminPage, "11-admin-moderation");
  const login = await api("POST", "/auth/login", { body: { email: bob.email, password: PASSWORD } });
  check(login.status === 403 && login.body.error.code === "ACCOUNT_SUSPENDED", `Bob should be suspended: ${login.status}`);
});

await step("users: search, then reinstate the suspended member", async () => {
  await adminPage.goto(`${WEB}/admin/users`);
  await adminPage.getByLabel("Search users").fill(`Bob${sfx} E2E`);
  await adminPage.getByRole("button", { name: new RegExp(`Bob${sfx} E2E`) }).first().click();
  await adminPage.getByRole("dialog").getByText("Suspended", { exact: true }).first().waitFor();
  await adminPage.getByRole("button", { name: "Reinstate account" }).click();
  await adminPage.getByText("Account reinstated.").waitFor();
  const login = await api("POST", "/auth/login", { body: { email: bob.email, password: PASSWORD } });
  check(login.status === 200, `Bob should be able to log in again, got ${login.status}`);
});

await step("feature flags: switching billing on asks for confirmation, then applies without a deploy", async () => {
  check(!(await api("GET", "/features/public")).data.billing, "billing should start off");
  await adminPage.goto(`${WEB}/admin/flags`);
  await adminPage.locator("#flag-billing").waitFor();
  await adminPage.locator("#flag-billing").click();
  await adminPage.getByRole("button", { name: "Turn on" }).click();
  await adminPage.waitForFunction(() => document.querySelector("#flag-billing")?.getAttribute("aria-checked") === "true");
  check((await api("GET", "/features/public")).data.billing === true, "the API should report billing on");
  await shot(adminPage, "12-admin-flags");
});

await step("waitlist and system pages load with live data", async () => {
  await adminPage.goto(`${WEB}/admin/waitlist`);
  await adminPage.getByText("Invite the next").waitFor();
  await adminPage.getByText(`wait.${stamp}@e2e.test`).waitFor();
  await adminPage.goto(`${WEB}/admin/system`);
  await adminPage.getByRole("heading", { name: "Scheduled jobs" }).waitFor();
  await adminPage.getByText("subscription-expiry").waitFor();
  await adminPage.getByText("Connected").waitFor();
});

// ---------------------------------------------------------------------------
console.log("\nPremium: checkout, perks and cancellation (billing flag is on)");
currentPage = alicePage;

await step("advanced filters are locked for a free member once the perk is live", async () => {
  await setFlag(adminUser.token, "advanced_filters", true);
  await alicePage.goto(`${WEB}/discover`);
  const toggle = alicePage.getByRole("button", { name: /Advanced filters/ });
  await toggle.waitFor();
  await toggle.getByText("Premium").waitFor();
  await toggle.click();
  await alicePage.getByText("Filter by age, gender and interests with Premium.").waitFor();
});

await step("pricing → sandbox checkout → Premium is active, with a receipt", async () => {
  await alicePage.goto(`${WEB}/pricing`);
  await alicePage.getByRole("button", { name: "Choose Premium", exact: true }).click();
  await alicePage.waitForURL(/\/billing\/mock-checkout/);
  await alicePage.getByText("Sandbox checkout — no real payment is taken.").waitFor();
  await shot(alicePage, "13-mock-checkout");
  await alicePage.getByRole("button", { name: /Pay \$9\.99/ }).click();
  await alicePage.waitForURL(/\/billing\?checkout=success/);
  await alicePage.getByText(/Payment received — welcome to Premium/).waitFor();
  await alicePage.getByText("$9.99", { exact: true }).waitFor();
  await shot(alicePage, "14-billing-premium");
});

await step("the perk unlocks immediately: advanced filters work and the plan shows in the menu", async () => {
  await alicePage.goto(`${WEB}/discover`);
  const toggle = alicePage.getByRole("button", { name: /Advanced filters/ });
  await toggle.waitFor();
  check((await toggle.getByText("Premium").count()) === 0, "the Premium lock chip should be gone");
  await toggle.click();
  await alicePage.getByLabel("Minimum age").fill("18");
  await alicePage.getByRole("button", { name: "Apply filters" }).click();
  await alicePage.getByRole("button", { name: "Account menu" }).click();
  await alicePage.getByText("Premium", { exact: true }).first().waitFor();
  await alicePage.keyboard.press("Escape");
});

await step("My perks page reflects the plan", async () => {
  await alicePage.goto(`${WEB}/premium`);
  await alicePage.getByRole("heading", { name: "My perks" }).waitFor();
  await alicePage.getByText("Advanced filters").first().waitFor();
  await shot(alicePage, "15-my-perks");
});

await step("cancelling keeps access until the period ends", async () => {
  await alicePage.goto(`${WEB}/billing`);
  await alicePage.getByRole("button", { name: "Cancel subscription" }).click();
  await alicePage.getByRole("dialog").getByRole("button", { name: "Cancel subscription" }).click();
  await alicePage.getByText(/Your subscription is cancelled/).waitFor();
  await alicePage.getByText("Ends at period end").waitFor();
});

await step("waitlist mode: registration without an invite is turned away, with a path to the waitlist", async () => {
  await setFlag(adminUser.token, "waitlist_mode", true);
  const context = await newContext();
  try {
    const page = await context.newPage();
    currentPage = page;
    await page.goto(`${WEB}/register`);
    await page.fill("#fullName", "No Invite");
    await page.fill("#email", `noinvite.${stamp}@e2e.test`);
    await page.fill("#password", PASSWORD);
    await page.fill("#confirmPassword", PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByText(/invite-only/).waitFor();
    await page.getByRole("link", { name: "Join the waitlist" }).waitFor();
  } finally {
    // Never leave the door closed behind us, even if an assertion above failed.
    await context.close().catch(() => {});
    await setFlag(adminUser.token, "waitlist_mode", false);
  }
});

// ---------------------------------------------------------------------------
console.log("\nMobile layout (390 × 844)");
{
  const context = await newContext({ width: 390, height: 844 });
  const page = await context.newPage();
  currentPage = page;
  watch(page, "mobile");
  await step("mobile: sign in", async () => {
    await page.goto(`${WEB}/login`);
    await page.fill("#email", alice.email);
    await page.fill("#password", PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL(/\/dashboard/);
  });

  for (const [path, marker] of [
    ["/notifications", "Notifications"],
    ["/pricing", "Premium Plus"],
    ["/billing", "Payment history"],
    ["/settings", "Privacy & AI"],
    ["/premium", "Daily likes"],
  ]) {
    await step(`no horizontal overflow on ${path}`, async () => {
      await page.goto(`${WEB}${path}`);
      await page.getByText(marker).first().waitFor();
      await page.waitForTimeout(400);
      const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
      check(scroll <= inner + 1, `page is ${scroll}px wide in a ${inner}px viewport`);
      await shot(page, `mobile${path.replace(/\//g, "-")}`);
    });
  }

  await step("the bell works on a phone", async () => {
    await page.goto(`${WEB}/dashboard`);
    await bell(page).click();
    await page.getByRole("link", { name: "View all notifications" }).waitFor();
    const box = await page.getByRole("link", { name: "View all notifications" }).boundingBox();
    check(box && box.x >= 0 && box.x + box.width <= 390, "the dropdown spills outside the screen");
    await shot(page, "mobile-bell");
  });
  await context.close();
}

// ---------------------------------------------------------------------------
await step("no unexpected browser console errors or uncaught exceptions", async () => {
  check(consoleProblems.length === 0, `${consoleProblems.length} problem(s):\n${consoleProblems.slice(0, 6).join("\n")}`);
});

await browser.close();

const failed = results.filter((r) => r.status === "fail");
const passed = results.filter((r) => r.status === "pass");
const skipped = results.filter((r) => r.status === "skip");
console.log(`\n${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped  (screenshots: ${OUT})\n`);
process.exit(failed.length ? 1 : 0);
