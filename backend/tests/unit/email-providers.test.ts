import "../helpers/setup-env";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import { SMTPServer } from "smtp-server";
import { env } from "../../src/config/env";
import { emailProviderOrder, getEmailProvider, setEmailProviderForTests, type EmailMessage } from "../../src/services/email/providers";
import { startFakeProvider, type FakeProvider } from "../helpers/fake-provider";

const MESSAGE: EmailMessage = {
  from: "SoulSync AI <no-reply@soulsync.test>",
  to: "ada@example.test",
  subject: "It's a match with Grace",
  html: "<p>Hello <strong>Ada</strong></p>",
  text: "Hello Ada",
  headers: { "List-Unsubscribe": "<https://api.test/unsub?token=t>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
};

const config = env as unknown as Record<string, unknown>;
const use = (values: Record<string, unknown>) => {
  Object.assign(config, { BREVO_API_KEY: undefined, RESEND_API_KEY: undefined, SENDGRID_API_KEY: undefined }, values);
  setEmailProviderForTests(undefined); // drop the memoised provider so it re-reads the config
  return getEmailProvider();
};

describe("email providers (over real HTTP / SMTP, no network)", () => {
  let api: FakeProvider;
  let mode: "ok" | "reject" | "down" = "ok";
  const down = new Set<string>(); // paths that answer 503 regardless of `mode`

  before(async () => {
    api = await startFakeProvider((req) => {
      if (down.has(req.path)) return { status: 503, body: { message: "upstream unavailable" } };
      if (req.path === "/v3/smtp/email") return { status: 201, body: { messageId: "<brevo.msg.789@relay.brevo.test>" } };
      if (mode === "reject") return { status: 422, body: { message: "The `to` field must be a valid email." } };
      if (mode === "down") return { status: 503, body: { message: "upstream unavailable" } };
      if (req.path === "/emails") return { status: 200, body: { id: "re_msg_123" } };
      if (req.path === "/v3/mail/send") return { status: 202, body: {}, headers: { "x-message-id": "sg_msg_456" } };
      return undefined;
    });
  });
  after(async () => {
    setEmailProviderForTests(undefined);
    await api.close();
  });

  describe("log", () => {
    it("is the default and delivers nothing", async () => {
      const provider = use({ EMAIL_PROVIDER: "log" });
      assert.equal(provider.name, "log");
      const result = await provider.send(MESSAGE);
      assert.match(result.id ?? "", /^log-/);
      assert.equal(api.requests.length, 0);
    });
  });

  describe("Brevo", () => {
    it("uses the transactional API shape with an api-key header and forwards List-Unsubscribe", async () => {
      mode = "ok";
      const provider = use({ EMAIL_PROVIDER: "brevo", BREVO_API_KEY: "xkeysib-test", BREVO_BASE_URL: `${api.url}/` });
      assert.equal(provider.name, "brevo");
      const result = await provider.send(MESSAGE);
      assert.equal(result.id, "<brevo.msg.789@relay.brevo.test>");

      const call = api.matching("POST", "/v3/smtp/email").at(-1)!;
      assert.equal(call.headers["api-key"], "xkeysib-test");
      assert.equal(call.headers.authorization, undefined, "Brevo does not use a bearer token");
      assert.deepEqual(call.json, {
        sender: { email: "no-reply@soulsync.test", name: "SoulSync AI" },
        to: [{ email: MESSAGE.to }],
        subject: MESSAGE.subject,
        htmlContent: MESSAGE.html,
        textContent: MESSAGE.text,
        headers: MESSAGE.headers,
      });
    });

    it("omits the headers field when there are none, and rejects when Brevo refuses", async () => {
      const provider = use({ EMAIL_PROVIDER: "brevo", BREVO_API_KEY: "xkeysib-test", BREVO_BASE_URL: api.url });
      await provider.send({ ...MESSAGE, headers: undefined });
      assert.ok(!("headers" in api.matching("POST", "/v3/smtp/email").at(-1)!.json));
      down.add("/v3/smtp/email");
      await assert.rejects(provider.send(MESSAGE), /HTTP 503/);
      down.clear();
    });
  });

  describe("fallback chain (Brevo → Resend → SendGrid)", () => {
    const all = () => use({ EMAIL_PROVIDER: "brevo", BREVO_API_KEY: "xkeysib-test", BREVO_BASE_URL: api.url, RESEND_API_KEY: "re_test_key", RESEND_BASE_URL: api.url, SENDGRID_API_KEY: "SG.test_key", SENDGRID_BASE_URL: api.url });
    const tried = () => api.requests.map((r) => r.path);
    beforeEach(() => { mode = "ok"; down.clear(); api.requests.length = 0; });

    it("stops at the primary when it works", async () => {
      const result = await all().send(MESSAGE);
      assert.equal(result.provider, "brevo");
      assert.deepEqual(tried(), ["/v3/smtp/email"]);
    });

    it("moves on to Resend when Brevo is down, and reports who delivered", async () => {
      down.add("/v3/smtp/email");
      const result = await all().send(MESSAGE);
      assert.equal(result.provider, "resend");
      assert.equal(result.id, "re_msg_123");
      assert.deepEqual(tried(), ["/v3/smtp/email", "/v3/smtp/email", "/emails"], "Brevo gets one retry, then Resend");
      assert.deepEqual(api.matching("POST", "/emails")[0]!.json.headers, MESSAGE.headers, "the unsubscribe headers survive the hop");
    });

    it("falls all the way through to SendGrid", async () => {
      down.add("/v3/smtp/email").add("/emails");
      const result = await all().send(MESSAGE);
      assert.equal(result.provider, "sendgrid");
      assert.deepEqual(tried(), ["/v3/smtp/email", "/v3/smtp/email", "/emails", "/v3/mail/send"], "Brevo: try + one retry; then each fallback once");
    });

    it("throws, naming every provider, only when all of them fail", async () => {
      down.add("/v3/smtp/email").add("/emails").add("/v3/mail/send");
      await assert.rejects(all().send(MESSAGE), /All email providers failed — brevo: HTTP 503.*resend: HTTP 503.*sendgrid: HTTP 503/);
    });

    it("only tries providers that have a key", async () => {
      use({ EMAIL_PROVIDER: "brevo", BREVO_API_KEY: "xkeysib-test", BREVO_BASE_URL: api.url, SENDGRID_API_KEY: "SG.test_key", SENDGRID_BASE_URL: api.url });
      assert.deepEqual(emailProviderOrder(), ["brevo", "sendgrid"]);
      down.add("/v3/smtp/email");
      assert.equal((await getEmailProvider().send(MESSAGE)).provider, "sendgrid");
      assert.ok(!tried().includes("/emails"), "Resend has no key, so it is skipped");
    });

    it("keeps an explicit EMAIL_PROVIDER first, with the rest as fallbacks", () => {
      use({ EMAIL_PROVIDER: "resend", BREVO_API_KEY: "xkeysib-test", RESEND_API_KEY: "re_test_key", SENDGRID_API_KEY: "SG.test_key" });
      assert.deepEqual(emailProviderOrder(), ["resend", "brevo", "sendgrid"]);
      use({ EMAIL_PROVIDER: "sendgrid", SENDGRID_API_KEY: "SG.test_key", RESEND_API_KEY: "re_test_key" });
      assert.deepEqual(emailProviderOrder(), ["sendgrid", "resend"]);
    });

    it("is a single provider (no wrapper) when only one is configured — the old behaviour", () => {
      const provider = use({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_test_key" });
      assert.equal(provider.name, "resend");
      assert.deepEqual(emailProviderOrder(), ["resend"]);
    });

    it("EMAIL_PROVIDER=log never touches the network, even with every key set", async () => {
      use({ EMAIL_PROVIDER: "log", BREVO_API_KEY: "xkeysib-test", RESEND_API_KEY: "re_test_key", SENDGRID_API_KEY: "SG.test_key" });
      const result = await getEmailProvider().send(MESSAGE);
      assert.match(result.id ?? "", /^log-/);
      assert.equal(api.requests.length, 0);
    });

    it("sendEmail() returns the delivering provider and defaults the sender", async () => {
      down.add("/v3/smtp/email");
      all();
      const { sendEmail } = await import("../../src/services/emailClient");
      const result = await sendEmail({ to: MESSAGE.to, subject: MESSAGE.subject, html: MESSAGE.html, text: MESSAGE.text });
      assert.equal(result.provider, "resend");
      assert.equal(api.matching("POST", "/emails")[0]!.json.from, env.EMAIL_FROM);
    });
  });

  describe("Resend", () => {
    it("posts the email as JSON with a bearer key", async () => {
      mode = "ok";
      const provider = use({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_test_key", RESEND_BASE_URL: `${api.url}/` });
      assert.equal(provider.name, "resend");
      const result = await provider.send(MESSAGE);
      assert.equal(result.id, "re_msg_123");

      const call = api.matching("POST", "/emails").at(-1)!;
      assert.equal(call.headers.authorization, "Bearer re_test_key");
      assert.equal(call.headers["content-type"], "application/json");
      assert.deepEqual(call.json, {
        from: MESSAGE.from, to: [MESSAGE.to], subject: MESSAGE.subject, html: MESSAGE.html, text: MESSAGE.text, headers: MESSAGE.headers,
      });
    });

    it("omits the headers field when there are none", async () => {
      const provider = use({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_test_key", RESEND_BASE_URL: api.url });
      await provider.send({ ...MESSAGE, headers: undefined });
      assert.ok(!("headers" in api.matching("POST", "/emails").at(-1)!.json));
    });

    it("rejects with the status and detail when the API refuses", async () => {
      const provider = use({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_test_key", RESEND_BASE_URL: api.url });
      mode = "reject";
      await assert.rejects(provider.send(MESSAGE), /HTTP 422.*valid email/);
      mode = "down";
      await assert.rejects(provider.send(MESSAGE), /HTTP 503/);
      mode = "ok";
    });
  });

  describe("SendGrid", () => {
    it("uses the v3 mail-send shape, splitting the display name out of From", async () => {
      const provider = use({ EMAIL_PROVIDER: "sendgrid", SENDGRID_API_KEY: "SG.test_key", SENDGRID_BASE_URL: api.url });
      assert.equal(provider.name, "sendgrid");
      const result = await provider.send(MESSAGE);
      assert.equal(result.id, "sg_msg_456", "id comes from the x-message-id header");

      const call = api.matching("POST", "/v3/mail/send").at(-1)!;
      assert.equal(call.headers.authorization, "Bearer SG.test_key");
      assert.deepEqual(call.json.personalizations, [{ to: [{ email: MESSAGE.to }] }]);
      assert.deepEqual(call.json.from, { email: "no-reply@soulsync.test", name: "SoulSync AI" });
      assert.equal(call.json.subject, MESSAGE.subject);
      assert.deepEqual(call.json.content, [{ type: "text/plain", value: "Hello Ada" }, { type: "text/html", value: MESSAGE.html }]);
      assert.deepEqual(call.json.headers, MESSAGE.headers);
    });

    it("rejects when SendGrid refuses", async () => {
      const provider = use({ EMAIL_PROVIDER: "sendgrid", SENDGRID_API_KEY: "SG.test_key", SENDGRID_BASE_URL: api.url });
      mode = "reject";
      await assert.rejects(provider.send(MESSAGE), /HTTP 422/);
      mode = "ok";
    });
  });

  describe("SMTP", () => {
    let smtp: SMTPServer;
    let port: number;
    const received: string[] = [];

    before(async () => {
      smtp = new SMTPServer({
        authOptional: true,
        disabledCommands: ["STARTTLS", "AUTH"],
        onData(stream, _session, done) {
          const chunks: Buffer[] = [];
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("end", () => {
            received.push(Buffer.concat(chunks).toString("utf8"));
            done();
          });
        },
      });
      await new Promise<void>((resolve) => smtp.listen(0, "127.0.0.1", resolve));
      port = (smtp.server.address() as AddressInfo).port;
    });
    after(() => new Promise<void>((resolve) => smtp.close(() => resolve())));

    it("delivers a multipart message with the right addressing and headers", async () => {
      const provider = use({ EMAIL_PROVIDER: "smtp", SMTP_HOST: "127.0.0.1", SMTP_PORT: port, SMTP_SECURE: false, SMTP_USER: undefined, SMTP_PASS: undefined });
      assert.equal(provider.name, "smtp");
      const result = await provider.send(MESSAGE);
      assert.ok(result.id, "message id returned");

      assert.equal(received.length, 1);
      const raw = received[0]!;
      assert.match(raw, /^From: SoulSync AI <no-reply@soulsync\.test>/m);
      assert.match(raw, /^To: ada@example\.test/m);
      assert.match(raw, /^Subject: It's a match with Grace/m);
      assert.match(raw, /^List-Unsubscribe: <https:\/\/api\.test\/unsub\?token=t>/m);
      assert.match(raw, /Content-Type: multipart\/alternative/i);
      assert.match(raw, /text\/plain/i);
      assert.match(raw, /text\/html/i);
    });

    it("fails (rather than hangs) when the server is unreachable", async () => {
      const provider = use({ EMAIL_PROVIDER: "smtp", SMTP_HOST: "127.0.0.1", SMTP_PORT: 1, SMTP_SECURE: false });
      await assert.rejects(provider.send(MESSAGE));
    });
  });
});
