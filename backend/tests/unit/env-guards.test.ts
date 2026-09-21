import "../helpers/setup-env";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { describe, it } from "node:test";

const BACKEND = resolve(__dirname, "../..");
const TSX = resolve(BACKEND, "node_modules/tsx/dist/cli.mjs");

/** A complete, valid production configuration; each test breaks exactly one thing. */
const PRODUCTION: Record<string, string> = {
  NODE_ENV: "production",
  MONGODB_URI: "mongodb+srv://user:pass@cluster.example.mongodb.net/soulsync",
  JWT_SECRET: "a-production-grade-secret-of-at-least-32-chars!",
  CLIENT_URL: "https://soulsync.example.com",
  CLIENT_ORIGINS: "",
  RATE_LIMIT_DISABLED: "false",
  PAYMENT_PROVIDER: "none",
  EMAIL_PROVIDER: "log",
  AI_PROVIDER: "local",
  TRUST_PROXY: "1",
  ADMIN_EMAILS: "founder@example.com",
  METRICS_TOKEN: "",
  CRON_SECRET: "",
  SENTRY_DSN: "",
  LOG_LEVEL: "silent",
};

interface Outcome { code: number | null; out: string }

/** Runs `scripts/check-env.ts` (the same validation the server does at boot) in a clean child process. */
function checkEnv(overrides: Record<string, string> = {}, base: Record<string, string> = PRODUCTION): Promise<Outcome> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [TSX, "scripts/check-env.ts"], { cwd: BACKEND, env: { ...process.env, ...base, ...overrides } });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => (out += chunk));
    child.stderr.on("data", (chunk: Buffer) => (out += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolveRun({ code, out }));
  });
}

describe("environment validation (the boot-time guards)", () => {
  it("accepts a complete production configuration and lists only launch warnings", async () => {
    const { code, out } = await checkEnv();
    assert.equal(code, 0, out);
    assert.match(out, /Environment: production\s+\(production guards active\)/);
    assert.match(out, /launch warnings?:/);
    assert.match(out, /EMAIL_PROVIDER=log/);
    assert.match(out, /METRICS_TOKEN is not set/);
    assert.match(out, /SENTRY_DSN is not set/);
    assert.match(out, /PAYMENT_PROVIDER=none/);
  });

  it("never prints secret values", async () => {
    const { out } = await checkEnv({ SENTRY_DSN: "https://secretkey123@o1.ingest.sentry.io/99", METRICS_TOKEN: "metrics-secret-token-abcdefgh", CRON_SECRET: "cron-secret-abcdefghijkl" });
    for (const secret of [PRODUCTION.JWT_SECRET, "secretkey123", "metrics-secret-token-abcdefgh", "cron-secret-abcdefghijkl", "user:pass"]) {
      assert.ok(!out.includes(secret as string), `leaked ${String(secret).slice(0, 8)}…`);
    }
  });

  it("reports no warnings once everything recommended is configured", async () => {
    const { code, out } = await checkEnv({
      EMAIL_PROVIDER: "brevo", BREVO_API_KEY: "xkeysib-live", RESEND_API_KEY: "re_live_key", GROQ_API_KEY: "gsk_live", GEMINI_API_KEY: "AQ.live", AI_PROVIDER: "auto", PAYMENT_PROVIDER: "stripe", STRIPE_SECRET_KEY: "sk_live_x", STRIPE_WEBHOOK_SECRET: "whsec_x",
      METRICS_TOKEN: "metrics-token-abcdefghijk", SENTRY_DSN: "https://k@o1.ingest.sentry.io/1", CRON_SECRET: "cron-secret-abcdefghijkl",
      CLOUDINARY_CLOUD_NAME: "c", CLOUDINARY_API_KEY: "k", CLOUDINARY_API_SECRET: "s",
      EMAIL_FROM: "SoulSync AI <hello@soulsync.example.com>", API_PUBLIC_URL: "https://api.soulsync.example.com/api",
    });
    assert.equal(code, 0, out);
    assert.match(out, /No launch warnings/);
  });

  it("accepts Brevo through its SMTP relay (SMTP key + SMTP login) and shows it as the primary provider", async () => {
    const { code, out } = await checkEnv({ EMAIL_PROVIDER: "brevo", BREVO_API_KEY: "xsmtpsib-secret-smtp-key", SMTP_USER: "9a1b2c001@smtp-brevo.com" });
    assert.equal(code, 0, out);
    assert.match(out, /Email provider:\s+brevo/);
    assert.ok(!out.includes("xsmtpsib-secret-smtp-key"), "the SMTP key is never printed");
  });

  it("warns about a missing API_PUBLIC_URL once a real email provider is on", async () => {
    const { code, out } = await checkEnv({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_live_key", API_PUBLIC_URL: "" });
    assert.equal(code, 0, out);
    assert.match(out, /API_PUBLIC_URL is not set/);
  });

  it("has NO fallback sender: EMAIL_FROM is required for every provider that really sends, but not for 'log'", async () => {
    for (const provider of [{ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_live_key" }, { EMAIL_PROVIDER: "sendgrid", SENDGRID_API_KEY: "SG.live" }, { EMAIL_PROVIDER: "smtp", SMTP_HOST: "smtp.example.test" }, { EMAIL_PROVIDER: "brevo", BREVO_API_KEY: "xkeysib-live" }]) {
      const refused = await checkEnv({ ...provider, EMAIL_FROM: "" });
      assert.notEqual(refused.code, 0, `${provider.EMAIL_PROVIDER} without EMAIL_FROM must be refused`);
      assert.match(refused.out, /EMAIL_FROM is required when EMAIL_PROVIDER=/);
    }
    const log = await checkEnv({ EMAIL_PROVIDER: "log", EMAIL_FROM: "" });
    assert.equal(log.code, 0, log.out);
  });

  it("no longer knows any built-in sender address — an unset EMAIL_FROM is an error, never quietly replaced", async () => {
    const { out } = await checkEnv({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_live_key", EMAIL_FROM: "" });
    assert.ok(!/no-?reply@soulsync\.ai|placeholder/i.test(out), out);
  });

  it("warns — without failing — when the recommended Groq and Brevo keys are missing", async () => {
    const { code, out } = await checkEnv({ AI_PROVIDER: "auto", GROQ_API_KEY: "", GEMINI_API_KEY: "", BREVO_API_KEY: "", EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_live_key" });
    assert.equal(code, 0, out);
    assert.match(out, /GROQ_API_KEY is not set/);
    assert.match(out, /BREVO_API_KEY is not set/);
  });

  it("stops warning about Groq once it is set, and never asks for it when AI is deliberately local", async () => {
    const withKey = await checkEnv({ AI_PROVIDER: "auto", GROQ_API_KEY: "gsk_live" });
    assert.doesNotMatch(withKey.out, /GROQ_API_KEY is not set/);
    assert.match(withKey.out, /AI provider:\s+groq/);
    const local = await checkEnv({ AI_PROVIDER: "local", GROQ_API_KEY: "" });
    assert.doesNotMatch(local.out, /GROQ_API_KEY is not set/);
  });

  it("shows the fallback order of both chains and never prints the keys", async () => {
    const secrets = ["xkeysib-secret-value", "re_secret_value", "SG.secret_value", "gsk_secret_value", "AQ.secret_value"];
    const { code, out } = await checkEnv({
      EMAIL_PROVIDER: "brevo", BREVO_API_KEY: secrets[0]!, RESEND_API_KEY: secrets[1]!, SENDGRID_API_KEY: secrets[2]!,
      AI_PROVIDER: "auto", GROQ_API_KEY: secrets[3]!, GEMINI_API_KEY: secrets[4]!,
    });
    assert.equal(code, 0, out);
    assert.match(out, /Email provider:\s+brevo → resend → sendgrid/);
    assert.match(out, /AI provider:\s+groq → gemini/);
    for (const secret of secrets) assert.ok(!out.includes(secret), "a key was printed");
  });

  const REFUSED: Array<[string, Record<string, string>, RegExp]> = [
    ["a short JWT secret in production", { JWT_SECRET: "short-secret" }, /JWT_SECRET/],
    ["a plain-http CLIENT_URL in production", { CLIENT_URL: "http://soulsync.example.com" }, /CLIENT_URL/],
    ["the sandbox payment provider in production", { PAYMENT_PROVIDER: "mock" }, /PAYMENT_PROVIDER/],
    ["disabled rate limiting in production", { RATE_LIMIT_DISABLED: "true" }, /RATE_LIMIT_DISABLED/],
    ["Stripe without its secret key", { PAYMENT_PROVIDER: "stripe", STRIPE_SECRET_KEY: "", STRIPE_WEBHOOK_SECRET: "whsec_x" }, /STRIPE_SECRET_KEY/],
    ["Stripe without its webhook secret", { PAYMENT_PROVIDER: "stripe", STRIPE_SECRET_KEY: "sk_live_x", STRIPE_WEBHOOK_SECRET: "" }, /STRIPE_WEBHOOK_SECRET/],
    ["Razorpay without its credentials", { PAYMENT_PROVIDER: "razorpay", RAZORPAY_KEY_ID: "", RAZORPAY_KEY_SECRET: "", RAZORPAY_WEBHOOK_SECRET: "" }, /RAZORPAY_KEY_ID/],
    ["Brevo without an API key", { EMAIL_PROVIDER: "brevo", BREVO_API_KEY: "" }, /BREVO_API_KEY/],
    ["Brevo SMTP key without the SMTP login", { EMAIL_PROVIDER: "brevo", BREVO_API_KEY: "xsmtpsib-abc", SMTP_USER: "", SMTP_PASS: "" }, /SMTP_USER/],
    ["an EMAIL_FROM that is not an email address", { EMAIL_FROM: "SoulSync AI, no address" }, /EMAIL_FROM/],
    ["Resend without an API key", { EMAIL_PROVIDER: "resend", RESEND_API_KEY: "" }, /RESEND_API_KEY/],
    ["SendGrid without an API key", { EMAIL_PROVIDER: "sendgrid", SENDGRID_API_KEY: "" }, /SENDGRID_API_KEY/],
    ["SMTP without a host", { EMAIL_PROVIDER: "smtp", SMTP_HOST: "" }, /SMTP_HOST/],
    ["Claude selected without its key", { AI_PROVIDER: "claude", ANTHROPIC_API_KEY: "" }, /ANTHROPIC_API_KEY/],
    ["OpenAI selected without its key", { AI_PROVIDER: "openai", OPENAI_API_KEY: "" }, /OPENAI_API_KEY/],
    ["a too-short metrics token", { METRICS_TOKEN: "tooshort" }, /METRICS_TOKEN/],
    ["an unknown email provider", { EMAIL_PROVIDER: "carrier-pigeon" }, /EMAIL_PROVIDER/],
  ];

  // These spawn a process each; run them together.
  it("refuses to boot with misconfigurations that would silently break or endanger production", async () => {
    const results = await Promise.all(REFUSED.map(async ([label, overrides, pattern]) => ({ label, pattern, ...(await checkEnv(overrides)) })));
    for (const { label, pattern, code, out } of results) {
      assert.notEqual(code, 0, `${label} should fail validation`);
      assert.match(out, pattern, `${label}: the error names the setting`);
    }
  });

  it("allows the same 'unsafe' settings outside production, where they're normal for development", async () => {
    const dev = { ...PRODUCTION, NODE_ENV: "development", JWT_SECRET: "dev-secret-16-chars", CLIENT_URL: "http://localhost:3000", PAYMENT_PROVIDER: "mock", RATE_LIMIT_DISABLED: "true" };
    const { code, out } = await checkEnv({}, dev);
    assert.equal(code, 0, out);
    assert.match(out, /Environment: development/);
    assert.doesNotMatch(out, /production guards active/);
  });
});
