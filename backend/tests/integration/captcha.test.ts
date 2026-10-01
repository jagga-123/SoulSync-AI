import "../helpers/setup-env";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startFakeProvider, type FakeProvider } from "../helpers/fake-provider";
import { startHarness, type Harness } from "../helpers/harness";

// A separate process/file from the rest of the auth tests: config/env.ts parses process.env once
// per process, so TURNSTILE_SECRET_KEY must be set before this file's first startHarness() call —
// it can't be toggled on partway through a file that already has a harness running (see
// tests/helpers/harness.ts's doc comment).
describe("CAPTCHA (Cloudflare Turnstile) — configured", () => {
  const SECRET = "turnstile-secret-for-tests";
  let h: Harness;
  let turnstile: FakeProvider;

  before(async () => {
    turnstile = await startFakeProvider((req) => {
      if (req.path !== "/siteverify") return undefined;
      const token = req.form.response;
      if (token === "human-token") return { body: { success: true } };
      return { body: { success: false, "error-codes": ["invalid-input-response"] } };
    });
    h = await startHarness({ env: { TURNSTILE_SECRET_KEY: SECRET, TURNSTILE_VERIFY_URL: `${turnstile.url}/siteverify` } });
  });
  after(async () => {
    await h.stop();
    await turnstile.close();
  });

  const register = (body: Record<string, unknown>) =>
    h.api.post("/auth/register", { fullName: "Captcha Carl", email: `captcha.${Math.random().toString(36).slice(2)}@test.local`, password: "Passw0rd!23", ...body });

  it("blocks registration with no token at all", async () => {
    const res = await register({});
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "CAPTCHA_FAILED");
  });

  it("blocks registration with an invalid/failed token", async () => {
    const res = await register({ captchaToken: "a-bot-trying-its-luck" });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "CAPTCHA_FAILED");
  });

  it("lets a human through with a valid token", async () => {
    const res = await register({ captchaToken: "human-token" });
    assert.equal(res.status, 201, JSON.stringify(res.body));
  });

  it("signs the siteverify call correctly: secret, the token, and the caller's IP", async () => {
    await register({ captchaToken: "human-token", email: "captcha.signed@test.local" });
    const call = turnstile.matching("POST", "/siteverify").at(-1)!;
    assert.equal(call.form.secret, SECRET);
    assert.equal(call.form.response, "human-token");
    assert.ok(call.form.remoteip, "the caller's IP is forwarded to Cloudflare");
  });

  it("also protects forgot-password", async () => {
    // Not h.createUser() — it registers via the same CAPTCHA-gated endpoint this harness just
    // enabled, and the shared helper doesn't know about captchaToken.
    const email = "captcha.target@test.local";
    await h.api.post("/auth/register", { fullName: "Captcha Target", email, password: "Passw0rd!23", captchaToken: "human-token" });

    const blocked = await h.api.post("/auth/forgot-password", { email });
    assert.equal(blocked.status, 400);
    assert.equal(blocked.body.error.code, "CAPTCHA_FAILED");

    const allowed = await h.api.post("/auth/forgot-password", { email, captchaToken: "human-token" });
    assert.equal(allowed.status, 200);
  });

  it("fails closed when Cloudflare itself is unreachable (never fails open)", async () => {
    const { env } = await h.load("../../src/config/env");
    const saved = env.TURNSTILE_VERIFY_URL;
    env.TURNSTILE_VERIFY_URL = "http://127.0.0.1:1/unreachable";
    try {
      const down = await h.api.post("/auth/register", { fullName: "Captcha Down", email: "captcha.down@test.local", password: "Passw0rd!23", captchaToken: "human-token" });
      assert.equal(down.status, 400);
      assert.equal(down.body.error.code, "CAPTCHA_FAILED");
    } finally {
      env.TURNSTILE_VERIFY_URL = saved;
    }
  });
});
