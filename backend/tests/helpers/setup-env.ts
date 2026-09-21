/**
 * Import this FIRST in every test file. It gives the process a hermetic,
 * safe environment *before* any application module reads `process.env`
 * (config/env.ts also loads backend/.env via dotenv, which never overrides a
 * variable that's already set — so pinning everything here guarantees a test
 * can never touch your real database, call a real AI provider, send real
 * email, or charge a real card, whatever is in your local .env).
 */
const safeDefaults: Record<string, string> = {
  NODE_ENV: "test",
  // Placeholder only: the harness connects to an in-memory MongoDB directly.
  MONGODB_URI: "mongodb://127.0.0.1:1/soulsync_test_placeholder",
  JWT_SECRET: "test-secret-test-secret-test-secret-01",
  JWT_EXPIRES_IN: "1d",
  CLIENT_URL: "http://localhost:3000",
  LOG_LEVEL: "silent",
  RATE_LIMIT_DISABLED: "true",
  TRUST_PROXY: "0",
  JOBS_ENABLED: "false",
  AI_PROVIDER: "local",
  EMAIL_PROVIDER: "log",
  EMAIL_FROM: "SoulSync AI <no-reply@test.local>",
  PAYMENT_PROVIDER: "mock",
  ADMIN_EMAILS: "admin@test.local",
};

// Anything that could reach a paid or external service is forced empty.
const forcedEmpty = [
  "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "ANTHROPIC_BASE_URL", "OPENAI_BASE_URL", "GEMINI_BASE_URL",
  "GROQ_API_KEY", "GROQ_BASE_URL", "BREVO_API_KEY", "BREVO_BASE_URL",
  "RESEND_API_KEY", "RESEND_BASE_URL", "SENDGRID_API_KEY", "SENDGRID_BASE_URL", "SMTP_HOST", "SMTP_USER", "SMTP_PASS",
  "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_API_HOST", "STRIPE_API_PORT",
  "STRIPE_PRICE_PREMIUM_MONTHLY", "STRIPE_PRICE_PREMIUM_YEARLY", "STRIPE_PRICE_PLUS_MONTHLY", "STRIPE_PRICE_PLUS_YEARLY",
  "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "RAZORPAY_BASE_URL",
  "RAZORPAY_PLAN_PREMIUM_MONTHLY", "RAZORPAY_PLAN_PREMIUM_YEARLY", "RAZORPAY_PLAN_PLUS_MONTHLY", "RAZORPAY_PLAN_PLUS_YEARLY",
  "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET",
  "SENTRY_DSN", "METRICS_TOKEN", "CRON_SECRET", "FEATURE_FLAGS", "CLIENT_ORIGINS", "API_PUBLIC_URL",
];

for (const [key, value] of Object.entries(safeDefaults)) process.env[key] ??= value;
for (const key of forcedEmpty) process.env[key] ??= "";

export {};
