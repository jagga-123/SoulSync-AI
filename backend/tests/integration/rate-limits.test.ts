import "../helpers/setup-env";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startHarness, type Harness } from "../helpers/harness";

describe("rate limiting (enabled, one proxy in front)", () => {
  let h: Harness;

  before(async () => {
    h = await startHarness({
      env: { RATE_LIMIT_DISABLED: "false", RATE_LIMIT_AUTH_MAX: "5", RATE_LIMIT_GLOBAL_MAX: "120", TRUST_PROXY: "1" },
    });
  });
  after(() => h.stop());

  const login = (ip: string) => h.api.post("/auth/login", { email: "nobody@test.local", password: "wrong-pass1" }, { headers: { "X-Forwarded-For": ip } });

  describe("brute-force protection on /auth", () => {
    it("lets a normal number of attempts through, then answers 429 in the standard envelope", async () => {
      for (let i = 1; i <= 5; i++) assert.equal((await login("10.0.0.1")).status, 401, `attempt ${i}`);
      const blocked = await login("10.0.0.1");
      assert.equal(blocked.status, 429);
      assert.equal(blocked.body.success, false);
      assert.match(blocked.body.message, /Too many attempts/);
      assert.ok(blocked.headers.get("retry-after"), "tells the client when to retry");
      assert.ok(blocked.headers.get("ratelimit") || blocked.headers.get("ratelimit-policy"), "standard RateLimit headers");
    });

    it("does NOT count the session check (GET /auth/me) that every page load makes — only login/register attempts", async () => {
      const [member] = await h.seedUsers(1);
      const me = () => h.api.get("/auth/me", { token: member!.token, headers: { "X-Forwarded-For": "10.0.0.9" } });

      // Far more than RATE_LIMIT_AUTH_MAX (5): ordinary browsing must never be locked out.
      for (let i = 1; i <= 40; i++) assert.equal((await me()).status, 200, `session check ${i}`);

      // ...while the same address still can't brute-force a password.
      for (let i = 1; i <= 5; i++) assert.equal((await login("10.0.0.9")).status, 401, `login attempt ${i}`);
      assert.equal((await login("10.0.0.9")).status, 429, "login attempts are still limited");
      assert.equal((await me()).status, 200, "and the blocked address can still use its existing session");
    });

    it("keeps counting per client address behind the proxy, so one attacker can't lock everyone out", async () => {
      assert.equal((await login("10.0.0.2")).status, 401, "a different client is unaffected");
      assert.equal((await login("10.0.0.1")).status, 429, "the first is still blocked");
    });

    it("also protects registration, and blocks a correct password once the budget is spent", async () => {
      const email = `ratelimited.${Date.now()}@test.local`;
      for (let i = 0; i < 5; i++) await h.api.post("/auth/register", { fullName: "Spam Bot", email: `${i}.${email}`, password: "Passw0rd!23" }, { headers: { "X-Forwarded-For": "10.0.0.3" } });
      const res = await h.api.post("/auth/register", { fullName: "Spam Bot", email, password: "Passw0rd!23" }, { headers: { "X-Forwarded-For": "10.0.0.3" } });
      assert.equal(res.status, 429);
    });
  });

  describe("per-user limits on abuse-prone actions", () => {
    it("caps verification emails per account (5/hour) without affecting anyone else", async () => {
      const [spammer, bystander] = await h.seedUsers(2);
      const resend = (token: string) => h.api.post("/account/resend-verification", undefined, { token, headers: { "X-Forwarded-For": "10.0.1.1" } });
      for (let i = 0; i < 5; i++) assert.equal((await resend(spammer!.token)).status, 200);
      const blocked = await resend(spammer!.token);
      assert.equal(blocked.status, 429);
      assert.match(blocked.body.message, /verification emails/);
      assert.equal((await resend(bystander!.token)).status, 200, "same IP, different account: separate budget");
    });

    it("caps reports per account (10/hour)", async () => {
      const [reporter, ...targets] = await h.seedUsers(12);
      let last = 0;
      for (const target of targets) {
        last = (await h.api.post("/safety/reports", { userId: target.id, reason: "spam" }, { token: reporter!.token, headers: { "X-Forwarded-For": "10.0.1.2" } })).status;
        if (last === 429) break;
      }
      assert.equal(last, 429);
    });

    it("caps public waitlist sign-ups per network (10/hour)", async () => {
      let status = 0;
      for (let i = 0; i < 12; i++) {
        status = (await h.api.post("/growth/waitlist", { email: `wl${i}@test.local` }, { headers: { "X-Forwarded-For": "10.0.1.3" } })).status;
        if (status === 429) break;
      }
      assert.equal(status, 429);
      assert.equal((await h.api.post("/growth/waitlist", { email: "other.network@test.local" }, { headers: { "X-Forwarded-For": "10.0.1.4" } })).status, 200);
    });

    it("caps client-error reports per network, so the endpoint can't be used to fill the logs", async () => {
      let status = 0;
      for (let i = 0; i < 35; i++) {
        status = (await h.api.post("/client-errors", { message: `oops ${i}` }, { headers: { "X-Forwarded-For": "10.0.1.5" } })).status;
        if (status === 429) break;
      }
      assert.equal(status, 429);
    });
  });

  describe("global safety net", () => {
    it("caps total requests per address, but never the health and metrics probes", async () => {
      let status = 0;
      let sent = 0;
      while (status !== 429 && sent < 200) {
        status = (await h.api.get("/features/public", { headers: { "X-Forwarded-For": "10.0.2.1" } })).status;
        sent++;
      }
      assert.equal(status, 429);
      assert.ok(sent >= 100 && sent <= 125, `blocked after about 120 requests, got ${sent}`);

      for (let i = 0; i < 10; i++) {
        assert.equal((await h.api.get("/health", { headers: { "X-Forwarded-For": "10.0.2.1" } })).status, 200);
        assert.equal((await h.api.get("/health/ready", { headers: { "X-Forwarded-For": "10.0.2.1" } })).status, 200);
      }
    });

    it("still serves other clients at that moment", async () => {
      assert.equal((await h.api.get("/features/public", { headers: { "X-Forwarded-For": "10.0.2.2" } })).status, 200);
    });
  });
});
