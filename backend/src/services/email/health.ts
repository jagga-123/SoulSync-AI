import { env, isProduction } from "../../config/env";
import { childLogger } from "../../config/logger";
import { parseAddress, smtpSettingsInUse, verifySmtpConnection, type EmailProviderName } from "./providers";

const log = childLogger("email");

export type EmailHealthStatus =
  | "ok" // SMTP reachable and the login was accepted
  | "smtp_unreachable" // couldn't connect / negotiate TLS
  | "smtp_auth_failed" // the server refused the login
  | "smtp_not_configured" // EMAIL_PROVIDER needs SMTP but no host/credentials are set
  | "not_smtp" // the provider doesn't use SMTP (resend / sendgrid / brevo API)
  | "log_provider"; // EMAIL_PROVIDER=log: nothing is delivered

export interface EmailHealth {
  smtpConnected: boolean;
  provider: EmailProviderName;
  /** The EMAIL_FROM every email is sent under (null when unset). */
  activeSender: string | null;
  /** The EMAIL_REPLY_TO every email carries (null when unset). */
  replyTo: string | null;
  senderConfigured: boolean;
  readyForProduction: boolean;
  status: EmailHealthStatus;
  /** Generic, secret-free advice about things that will hurt real-world delivery. */
  warnings: string[];
  checkedAt: string;
}

const FREE_MAIL = /^(gmail|googlemail|yahoo|outlook|hotmail|live|icloud|proton|protonmail|aol|gmx|yandex|zoho)\./i;
export const isFreeMailDomain = (domain: string): boolean => FREE_MAIL.test(domain);

/** The sender identity in use — always exactly EMAIL_FROM; there is no fallback address. */
export function activeSender(): string | null {
  return env.EMAIL_FROM ?? null;
}

/** EMAIL_FROM counts as configured when it is set and is a real address. */
export function senderConfigured(): boolean {
  const from = activeSender();
  if (!from) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parseAddress(from).email);
}

/** The line logged at startup: which sender identity every email will go out under. */
export function describeActiveSender(): string {
  return `Active sender: ${activeSender() ?? "(none — EMAIL_FROM is not set)"}`;
}

const CACHE_MS = 30_000;
let cached: { at: number; health: EmailHealth; reason?: string } | undefined;
let inflight: Promise<{ health: EmailHealth; reason?: string }> | undefined;

export function resetEmailHealthCache(): void {
  cached = undefined;
  inflight = undefined;
}

async function measure(): Promise<{ health: EmailHealth; reason?: string }> {
  const provider = env.EMAIL_PROVIDER;
  const sender = senderConfigured();
  const warnings: string[] = [];

  let smtpConnected = false;
  let status: EmailHealthStatus;
  let reason: string | undefined;

  const settings = smtpSettingsInUse();
  if (provider === "log") {
    status = "log_provider";
    warnings.push("EMAIL_PROVIDER=log — emails are written to the server log, not delivered.");
  } else if (provider === "smtp" || settings) {
    if (!settings || !settings.user || !settings.pass) {
      status = "smtp_not_configured";
      reason = "SMTP_HOST, SMTP_USER and SMTP_PASS (or the Brevo SMTP key) must all be set";
    } else {
      const result = await verifySmtpConnection(settings);
      smtpConnected = result.ok;
      status = result.ok ? "ok" : result.kind === "auth" ? "smtp_auth_failed" : "smtp_unreachable";
      if (!result.ok) reason = result.reason;
    }
  } else {
    status = "not_smtp";
  }

  if (!sender) warnings.push("EMAIL_FROM is not set — set it to the sender address you verified with your provider.");
  else if (isFreeMailDomain(parseAddress(activeSender() as string).email.split("@")[1] ?? "")) {
    warnings.push("EMAIL_FROM is a free-mail address (e.g. gmail.com): fine for testing, but SPF/DKIM/DMARC can't be aligned for it, so Gmail/Yahoo may reject or spam-folder mail. Use an address on your own authenticated domain for production.");
  }
  if (!env.EMAIL_REPLY_TO) warnings.push("EMAIL_REPLY_TO is not set.");
  if (!env.API_PUBLIC_URL) warnings.push("API_PUBLIC_URL is not set, so notification emails carry no List-Unsubscribe header.");
  else if (isProduction && !env.API_PUBLIC_URL.startsWith("https://")) warnings.push("API_PUBLIC_URL must be https:// for one-click unsubscribe.");
  if (isProduction && !env.CLIENT_URL.startsWith("https://")) warnings.push("CLIENT_URL is not https:// — links inside emails would be insecure.");

  const freeMailSender = warnings.some((w) => w.startsWith("EMAIL_FROM is a free-mail"));
  // "Ready" = mail can really leave, from a real sender that mailbox providers will accept.
  const readyForProduction = smtpConnected && sender && !freeMailSender;

  return {
    health: { smtpConnected, provider, activeSender: activeSender(), replyTo: env.EMAIL_REPLY_TO ?? null, senderConfigured: sender, readyForProduction, status, warnings, checkedAt: new Date().toISOString() },
    reason,
  };
}

/**
 * Current email health. Results are cached for 30 s (and concurrent callers share one check), so a public
 * endpoint can't be used to make this server open connections to the mail provider at will. Never throws.
 */
export async function checkEmailHealth(options: { force?: boolean } = {}): Promise<{ health: EmailHealth; reason?: string }> {
  if (!options.force && cached && Date.now() - cached.at < CACHE_MS) return cached;
  inflight ??= measure()
    .catch((err): { health: EmailHealth; reason?: string } => ({
      health: { smtpConnected: false, provider: env.EMAIL_PROVIDER, activeSender: activeSender(), replyTo: env.EMAIL_REPLY_TO ?? null, senderConfigured: senderConfigured(), readyForProduction: false, status: "smtp_unreachable", warnings: [], checkedAt: new Date().toISOString() },
      reason: err instanceof Error ? err.message : String(err),
    }))
    .finally(() => {
      inflight = undefined;
    });
  const result = await inflight;
  cached = { at: Date.now(), ...result };
  return result;
}

/**
 * Called once after the server starts listening. Verifies the SMTP connection and logs the outcome; a failure is a
 * warning, never a crash — the app keeps serving and email sends fail gracefully (recorded, never thrown).
 */
export async function verifyEmailOnStartup(): Promise<void> {
  // First, say which identity every email will use (the same value the health endpoint reports).
  log.info({ provider: env.EMAIL_PROVIDER, activeSender: activeSender(), replyTo: env.EMAIL_REPLY_TO ?? null }, describeActiveSender());
  const { health, reason } = await checkEmailHealth({ force: true });
  if (health.status === "ok") log.info({ provider: health.provider, senderConfigured: health.senderConfigured }, "SMTP connection verified — email delivery is available");
  else if (health.status === "log_provider" || health.status === "not_smtp") log.info({ provider: health.provider }, "email transport is not SMTP — no SMTP check needed");
  else log.warn({ provider: health.provider, status: health.status, reason }, "SMTP unavailable — emails will fail (and be recorded as failed) until it is fixed; the app keeps running");
  if (!health.senderConfigured && health.provider !== "log") log.warn("EMAIL_FROM is not set — set it to the sender you verified with your provider");
}
