import "dotenv/config";
import { z } from "zod";

// `KEY=` in a .env file arrives as "" — treat that the same as "not set".
const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);

const bool = (defaultValue: "true" | "false") =>
  z
    .enum(["true", "false"])
    .default(defaultValue)
    .transform((value) => value === "true");

const positiveInt = (defaultValue: number) => z.coerce.number().int().positive().default(defaultValue);

const envSchema = z
  .object({
    // --- core ---
    PORT: z.coerce.number().int().positive().default(5000),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    MONGODB_URI: z
      .string({ required_error: "MONGODB_URI is required" })
      .min(1, "MONGODB_URI is required"),
    JWT_SECRET: z
      .string({ required_error: "JWT_SECRET is required" })
      .min(16, "JWT_SECRET should be at least 16 characters"),
    JWT_EXPIRES_IN: z.string().default("7d"),
    CLIENT_URL: z.string().url().default("http://localhost:3000"),
    // Extra allowed browser origins (comma-separated) — e.g. Vercel preview URLs.
    CLIENT_ORIGINS: optionalString,
    // The API's own public base URL (e.g. https://api.soulsync.ai/api). Only used
    // to build the one-click List-Unsubscribe header in emails.
    API_PUBLIC_URL: optionalString,

    // --- AI (Phase 5) ---
    // When GROQ_API_KEY is set, Groq is the primary provider and Gemini (if keyed)
    // the automatic fallback — AI_PROVIDER is then only consulted for "local".
    // Otherwise "auto" picks the first provider that has an API key (claude →
    // openai → gemini); "local" (or no keys at all) uses the built-in analysis engine.
    AI_PROVIDER: z.enum(["auto", "claude", "openai", "gemini", "local"]).default("auto"),
    AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
    ANTHROPIC_API_KEY: optionalString,
    ANTHROPIC_MODEL: z.string().min(1).default("claude-opus-5"),
    ANTHROPIC_BASE_URL: optionalString,
    ANTHROPIC_REFUSAL_FALLBACK: bool("true"),
    OPENAI_API_KEY: optionalString,
    OPENAI_MODEL: z.string().min(1).default("gpt-4o-mini"),
    OPENAI_BASE_URL: optionalString,
    GEMINI_API_KEY: optionalString,
    GEMINI_MODEL: z.string().min(1).default("gemini-flash-lite-latest"),
    GEMINI_BASE_URL: optionalString,
    GROQ_API_KEY: optionalString,
    GROQ_MODEL: z.string().min(1).default("qwen/qwen3.8-27b"),
    GROQ_BASE_URL: optionalString,

    // --- production hardening (Phase 6) ---
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    // Number of reverse proxies in front of the API (Render/Railway = 1). Needed
    // so rate limiting and logs see the real client IP, not the proxy's.
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    RATE_LIMIT_DISABLED: bool("false"),
    RATE_LIMIT_GLOBAL_MAX: positiveInt(1000),
    RATE_LIMIT_AUTH_MAX: positiveInt(30),
    METRICS_TOKEN: z.preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      z.string().min(16, "METRICS_TOKEN should be at least 16 characters").optional(),
    ),
    SENTRY_DSN: optionalString,
    SENTRY_ENVIRONMENT: optionalString,
    ADMIN_EMAILS: optionalString,
    JOBS_ENABLED: bool("true"),
    CRON_SECRET: z.preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      z.string().min(16, "CRON_SECRET should be at least 16 characters").optional(),
    ),
    // Comma-separated feature-flag overrides: "billing=true,ai_deep_analysis=false".
    // A flag saved from the admin dashboard wins over this.
    FEATURE_FLAGS: optionalString,

    // --- email ---
    // brevo / resend / sendgrid form a fallback chain (services/emailClient.ts);
    // the one named here is tried first. "smtp" and "log" stand alone.
    EMAIL_PROVIDER: z.enum(["log", "brevo", "resend", "sendgrid", "smtp"]).default("log"),
    // The one sender identity every email goes out under — it must be a sender/domain verified with the provider.
    // There is deliberately NO default and no fallback sender anywhere in the code: it is required for every
    // provider except "log" (which delivers nothing).
    EMAIL_FROM: optionalString,
    // Optional Reply-To, so replies reach a monitored mailbox even though EMAIL_FROM is usually a no-reply address.
    EMAIL_REPLY_TO: optionalString,
    // Brevo: an API key (xkeysib-…) uses Brevo's REST API; an SMTP key (xsmtpsib-…) together with SMTP_USER
    // (the SMTP login) uses Brevo's SMTP relay (SMTP_HOST defaults to smtp-relay.brevo.com).
    BREVO_API_KEY: optionalString,
    BREVO_BASE_URL: optionalString,
    RESEND_API_KEY: optionalString,
    RESEND_BASE_URL: optionalString,
    SENDGRID_API_KEY: optionalString,
    SENDGRID_BASE_URL: optionalString,
    SMTP_HOST: optionalString,
    SMTP_PORT: positiveInt(587),
    SMTP_SECURE: bool("false"),
    SMTP_USER: optionalString,
    SMTP_PASS: optionalString,

    // --- payments ---
    // none = billing UI shows "coming soon"; mock = sandbox checkout (dev/test only).
    PAYMENT_PROVIDER: z.enum(["none", "mock", "stripe", "razorpay"]).default("none"),
    STRIPE_SECRET_KEY: optionalString,
    STRIPE_WEBHOOK_SECRET: optionalString,
    STRIPE_API_HOST: optionalString,
    STRIPE_API_PORT: optionalString,
    STRIPE_API_PROTOCOL: z.enum(["http", "https"]).optional(),
    STRIPE_PRICE_PREMIUM_MONTHLY: optionalString,
    STRIPE_PRICE_PREMIUM_YEARLY: optionalString,
    STRIPE_PRICE_PLUS_MONTHLY: optionalString,
    STRIPE_PRICE_PLUS_YEARLY: optionalString,
    RAZORPAY_KEY_ID: optionalString,
    RAZORPAY_KEY_SECRET: optionalString,
    RAZORPAY_WEBHOOK_SECRET: optionalString,
    RAZORPAY_BASE_URL: optionalString,
    RAZORPAY_PLAN_PREMIUM_MONTHLY: optionalString,
    RAZORPAY_PLAN_PREMIUM_YEARLY: optionalString,
    RAZORPAY_PLAN_PLUS_MONTHLY: optionalString,
    RAZORPAY_PLAN_PLUS_YEARLY: optionalString,

    // --- storage (Cloudinary-ready) ---
    CLOUDINARY_CLOUD_NAME: optionalString,
    CLOUDINARY_API_KEY: optionalString,
    CLOUDINARY_API_SECRET: optionalString,
    CLOUDINARY_UPLOAD_FOLDER: z.string().min(1).default("soulsync/profiles"),
    CLOUDINARY_API_BASE: optionalString, // test doubles only
    // Free fallback when Cloudinary isn't configured: photos are re-encoded and stored on this
    // server's disk. "auto" = on outside production only (a production disk is usually ephemeral).
    LOCAL_UPLOADS: z.enum(["auto", "on", "off"]).default("auto"),
    UPLOAD_DIR: optionalString,
  })
  .superRefine((data, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

    // AI
    const aiKey = { claude: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY", gemini: "GEMINI_API_KEY" } as const;
    if (data.AI_PROVIDER in aiKey) {
      const keyName = aiKey[data.AI_PROVIDER as keyof typeof aiKey];
      if (!data[keyName]) issue(keyName, `${keyName} is required when AI_PROVIDER=${data.AI_PROVIDER}`);
    }

    // Email — a provider without its credentials would silently drop every email.
    if (data.EMAIL_PROVIDER === "brevo") {
      const isSmtpKey = data.BREVO_API_KEY?.startsWith("xsmtpsib-") ?? false;
      const apiKey = Boolean(data.BREVO_API_KEY) && !isSmtpKey;
      const smtpLogin = Boolean(data.SMTP_USER) && Boolean(data.SMTP_PASS || isSmtpKey);
      if (!apiKey && !smtpLogin) {
        issue(
          "BREVO_API_KEY",
          isSmtpKey
            ? "BREVO_API_KEY holds an SMTP key (xsmtpsib-…): set SMTP_USER to your Brevo SMTP login to send through the SMTP relay, or put a Brevo API key (xkeysib-…) in BREVO_API_KEY"
            : "EMAIL_PROVIDER=brevo needs BREVO_API_KEY (an API key, xkeysib-…) or SMTP_USER + SMTP_PASS (the Brevo SMTP login and SMTP key)",
        );
      }
    }
    if (data.EMAIL_PROVIDER !== "log" && !data.EMAIL_FROM) {
      issue("EMAIL_FROM", `EMAIL_FROM is required when EMAIL_PROVIDER=${data.EMAIL_PROVIDER}: set it to the sender address you verified with your provider, e.g. EMAIL_FROM="SoulSync AI <you@yourdomain.com>"`);
    }
    if (data.EMAIL_FROM && !/^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(data.EMAIL_FROM.match(/<([^>]+)>\s*$/)?.[1] ?? data.EMAIL_FROM.trim())) {
      issue("EMAIL_FROM", "EMAIL_FROM must be an email address, optionally with a display name: Name <address@domain>");
    }
    if (data.EMAIL_PROVIDER === "resend" && !data.RESEND_API_KEY) {
      issue("RESEND_API_KEY", "RESEND_API_KEY is required when EMAIL_PROVIDER=resend");
    }
    if (data.EMAIL_PROVIDER === "sendgrid" && !data.SENDGRID_API_KEY) {
      issue("SENDGRID_API_KEY", "SENDGRID_API_KEY is required when EMAIL_PROVIDER=sendgrid");
    }
    if (data.EMAIL_PROVIDER === "smtp" && !data.SMTP_HOST) {
      issue("SMTP_HOST", "SMTP_HOST is required when EMAIL_PROVIDER=smtp");
    }

    // Payments
    if (data.PAYMENT_PROVIDER === "stripe") {
      if (!data.STRIPE_SECRET_KEY) issue("STRIPE_SECRET_KEY", "STRIPE_SECRET_KEY is required when PAYMENT_PROVIDER=stripe");
      if (!data.STRIPE_WEBHOOK_SECRET) issue("STRIPE_WEBHOOK_SECRET", "STRIPE_WEBHOOK_SECRET is required when PAYMENT_PROVIDER=stripe");
    }
    if (data.PAYMENT_PROVIDER === "razorpay") {
      for (const key of ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"] as const) {
        if (!data[key]) issue(key, `${key} is required when PAYMENT_PROVIDER=razorpay`);
      }
    }

    // Production-only guards: things that are fine on a laptop and dangerous live.
    if (data.NODE_ENV === "production") {
      if (data.JWT_SECRET.length < 32) issue("JWT_SECRET", "JWT_SECRET must be at least 32 characters in production");
      if (!data.CLIENT_URL.startsWith("https://")) issue("CLIENT_URL", "CLIENT_URL must be an https:// URL in production");
      if (data.PAYMENT_PROVIDER === "mock") issue("PAYMENT_PROVIDER", "PAYMENT_PROVIDER=mock is not allowed in production");
      if (data.RATE_LIMIT_DISABLED) issue("RATE_LIMIT_DISABLED", "Rate limiting cannot be disabled in production");
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error("Missing or invalid environment variables. Check backend/.env against backend/.env.example.");
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

const csv = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

/** Browser origins allowed by CORS and Socket.IO. */
export const allowedOrigins: string[] = [
  ...new Set([env.CLIENT_URL.replace(/\/$/, ""), ...csv(env.CLIENT_ORIGINS).map((o) => o.replace(/\/$/, ""))]),
];

/** Emails auto-promoted to admin (case-insensitive). */
export const adminEmails: string[] = csv(env.ADMIN_EMAILS).map((email) => email.toLowerCase());

/** Base URL for links inside emails. */
export const appUrl: string = env.CLIENT_URL.replace(/\/$/, "");

/**
 * Non-fatal launch concerns, printed at startup and by `npm run check:env`.
 * Only meaningful in production, where each of these is a real gap.
 */
export function getEnvWarnings(): string[] {
  if (!isProduction) return [];
  const warnings: string[] = [];
  if (env.EMAIL_PROVIDER === "log") warnings.push("EMAIL_PROVIDER=log — emails are logged, not delivered (set brevo, resend, sendgrid or smtp).");
  if (env.EMAIL_PROVIDER !== "log" && !env.API_PUBLIC_URL) warnings.push("API_PUBLIC_URL is not set — emails go out without the List-Unsubscribe header (Gmail/Yahoo expect it; set it to https://<your-api-host>/api).");
  if (env.AI_PROVIDER !== "local" && !env.GROQ_API_KEY) warnings.push("GROQ_API_KEY is not set — no primary AI provider (Groq); AI uses the other configured provider or the built-in engine.");
  if (env.EMAIL_PROVIDER !== "smtp" && !env.BREVO_API_KEY) warnings.push("BREVO_API_KEY is not set — no primary email provider (Brevo); mail relies on Resend/SendGrid alone.");
  if (env.PAYMENT_PROVIDER === "none") warnings.push("PAYMENT_PROVIDER=none — Premium checkout is unavailable.");
  if (!env.METRICS_TOKEN) warnings.push("METRICS_TOKEN is not set — /api/metrics is disabled.");
  if (!env.SENTRY_DSN) warnings.push("SENTRY_DSN is not set — errors are logged but not sent to an error tracker.");
  if (adminEmails.length === 0) warnings.push("ADMIN_EMAILS is empty — no one can access /admin until you promote an admin.");
  if (env.TRUST_PROXY === 0) warnings.push("TRUST_PROXY=0 — behind Render/Railway set TRUST_PROXY=1 so rate limits use real client IPs.");
  if (!env.CRON_SECRET && env.JOBS_ENABLED === false) warnings.push("JOBS_ENABLED=false and no CRON_SECRET — scheduled jobs (expiry, weekly report) will never run.");
  const cloudinary = Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
  if (!cloudinary && env.LOCAL_UPLOADS !== "on") warnings.push("Cloudinary is not configured — profile photo uploads are unavailable (members can still paste an image link).");
  if (!cloudinary && env.LOCAL_UPLOADS === "on") warnings.push("LOCAL_UPLOADS=on — photos are stored on this server's disk, which most hosts wipe on every deploy. Use Cloudinary for production.");
  return warnings;
}
