/**
 * Validates the environment exactly as the server would at boot and prints a
 * launch-readiness summary (never any secret values).
 *
 *   npm run check:env
 *   NODE_ENV=production npm run check:env    # also applies the production-only guards
 */
import { adminEmails, allowedOrigins, env, getEnvWarnings, isProduction } from "../src/config/env";
import { resolveProviderName } from "../src/ai/providers";
import { aiProviderChain } from "../src/services/aiClient";
import { emailProviderChain } from "../src/services/emailClient";

const set = (value: unknown) => (value ? "set" : "—");

console.log(`\nEnvironment: ${env.NODE_ENV}${isProduction ? "  (production guards active)" : ""}`);
console.log(`Port:              ${env.PORT}`);
console.log(`CORS origins:      ${allowedOrigins.join(", ")}`);
console.log(`Trust proxy:       ${env.TRUST_PROXY}`);
console.log(`Rate limits:       ${env.RATE_LIMIT_DISABLED ? "DISABLED" : "on"}`);
console.log(`Scheduler:         ${env.JOBS_ENABLED ? "in-process" : "external cron only"}  (cron secret ${set(env.CRON_SECRET)})`);
const aiChain = resolveProviderName() === "groq" ? aiProviderChain() : [];
console.log(`AI provider:       ${aiChain.length ? `${aiChain.join(" → ")}${aiChain.length > 1 ? "  (fallback in that order)" : ""}` : (resolveProviderName() ?? "built-in engine")}`);
const emailChain = emailProviderChain();
console.log(`Email provider:    ${emailChain.join(" → ")}${emailChain.length > 1 ? "  (fallback in that order)" : ""}`);
console.log(`Payment provider:  ${env.PAYMENT_PROVIDER}`);
console.log(`Error tracking:    ${env.SENTRY_DSN ? "sentry" : "logs only"}`);
console.log(`Metrics token:     ${set(env.METRICS_TOKEN)}`);
console.log(`Cloudinary:        ${set(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET)}`);
console.log(`Admin emails:      ${adminEmails.length}`);

const warnings = getEnvWarnings();
if (warnings.length === 0) {
  console.log("\nNo launch warnings.\n");
} else {
  console.log(`\n${warnings.length} launch warning${warnings.length === 1 ? "" : "s"}:`);
  for (const warning of warnings) console.log(`  ! ${warning}`);
  console.log("");
}
