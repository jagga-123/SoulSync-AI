import "../helpers/setup-env";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { SMTPServer } from "smtp-server";
import { startHarness, type Harness, type TestUser } from "../helpers/harness";

const LOGIN = "smtp-login-test@smtp-brevo.test";
const KEY = "xsmtpsib-test-smtp-key-0123456789abcdef";
const FROM = "SoulSync AI <hello@soulsync.test>";
const REPLY_TO = "support@soulsync.test";
const API_PUBLIC_URL = "https://api.soulsync.test/api";

interface Received { user?: string; raw: string; body: string; headers: Record<string, string> }

/** Quoted-printable → text (nodemailer wraps long HTML lines, which would otherwise split the links). */
const decodeQp = (value: string) => value.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));

/**
 * The real application over the real SMTP transport (nodemailer → a local SMTP server that requires a login), for
 * every email flow: verification, welcome, match, message and the weekly report; then the health endpoint and how
 * the app behaves when SMTP is down. Only the server at the far end is local.
 */
describe("email over SMTP: flows, health endpoint and graceful failure", () => {
  let h: Harness;
  let smtp: SMTPServer;
  let smtpPort: number;
  let admin: TestUser;
  let connections = 0;
  const received: Received[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let config: Record<string, any>;
  let resetHealth: () => void;

  const to = (email: string, pattern: RegExp) => received.filter((m) => new RegExp(email.replace(/[.+]/g, "\\$&"), "i").test(m.headers.to ?? "") && pattern.test(m.headers.subject ?? ""));
  const only = (list: Received[]) => {
    assert.equal(list.length, 1, `expected exactly one email, got ${list.map((m) => m.headers.subject).join(" | ") || "none"}`);
    return list[0]!;
  };

  before(async () => {
    smtp = new SMTPServer({
      authOptional: false,
      allowInsecureAuth: true,
      disabledCommands: ["STARTTLS"],
      onConnect(_session, callback) {
        connections++;
        callback();
      },
      onAuth(auth, _session, callback) {
        if (auth.username === LOGIN && auth.password === KEY) return callback(null, { user: auth.username });
        callback(Object.assign(new Error("Authentication failed"), { responseCode: 535 }));
      },
      onData(stream, session, done) {
        const chunks: Buffer[] = [];
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          const [head = "", ...rest] = raw.split(/\r?\n\r?\n/);
          const headers: Record<string, string> = {};
          for (const line of head.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
            const at = line.indexOf(":");
            if (at > 0) headers[line.slice(0, at).toLowerCase()] = line.slice(at + 1).trim();
          }
          received.push({ user: session.user as string | undefined, raw, body: rest.join("\n\n"), headers });
          done();
        });
      },
    });
    await new Promise<void>((resolve) => smtp.listen(0, "127.0.0.1", resolve));
    smtpPort = (smtp.server.address() as AddressInfo).port;

    h = await startHarness({
      env: { EMAIL_PROVIDER: "smtp", SMTP_HOST: "127.0.0.1", SMTP_PORT: String(smtpPort), SMTP_SECURE: "false", SMTP_USER: LOGIN, SMTP_PASS: KEY, EMAIL_FROM: FROM, EMAIL_REPLY_TO: REPLY_TO, API_PUBLIC_URL },
    });
    // The harness captures email by default; here the REAL SMTP provider (read from the config above) must run.
    const providers = await h.load("../../src/services/email/providers");
    providers.setEmailProviderForTests(undefined);
    providers.retryPolicy.delayMs = 5;
    config = (await h.load("../../src/config/env")).env;
    resetHealth = (await h.load("../../src/services/email/health")).resetEmailHealthCache;
    admin = await h.makeAdmin(await h.createUser({ name: "Smtp Admin" }));
  });
  after(async () => {
    await h.stop();
    await new Promise<void>((resolve) => smtp.close(() => resolve()));
  });

  describe("every flow is delivered through the SMTP relay", () => {
    let vera: TestUser; // a brand-new, still unverified member: gets the verification + welcome emails
    let ada: TestUser;
    let ben: TestUser;

    before(async () => {
      vera = await h.createUser({ name: "Vera Verify" });
      ada = await h.createUser({ name: "Ada Lovelace", profile: true, verified: true });
      ben = await h.createUser({ name: "Ben Franklin", profile: true, verified: true });
      const { matchId } = await h.makeMatch(ada, ben);
      const conversationId = (await h.api.post(`/conversations/start/${matchId}`, undefined, { token: ada.token })).body.data.conversation.id;
      await h.api.post("/messages/send", { conversationId, content: "Hello Ben, lovely to match with you!" }, { token: ada.token });
      const { runWeeklyReports } = await h.load("../../src/services/weekly-report.service");
      await runWeeklyReports({ force: true });
      await h.settle();
    });

    const flows: Array<[string, () => Received, boolean]> = [
      ["email verification", () => only(to(vera.email, /verify your email/i)), false],
      ["welcome email", () => only(to(vera.email, /^welcome to soulsync/i)), false],
      ["match notification", () => only(to(ada.email, /match with Ben/i)), true],
      ["message notification", () => only(to(ben.email, /new message from Ada/i)), true],
      ["weekly report", () => only(to(ada.email, /week/i)), true],
    ];

    for (const [label, find, isNotification] of flows) {
      it(`${label}: logs in, sends as EMAIL_FROM with Reply-To, HTML + plain text${isNotification ? ", and the one-click unsubscribe header" : ""}`, () => {
        const mail = find();
        assert.equal(mail.user, LOGIN, "authenticated with the SMTP login");
        assert.match(mail.headers.from ?? "", /SoulSync AI <hello@soulsync\.test>/);
        assert.match(mail.headers["reply-to"] ?? "", /support@soulsync\.test/);
        assert.match(mail.headers["content-type"] ?? "", /multipart\/alternative/i);
        assert.match(mail.body, /Content-Type: text\/plain/i);
        assert.match(mail.body, /Content-Type: text\/html/i);
        if (isNotification) {
          assert.match(mail.headers["list-unsubscribe"] ?? "", /^<https:\/\/api\.soulsync\.test\/api\/account\/unsubscribe\?token=[^>]+>$/);
          assert.equal(mail.headers["list-unsubscribe-post"], "List-Unsubscribe=One-Click");
        } else {
          assert.equal(mail.headers["list-unsubscribe"], undefined);
        }
      });
    }

    it("the link inside the verification email verifies the account (register → email → verify, end to end)", async () => {
      const user = await h.createUser({ name: "Link Lena" });
      const mail = only(to(user.email, /verify your email/i));
      const link = /https?:\/\/[^\s"'<>]*verify-email\?token=[0-9a-f]{24}\.[0-9a-f]{64}/.exec(decodeQp(mail.body))?.[0];
      assert.ok(link, "the emailed link survives the SMTP encoding intact");
      assert.equal((await h.api.get("/auth/me", { token: user.token })).body.data.user.emailVerified, false);
      assert.equal((await h.api.post("/account/verify-email", { token: new URL(link).searchParams.get("token") })).status, 200);
      assert.equal((await h.api.get("/auth/me", { token: user.token })).body.data.user.emailVerified, true);
    });

    it("every email of the run used the one sender identity", () => {
      assert.ok(received.length >= 8, `${received.length} emails`);
      for (const mail of received) assert.match(mail.headers.from ?? "", /hello@soulsync\.test/, mail.headers.subject);
    });
  });

  describe("GET /api/email/health", () => {
    const health = () => h.api.get("/email/health");

    it("reports a working SMTP connection, the provider and the sender — and nothing secret", async () => {
      resetHealth();
      const res = await health();
      assert.equal(res.status, 200);
      assert.deepEqual(
        { smtpConnected: res.body.data.smtpConnected, provider: res.body.data.provider, activeSender: res.body.data.activeSender, replyTo: res.body.data.replyTo, senderConfigured: res.body.data.senderConfigured, readyForProduction: res.body.data.readyForProduction, status: res.body.data.status },
        { smtpConnected: true, provider: "smtp", activeSender: FROM, replyTo: REPLY_TO, senderConfigured: true, readyForProduction: true, status: "ok" },
      );
      const text = JSON.stringify(res.body);
      // The sender and Reply-To are public anyway (they are in every email's headers); the login, key and server are not.
      for (const secret of [KEY, LOGIN, "127.0.0.1", String(smtpPort)]) assert.ok(!text.includes(secret), `leaked ${secret}`);
    });

    it("reports exactly the EMAIL_FROM / EMAIL_REPLY_TO of the environment as the active sender", async () => {
      config.EMAIL_FROM = "SoulSync AI <someone@sender.test>";
      config.EMAIL_REPLY_TO = "help@sender.test";
      resetHealth();
      try {
        const res = await health();
        assert.equal(res.body.data.activeSender, "SoulSync AI <someone@sender.test>");
        assert.equal(res.body.data.replyTo, "help@sender.test");
        const { describeActiveSender } = await h.load("../../src/services/email/health");
        assert.equal(describeActiveSender(), "Active sender: SoulSync AI <someone@sender.test>");
      } finally {
        config.EMAIL_FROM = FROM;
        config.EMAIL_REPLY_TO = REPLY_TO;
        resetHealth();
      }
    });

    it("answers from a 30-second cache, so the endpoint can't be used to hammer the mail server", async () => {
      resetHealth();
      const before = connections;
      await Promise.all([health(), health(), health()]);
      await health();
      assert.equal(connections - before, 1, "one SMTP handshake for four requests");
    });

    it("is not 'ready for production' with a free-mail sender, and says why", async () => {
      const original = process.env.EMAIL_FROM;
      config.EMAIL_FROM = "SoulSync AI <someone@gmail.com>";
      resetHealth();
      try {
        const res = await health();
        assert.equal(res.body.data.smtpConnected, true);
        assert.equal(res.body.data.senderConfigured, true);
        assert.equal(res.body.data.readyForProduction, false);
        assert.ok(res.body.data.warnings.some((w: string) => /free-mail/.test(w)));
      } finally {
        config.EMAIL_FROM = FROM;
        process.env.EMAIL_FROM = original;
        resetHealth();
      }
    });

    it("says the sender is not configured when EMAIL_FROM is unset — there is no fallback address", async () => {
      config.EMAIL_FROM = undefined;
      resetHealth();
      try {
        const res = await health();
        assert.equal(res.body.data.activeSender, null);
        assert.equal(res.body.data.senderConfigured, false);
        assert.equal(res.body.data.readyForProduction, false);
        const { describeActiveSender } = await h.load("../../src/services/email/health");
        assert.match(describeActiveSender(), /^Active sender: \(none/);
      } finally {
        config.EMAIL_FROM = FROM;
        resetHealth();
      }
    });

    it("answers 503 with smtpConnected=false when the login is refused", async () => {
      config.SMTP_PASS = "xsmtpsib-wrong-key";
      resetHealth();
      try {
        const res = await health();
        assert.equal(res.status, 503);
        assert.equal(res.body.data.smtpConnected, false);
        assert.equal(res.body.data.status, "smtp_auth_failed");
        assert.equal(res.body.data.readyForProduction, false);
        assert.ok(!JSON.stringify(res.body).includes("xsmtpsib-wrong-key"));
      } finally {
        config.SMTP_PASS = KEY;
        resetHealth();
      }
    });

    it("answers 503 (not a hang, not a crash) when the SMTP server is unreachable", async () => {
      config.SMTP_PORT = 1;
      resetHealth();
      try {
        const started = Date.now();
        const res = await health();
        assert.equal(res.status, 503);
        assert.equal(res.body.data.status, "smtp_unreachable");
        assert.ok(Date.now() - started < 12_000);
      } finally {
        config.SMTP_PORT = smtpPort;
        resetHealth();
      }
    });

    it("has nothing to check with EMAIL_PROVIDER=log, and stays a 200", async () => {
      config.EMAIL_PROVIDER = "log";
      resetHealth();
      try {
        const res = await health();
        assert.equal(res.status, 200);
        assert.equal(res.body.data.status, "log_provider");
        assert.equal(res.body.data.smtpConnected, false);
        assert.equal(res.body.data.readyForProduction, false);
      } finally {
        config.EMAIL_PROVIDER = "smtp";
        resetHealth();
      }
    });
  });

  describe("when SMTP is unavailable", () => {
    it("the startup check logs and returns instead of throwing", async () => {
      const { verifyEmailOnStartup } = await h.load("../../src/services/email/health");
      config.SMTP_PORT = 1;
      try {
        await assert.doesNotReject(verifyEmailOnStartup());
      } finally {
        config.SMTP_PORT = smtpPort;
        resetHealth();
      }
    });

    it("a sign-up still succeeds, the app keeps serving, and the failed email is recorded with the exact reason", async () => {
      config.SMTP_PORT = 1;
      const providers = await h.load("../../src/services/email/providers");
      providers.setEmailProviderForTests(undefined);
      try {
        const email = `smtp-down.${Date.now()}@test.local`;
        const registered = await h.api.post("/auth/register", { fullName: "Down Dan", email, password: "Passw0rd!23" });
        assert.equal(registered.status, 201, "registration is not blocked by the mail outage");
        await h.settle();
        assert.equal((await h.api.get("/health/ready")).status, 200, "the app is alive");

        const failed = (await h.api.get("/admin/email-log?status=failed&limit=100", { token: admin.token })).body.data.entries.filter((e: { to: string }) => e.to === email);
        assert.deepEqual(failed.map((e: { template: string }) => e.template).sort(), ["verify-email", "welcome"]);
        assert.match(failed[0].error, /SMTP .*(ECONNECTION|ECONNREFUSED)/);
        assert.equal(failed[0].provider, "smtp");
      } finally {
        config.SMTP_PORT = smtpPort;
        providers.setEmailProviderForTests(undefined);
      }
    });

    it("recovers by itself once SMTP is back", async () => {
      const user = await h.createUser({ name: "Back Bea" });
      await h.settle();
      assert.equal(only(to(user.email, /verify your email/i)).user, LOGIN);
    });
  });
});
