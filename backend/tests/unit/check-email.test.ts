import "../helpers/setup-env";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { SMTPServer } from "smtp-server";
import { startFakeProvider, type FakeProvider } from "../helpers/fake-provider";

const BACKEND = resolve(__dirname, "../..");
const TSX = resolve(BACKEND, "node_modules/tsx/dist/cli.mjs");
const API_KEY = "xkeysib-secret-api-key-0123456789";
const SENDER = "hello@soulsync.test";

interface Outcome { code: number | null; out: string }

function run(args: string[], env: Record<string, string>): Promise<Outcome> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [TSX, "scripts/check-email.ts", ...args], {
      cwd: BACKEND,
      env: {
        ...process.env,
        NODE_ENV: "development", LOG_LEVEL: "silent", CHECK_EMAIL_SKIP_DNS: "1", CHECK_EMAIL_PACING_MS: "0",
        EMAIL_PROVIDER: "brevo", EMAIL_FROM: `SoulSync AI <${SENDER}>`, EMAIL_REPLY_TO: "support@soulsync.test", API_PUBLIC_URL: "https://api.soulsync.test/api",
        RESEND_API_KEY: "", SENDGRID_API_KEY: "", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "", BREVO_API_KEY: API_KEY,
        ...env,
      },
    });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => (out += chunk));
    child.stderr.on("data", (chunk: Buffer) => (out += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolveRun({ code, out }));
  });
}

describe("npm run check:email (against a local stand-in for Brevo's API)", () => {
  let api: FakeProvider;
  let senders: Array<{ email: string; active: boolean }> = [{ email: SENDER, active: true }];
  let domainAuthenticated = true;

  before(async () => {
    api = await startFakeProvider((req) => {
      if (req.headers["api-key"] !== API_KEY) return { status: 401, body: { message: "Key not found", code: "unauthorized" } };
      if (req.path === "/v3/account") return { body: { plan: [{ type: "free", credits: 300 }], relay: { data: { userName: "9a1b2c001@smtp-brevo.com" } } } };
      if (req.path === "/v3/senders") return { body: { senders } };
      if (req.path === "/v3/senders/domains") return { body: { domains: [{ domain_name: "soulsync.test", authenticated: domainAuthenticated }] } };
      if (req.path === "/v3/smtp/email") return { status: 201, body: { messageId: "<check.1@relay.brevo.test>" } };
      return undefined;
    });
  });
  after(() => api.close());

  const base = () => ({ BREVO_BASE_URL: api.url });

  it("passes when the key, the sender and the domain are all valid — and prints no secret", async () => {
    const { code, out } = await run([], base());
    assert.equal(code, 0, out);
    assert.match(out, /PASS\s+API key — accepted — plan free, 300 credits/);
    assert.match(out, /PASS\s+sender verification — /);
    assert.match(out, /PASS\s+domain authentication/);
    assert.match(out, /PASS\s+API_PUBLIC_URL/);
    assert.match(out, /PASS\s+EMAIL_REPLY_TO/);
    assert.match(out, /9a1b2c001@smtp-brevo\.com/, "shows the SMTP login Brevo reports for the account");
    assert.match(out, /no email was sent/);
    assert.ok(!out.includes(API_KEY), "the API key is never printed");
    assert.equal(api.matching("POST", "/v3/smtp/email").length, 0, "nothing is sent without --send-test");
  });

  it("fails — naming the address and the verified alternatives — when EMAIL_FROM is not a verified Brevo sender", async () => {
    senders = [{ email: "real-sender@soulsync.test", active: true }];
    try {
      const { code, out } = await run([], { ...base(), EMAIL_FROM: "SoulSync AI <someone-else@soulsync.test>" });
      assert.equal(code, 1, out);
      assert.match(out, /FAIL\s+sender verification/);
      assert.match(out, /real-sender@soulsync\.test/, "tells you which senders ARE verified");
    } finally {
      senders = [{ email: SENDER, active: true }];
    }
  });

  it("fails on a rejected API key with the exact reason", async () => {
    const { code, out } = await run([], { ...base(), BREVO_API_KEY: "xkeysib-revoked-key" });
    assert.equal(code, 1, out);
    assert.match(out, /FAIL\s+API key — rejected \(HTTP 401 Key not found\)/);
  });

  it("explains an SMTP key without the SMTP login, instead of guessing", async () => {
    const { code, out } = await run([], { EMAIL_PROVIDER: "log", BREVO_API_KEY: "xsmtpsib-secret-smtp-key", SMTP_HOST: "127.0.0.1", SMTP_PORT: "1" });
    assert.equal(code, 1, out);
    assert.match(out, /FAIL\s+credentials — BREVO_API_KEY is an SMTP key \(xsmtpsib-…\) and SMTP_USER is not set/);
    assert.match(out, /SMTP & API → SMTP tab/);
    assert.ok(!out.includes("xsmtpsib-secret-smtp-key"));
  });

  it("flags EMAIL_PROVIDER=log and a missing sender as blockers", async () => {
    const { code, out } = await run([], { ...base(), EMAIL_PROVIDER: "log" });
    assert.equal(code, 1, out);
    assert.match(out, /FAIL\s+EMAIL_PROVIDER — is 'log'/);
  });

  describe("--send-test", () => {
    it("really sends the verify-email template through the app's provider chain to the address you give", async () => {
      const before = api.matching("POST", "/v3/smtp/email").length;
      const { code, out } = await run(["--send-test", "--to", "inbox@example.test"], base());
      assert.equal(code, 0, out);
      assert.match(out, /PASS\s+send verify-email — accepted for in\*\*\*@example\.test via brevo \(message id <check\.1@relay\.brevo\.test>\)/);
      const sent = api.matching("POST", "/v3/smtp/email").slice(before);
      assert.equal(sent.length, 1);
      assert.deepEqual(sent[0]!.json.to, [{ email: "inbox@example.test" }]);
      assert.deepEqual(sent[0]!.json.sender, { email: SENDER, name: "SoulSync AI" });
      assert.deepEqual(sent[0]!.json.replyTo, { email: "support@soulsync.test" });
      assert.match(sent[0]!.json.subject, /^\[SoulSync test\] Verify your email/);
      assert.ok(sent[0]!.json.htmlContent && sent[0]!.json.textContent, "HTML and text");
    });

    it("--all-templates sends every template once", async () => {
      const before = api.matching("POST", "/v3/smtp/email").length;
      const { code, out } = await run(["--send-test", "--to", "inbox@example.test", "--all-templates"], base());
      assert.equal(code, 0, out);
      assert.equal(api.matching("POST", "/v3/smtp/email").length - before, 11);
    });

    it("works even while .env still says EMAIL_PROVIDER=log (it tests the real chain, not the log)", async () => {
      const before = api.matching("POST", "/v3/smtp/email").length;
      const { code, out } = await run(["--send-test", "--to", "inbox@example.test"], { ...base(), EMAIL_PROVIDER: "log" });
      assert.match(out, /testing the real Brevo → Resend → SendGrid chain/);
      assert.equal(api.matching("POST", "/v3/smtp/email").length - before, 1);
      void code;
    });

    it("defaults to your own Reply-To address when --to is omitted", async () => {
      const before = api.matching("POST", "/v3/smtp/email").length;
      const { code, out } = await run(["--send-test"], base());
      assert.equal(code, 0, out);
      const sent = api.matching("POST", "/v3/smtp/email").slice(before);
      assert.deepEqual(sent[0]!.json.to, [{ email: "support@soulsync.test" }]);
    });

    it("refuses to guess a recipient when there is no Reply-To and no sender is configured", async () => {
      const { code, out } = await run(["--send-test"], { ...base(), EMAIL_PROVIDER: "log", EMAIL_REPLY_TO: "", EMAIL_FROM: "" });
      assert.equal(code, 1, out);
      assert.match(out, /FAIL\s+recipient — no test recipient/);
    });

    it("reports the exact failure when nothing could deliver", async () => {
      const { code, out } = await run(["--send-test", "--to", "inbox@example.test"], { ...base(), BREVO_API_KEY: "xkeysib-revoked-key" });
      assert.equal(code, 1, out);
      assert.match(out, /FAIL\s+send verify-email — HTTP 401 .*Key not found/);
    });
  });

  describe("EMAIL_PROVIDER=smtp (SMTP relay only — the Brevo API is never called)", () => {
    const LOGIN = "smtp-login-test@smtp-brevo.test";
    const KEY = "xsmtpsib-secret-smtp-key-0123456789";
    let smtp: SMTPServer;
    let port: number;
    const delivered: Array<{ user?: string; raw: string }> = [];

    before(async () => {
      smtp = new SMTPServer({
        authOptional: false,
        allowInsecureAuth: true,
        disabledCommands: ["STARTTLS"],
        onAuth(auth, _session, callback) {
          if (auth.username === LOGIN && auth.password === KEY) return callback(null, { user: auth.username });
          callback(Object.assign(new Error("Authentication failed"), { responseCode: 535 }));
        },
        onData(stream, session, done) {
          const chunks: Buffer[] = [];
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("end", () => {
            delivered.push({ user: session.user as string | undefined, raw: Buffer.concat(chunks).toString("utf8") });
            done();
          });
        },
      });
      await new Promise<void>((resolveListen) => smtp.listen(0, "127.0.0.1", resolveListen));
      port = (smtp.server.address() as AddressInfo).port;
    });
    after(() => new Promise<void>((resolveClose) => smtp.close(() => resolveClose())));

    const smtpEnv = (extra: Record<string, string> = {}) => ({ EMAIL_PROVIDER: "smtp", SMTP_HOST: "127.0.0.1", SMTP_PORT: String(port), SMTP_USER: LOGIN, SMTP_PASS: KEY, BREVO_BASE_URL: api.url, ...extra });

    it("verifies the connection and the login, and calls no provider API at all", async () => {
      const before = api.requests.length;
      const { code, out } = await run([], smtpEnv());
      assert.equal(code, 0, out);
      assert.match(out, /PASS\s+EMAIL_PROVIDER — smtp — every email goes through the SMTP relay only/);
      assert.match(out, /PASS\s+SMTP connection/);
      assert.match(out, /PASS\s+SMTP login — the relay accepted the login and SMTP key/);
      assert.match(out, /INFO\s+fallbacks — not used/);
      assert.match(out, /"smtpConnected":true,"provider":"smtp","senderConfigured":true/);
      assert.equal(api.requests.length, before, "no request reached the (stand-in) Brevo API");
      assert.ok(!out.includes(KEY), "the SMTP key is never printed");
    });

    it("fails with the server's exact reply when the SMTP key is wrong", async () => {
      const { code, out } = await run([], smtpEnv({ SMTP_PASS: "xsmtpsib-wrong-key" }));
      assert.equal(code, 1, out);
      assert.match(out, /FAIL\s+SMTP login — SMTP EAUTH 535 Authentication failed/);
      assert.ok(!out.includes("xsmtpsib-wrong-key"));
    });

    it("fails cleanly when the relay cannot be reached", async () => {
      const { code, out } = await run([], smtpEnv({ SMTP_PORT: "1" }));
      assert.equal(code, 1, out);
      assert.match(out, /FAIL\s+SMTP connection — cannot connect to 127\.0\.0\.1:1/);
    });

    it("--send-test sends ONE real message through SMTP to your own Reply-To address, and logs the result", async () => {
      const before = delivered.length;
      const { code, out } = await run(["--send-test"], smtpEnv({ LOG_LEVEL: "info" }));
      assert.equal(code, 0, out);
      assert.match(out, /PASS\s+send verify-email — accepted for su\*\*\*@soulsync\.test via smtp/);
      assert.match(out, /"outcome":"accepted"[^\n]*"msg":"test email send result"|"msg":"test email send result"[^\n]*"outcome":"accepted"/, "the result is logged");
      const sent = delivered.slice(before);
      assert.equal(sent.length, 1);
      assert.equal(sent[0]!.user, LOGIN);
      assert.match(sent[0]!.raw, /^To: support@soulsync\.test/m);
      assert.match(sent[0]!.raw, /^Subject: \[SoulSync test\] Verify your email/m);
      assert.match(sent[0]!.raw, /^From: SoulSync AI <hello@soulsync\.test>/m);
    });

    it("never uses the SMTP login as the test recipient", async () => {
      const { code, out } = await run(["--send-test"], smtpEnv({ EMAIL_PROVIDER: "log", EMAIL_REPLY_TO: "", EMAIL_FROM: "" }));
      assert.equal(code, 1, out);
      assert.match(out, /FAIL\s+recipient — no test recipient/);
    });

    it("reports the SMTP failure when the send is refused", async () => {
      const { code, out } = await run(["--send-test", "--to", "inbox@example.test"], smtpEnv({ SMTP_PASS: "xsmtpsib-wrong-key" }));
      assert.equal(code, 1, out);
      assert.match(out, /FAIL\s+send verify-email — .*535/);
    });
  });
});
