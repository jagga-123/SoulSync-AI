import "../helpers/setup-env";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import { SMTPServer } from "smtp-server";
import { env } from "../../src/config/env";
import { brevoTransport, emailProviderOrder, getEmailProvider, retryPolicy, setEmailProviderForTests, type EmailMessage } from "../../src/services/email/providers";
import { sendEmail } from "../../src/services/emailClient";
import { startFakeProvider, type FakeProvider } from "../helpers/fake-provider";

retryPolicy.delayMs = 5; // the real pause is 500 ms

const MESSAGE: EmailMessage = {
  from: "SoulSync AI <no-reply@soulsync.test>",
  to: "ada@example.test",
  subject: "It's a match with Grace",
  html: "<p>Hello <strong>Ada</strong></p>",
  text: "Hello Ada",
  headers: { "List-Unsubscribe": "<https://api.test/unsub?token=t>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  replyTo: "SoulSync Support <support@soulsync.test>",
};

const SMTP_LOGIN = "9a1b2c001@smtp-brevo.com";
const SMTP_KEY = "xsmtpsib-test-smtp-key-0123456789";
const API_KEY = "xkeysib-test-api-key-0123456789";

const config = env as unknown as Record<string, unknown>;
const CLEAN = { BREVO_API_KEY: undefined, BREVO_BASE_URL: undefined, RESEND_API_KEY: undefined, RESEND_BASE_URL: undefined, SENDGRID_API_KEY: undefined, SENDGRID_BASE_URL: undefined, SMTP_HOST: undefined, SMTP_USER: undefined, SMTP_PASS: undefined, SMTP_PORT: 587, SMTP_SECURE: false, EMAIL_REPLY_TO: undefined };
const use = (values: Record<string, unknown>) => {
  Object.assign(config, CLEAN, values);
  setEmailProviderForTests(undefined); // drop the memoised provider so it re-reads the config
  return getEmailProvider();
};

describe("Brevo transports, one retry, fallbacks and Reply-To", () => {
  let api: FakeProvider;
  /** Answers the next N requests to a path with a status, then behaves normally. */
  const flaky = new Map<string, { status: number; times: number }>();
  const down = new Set<string>();

  let smtp: SMTPServer;
  let smtpPort: number;
  const smtpSessions: Array<{ user?: string; raw: string }> = [];
  let authAttempts = 0;

  before(async () => {
    api = await startFakeProvider((req) => {
      const plan = flaky.get(req.path);
      if (plan && plan.times > 0) {
        plan.times--;
        return { status: plan.status, body: { message: `simulated ${plan.status}` } };
      }
      if (down.has(req.path)) return { status: 503, body: { message: "upstream unavailable" } };
      if (req.path === "/v3/smtp/email") {
        if (req.headers["api-key"] !== API_KEY) return { status: 401, body: { message: "Key not found", code: "unauthorized" } };
        return { status: 201, body: { messageId: "<brevo.api.1@relay.brevo.test>" } };
      }
      if (req.path === "/emails") return { status: 200, body: { id: "re_msg_1" } };
      if (req.path === "/v3/mail/send") return { status: 202, body: {}, headers: { "x-message-id": "sg_msg_1" } };
      return undefined;
    });

    smtp = new SMTPServer({
      authOptional: false,
      allowInsecureAuth: true,
      disabledCommands: ["STARTTLS"],
      onAuth(auth, _session, callback) {
        authAttempts++;
        if (auth.username === SMTP_LOGIN && auth.password === SMTP_KEY) return callback(null, { user: auth.username });
        callback(Object.assign(new Error("Authentication failed"), { responseCode: 535 }));
      },
      onData(stream, session, done) {
        const chunks: Buffer[] = [];
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", () => {
          smtpSessions.push({ user: (session.user as string | undefined) ?? undefined, raw: Buffer.concat(chunks).toString("utf8") });
          done();
        });
      },
    });
    await new Promise<void>((resolve) => smtp.listen(0, "127.0.0.1", resolve));
    smtpPort = (smtp.server.address() as AddressInfo).port;
  });
  after(async () => {
    setEmailProviderForTests(undefined);
    await api.close();
    await new Promise<void>((resolve) => smtp.close(() => resolve()));
  });
  beforeEach(() => {
    flaky.clear();
    down.clear();
    api.requests.length = 0;
    smtpSessions.length = 0;
    authAttempts = 0;
  });

  const apiChain = (overrides: Record<string, unknown> = {}) =>
    use({ EMAIL_PROVIDER: "brevo", BREVO_API_KEY: API_KEY, BREVO_BASE_URL: api.url, RESEND_API_KEY: "re_test", RESEND_BASE_URL: api.url, SENDGRID_API_KEY: "SG.test", SENDGRID_BASE_URL: api.url, ...overrides });
  const smtpBrevo = (overrides: Record<string, unknown> = {}) =>
    use({ EMAIL_PROVIDER: "brevo", BREVO_API_KEY: SMTP_KEY, SMTP_USER: SMTP_LOGIN, SMTP_HOST: "127.0.0.1", SMTP_PORT: smtpPort, SMTP_SECURE: false, ...overrides });

  describe("which Brevo transport is used", () => {
    it("an API key (xkeysib-…) uses the REST API", () => {
      use({ BREVO_API_KEY: API_KEY });
      assert.deepEqual(brevoTransport(), { kind: "api", apiKey: API_KEY });
    });

    it("an SMTP key (xsmtpsib-…) with the SMTP login uses the relay, defaulting to smtp-relay.brevo.com:587 with TLS required", () => {
      use({ BREVO_API_KEY: SMTP_KEY, SMTP_USER: SMTP_LOGIN });
      const transport = brevoTransport();
      assert.equal(transport?.kind, "smtp");
      assert.deepEqual(transport?.kind === "smtp" && { ...transport.settings }, { host: "smtp-relay.brevo.com", port: 587, secure: false, user: SMTP_LOGIN, pass: SMTP_KEY, requireTLS: true });
    });

    it("SMTP_PASS can carry the SMTP key instead", () => {
      use({ SMTP_USER: SMTP_LOGIN, SMTP_PASS: SMTP_KEY });
      assert.equal(brevoTransport()?.kind, "smtp");
    });

    it("an SMTP key WITHOUT the SMTP login can't send — and Brevo drops out of the chain instead of failing every email", () => {
      use({ EMAIL_PROVIDER: "resend", BREVO_API_KEY: SMTP_KEY, RESEND_API_KEY: "re_test" });
      assert.equal(brevoTransport(), null);
      assert.deepEqual(emailProviderOrder(), ["resend"]);
    });
  });

  describe("Brevo over its SMTP relay", () => {
    it("logs in with the SMTP login + key and delivers a multipart message with every header", async () => {
      const result = await smtpBrevo().send(MESSAGE);
      assert.ok(result.id);
      assert.equal(smtpSessions.length, 1);
      assert.equal(smtpSessions[0]!.user, SMTP_LOGIN);
      const raw = smtpSessions[0]!.raw;
      assert.match(raw, /^From: SoulSync AI <no-reply@soulsync\.test>/m);
      assert.match(raw, /^To: ada@example\.test/m);
      assert.match(raw, /^Reply-To: SoulSync Support <support@soulsync\.test>/m);
      assert.match(raw, /^List-Unsubscribe: <https:\/\/api\.test\/unsub\?token=t>/m);
      assert.match(raw, /^List-Unsubscribe-Post: List-Unsubscribe=One-Click/m);
      assert.match(raw, /Content-Type: multipart\/alternative/i);
      assert.match(raw, /text\/plain/i);
      assert.match(raw, /text\/html/i);
    });

    it("a wrong SMTP key fails with the server's exact reply, is not retried, and the chain moves to Resend", async () => {
      const chain = smtpBrevo({ BREVO_API_KEY: "xsmtpsib-wrong-key", RESEND_API_KEY: "re_test", RESEND_BASE_URL: api.url });
      assert.deepEqual(emailProviderOrder(), ["brevo", "resend"]);
      const result = await chain.send(MESSAGE);
      assert.equal(result.provider, "resend");
      assert.equal(authAttempts, 1, "a rejected login is permanent: no retry");
      assert.equal(api.matching("POST", "/emails").length, 1);
    });

    it("reports the SMTP reply when every provider fails", async () => {
      const chain = smtpBrevo({ BREVO_API_KEY: "xsmtpsib-wrong-key" });
      assert.deepEqual(emailProviderOrder(), ["brevo"]);
      await assert.rejects(chain.send(MESSAGE), /SMTP EAUTH 535 Authentication failed/);
    });
  });

  describe("Brevo REST API: one retry, then the fallbacks", () => {
    it("retries a temporary error (503) once and stays on Brevo when the retry works", async () => {
      flaky.set("/v3/smtp/email", { status: 503, times: 1 });
      const result = await apiChain().send(MESSAGE);
      assert.equal(result.provider, "brevo");
      assert.equal(api.matching("POST", "/v3/smtp/email").length, 2, "one failure + one retry");
      assert.equal(api.matching("POST", "/emails").length, 0, "Resend was not needed");
    });

    it("retries a rate limit (429) too", async () => {
      flaky.set("/v3/smtp/email", { status: 429, times: 1 });
      assert.equal((await apiChain().send(MESSAGE)).provider, "brevo");
      assert.equal(api.matching("POST", "/v3/smtp/email").length, 2);
    });

    it("gives up after exactly one retry and falls back to Resend, then SendGrid", async () => {
      down.add("/v3/smtp/email");
      assert.equal((await apiChain().send(MESSAGE)).provider, "resend");
      assert.equal(api.matching("POST", "/v3/smtp/email").length, 2, "Brevo: first try + one retry");
      assert.equal(api.matching("POST", "/emails").length, 1, "the fallbacks are tried once");

      api.requests.length = 0;
      down.add("/emails");
      assert.equal((await apiChain().send(MESSAGE)).provider, "sendgrid");
      assert.equal(api.matching("POST", "/v3/mail/send").length, 1);
    });

    it("does not retry a permanent error (bad key → 401): it goes straight to the next provider", async () => {
      const result = await apiChain({ BREVO_API_KEY: "xkeysib-revoked-key" }).send(MESSAGE);
      assert.equal(result.provider, "resend");
      assert.equal(api.matching("POST", "/v3/smtp/email").length, 1);
    });

    it("keeps working when the primary is unreachable altogether (network error → retried once → fallback)", async () => {
      const chain = apiChain({ BREVO_BASE_URL: "http://127.0.0.1:1" });
      const result = await chain.send(MESSAGE);
      assert.equal(result.provider, "resend");
    });

    it("throws — with every provider's exact reason — only when all fail, and the message holds no secrets", async () => {
      down.add("/v3/smtp/email").add("/emails").add("/v3/mail/send");
      await assert.rejects(apiChain().send(MESSAGE), (err: Error) => {
        assert.match(err.message, /All email providers failed — brevo: HTTP 503.*\| resend: HTTP 503.*\| sendgrid: HTTP 503/);
        for (const secret of [API_KEY, "re_test", "SG.test"]) assert.ok(!err.message.includes(secret), "no key in the error");
        return true;
      });
    });

    it("a lone Brevo (no fallbacks configured) still gets its one retry", async () => {
      flaky.set("/v3/smtp/email", { status: 500, times: 1 });
      const chain = use({ EMAIL_PROVIDER: "brevo", BREVO_API_KEY: API_KEY, BREVO_BASE_URL: api.url });
      assert.deepEqual(emailProviderOrder(), ["brevo"]);
      assert.equal((await chain.send(MESSAGE)).id, "<brevo.api.1@relay.brevo.test>");
      assert.equal(api.matching("POST", "/v3/smtp/email").length, 2);
    });
  });

  describe("Reply-To", () => {
    it("is sent to every provider in that provider's own format", async () => {
      await apiChain().send(MESSAGE);
      assert.deepEqual(api.matching("POST", "/v3/smtp/email")[0]!.json.replyTo, { email: "support@soulsync.test", name: "SoulSync Support" });

      down.add("/v3/smtp/email");
      await apiChain().send(MESSAGE);
      assert.equal(api.matching("POST", "/emails")[0]!.json.reply_to, "SoulSync Support <support@soulsync.test>");

      down.add("/emails");
      await apiChain().send(MESSAGE);
      assert.deepEqual(api.matching("POST", "/v3/mail/send")[0]!.json.reply_to, { email: "support@soulsync.test", name: "SoulSync Support" });
    });

    it("is omitted when there is none", async () => {
      await apiChain().send({ ...MESSAGE, replyTo: undefined });
      assert.ok(!("replyTo" in api.matching("POST", "/v3/smtp/email")[0]!.json));
    });

    it("sendEmail() applies EMAIL_REPLY_TO and EMAIL_FROM to every message, so all emails share one sender identity", async () => {
      apiChain({ EMAIL_REPLY_TO: "Help <help@soulsync.test>", EMAIL_FROM: "SoulSync AI <hello@soulsync.test>" });
      await sendEmail({ to: "ada@example.test", subject: "s", html: "<p>h</p>", text: "t" });
      const body = api.matching("POST", "/v3/smtp/email")[0]!.json;
      assert.deepEqual(body.sender, { email: "hello@soulsync.test", name: "SoulSync AI" });
      assert.deepEqual(body.replyTo, { email: "help@soulsync.test", name: "Help" });
      config.EMAIL_FROM = "SoulSync AI <no-reply@test.local>";
    });
  });
});
