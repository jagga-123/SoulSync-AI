import { env } from "../../config/env";
import { childLogger } from "../../config/logger";

const log = childLogger("email");

export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  /** Where replies go (defaults to the sender when unset). */
  replyTo?: string;
}

export type EmailProviderName = "log" | "brevo" | "resend" | "sendgrid" | "smtp";

export interface EmailProvider {
  readonly name: EmailProviderName;
  /** `provider` is the one that actually delivered — it differs from `name` when a fallback chain fell through. */
  send(message: EmailMessage): Promise<{ id?: string; provider?: EmailProviderName; detail?: string }>;
}

/**
 * A provider failure. `transient` means "worth trying again a moment later" (timeouts, network errors, HTTP 5xx / 429,
 * SMTP 4xx); anything else (bad key, unverified sender, rejected address) will fail the same way again.
 */
export class EmailProviderError extends Error {
  constructor(
    message: string,
    public readonly transient: boolean,
  ) {
    super(message);
    this.name = "EmailProviderError";
  }
}

const REQUEST_TIMEOUT_MS = 10_000;

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    throw new EmailProviderError(`network error — ${reason}`, true);
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new EmailProviderError(`HTTP ${response.status} ${detail}`, response.status >= 500 || response.status === 429 || response.status === 408);
  }
  return response;
}

/** Splits "Name <addr@host>" into its parts (Brevo and SendGrid want them separately). */
export function parseAddress(value: string): { name?: string; email: string } {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (!match) return { email: value.trim() };
  const name = match[1]?.replace(/^"|"$/g, "");
  return { name: name || undefined, email: (match[2] as string).trim() };
}

const addressObject = (value: string) => {
  const { name, email } = parseAddress(value);
  return { email, ...(name ? { name } : {}) };
};

/** Development default: writes the email to the log instead of sending it. */
class LogProvider implements EmailProvider {
  readonly name = "log" as const;
  async send(message: EmailMessage) {
    log.info({ to: message.to, subject: message.subject, text: message.text.slice(0, 400) }, "email (log provider — not delivered)");
    return { id: `log-${Date.now()}` };
  }
}

// ---------------------------------------------------------------------------
// SMTP (used by the standalone "smtp" provider and by Brevo's SMTP relay)
// ---------------------------------------------------------------------------

interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  /** Refuse to send (or authenticate) unless the connection is upgraded to TLS. */
  requireTLS?: boolean;
}

/** nodemailer errors → our error type, keeping the server's exact reply (e.g. "535 5.7.8 Authentication failed"). */
function smtpError(err: unknown): EmailProviderError {
  const e = err as { code?: string; responseCode?: number; response?: string; message?: string };
  const reply = (e.response ?? e.message ?? "").replace(/\s+/g, " ");
  // nodemailer's `response` usually already starts with the numeric code; don't print it twice.
  const detail = [e.code, e.responseCode !== undefined && reply.startsWith(String(e.responseCode)) ? undefined : e.responseCode, reply].filter(Boolean).join(" ").slice(0, 300);
  const networkCodes = ["ETIMEDOUT", "ECONNECTION", "ESOCKET", "EDNS", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN"];
  const transient = networkCodes.includes(e.code ?? "") || (typeof e.responseCode === "number" && e.responseCode >= 400 && e.responseCode < 500);
  return new EmailProviderError(`SMTP ${detail}`, transient);
}

class SmtpSender {
  private transporter: Promise<import("nodemailer").Transporter> | undefined;

  constructor(private readonly settings: SmtpSettings) {}

  private getTransporter() {
    // nodemailer is only loaded if SMTP is actually configured.
    this.transporter ??= import("nodemailer").then((nodemailer) =>
      nodemailer.createTransport({
        host: this.settings.host,
        port: this.settings.port,
        secure: this.settings.secure,
        requireTLS: this.settings.requireTLS ?? false,
        connectionTimeout: REQUEST_TIMEOUT_MS,
        greetingTimeout: REQUEST_TIMEOUT_MS,
        socketTimeout: 20_000,
        ...(this.settings.user ? { auth: { user: this.settings.user, pass: this.settings.pass ?? "" } } : {}),
      }),
    );
    return this.transporter;
  }

  async send(message: EmailMessage) {
    try {
      const transporter = await this.getTransporter();
      const info = await transporter.sendMail({
        from: message.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        headers: message.headers,
        ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      });
      // The server's own reply (e.g. Brevo's "250 OK: queued as …") is what to quote when looking a message up at the provider.
      log.debug({ host: this.settings.host, response: String(info.response ?? "").slice(0, 160) }, "SMTP server accepted the message");
      return { id: info.messageId, detail: String(info.response ?? "").replace(/\s+/g, " ").slice(0, 200) };
    } catch (err) {
      throw smtpError(err);
    }
  }
}

/** Settings of the standalone `smtp` provider. STARTTLS is mandatory on port 587 / Brevo, so credentials never cross the wire in clear. */
function standaloneSmtpSettings(): SmtpSettings {
  const host = env.SMTP_HOST as string;
  return {
    host,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    requireTLS: !env.SMTP_SECURE && (env.SMTP_PORT === 587 || host.endsWith("brevo.com")),
  };
}

class SmtpProvider implements EmailProvider {
  readonly name = "smtp" as const;
  private readonly sender = new SmtpSender(standaloneSmtpSettings());
  send(message: EmailMessage) {
    return this.sender.send(message);
  }
}

/** The SMTP server the configured provider actually sends through — or null when it doesn't use SMTP. */
export function smtpSettingsInUse(): SmtpSettings | null {
  if (env.EMAIL_PROVIDER === "smtp") return env.SMTP_HOST ? standaloneSmtpSettings() : null;
  if (env.EMAIL_PROVIDER === "brevo") {
    const transport = brevoTransport();
    return transport?.kind === "smtp" ? transport.settings : null;
  }
  return null;
}

export type SmtpVerification = { ok: true } | { ok: false; kind: "unreachable" | "auth"; reason: string };

/**
 * Connects to the SMTP server, negotiates TLS and logs in (no message is sent). Never throws.
 * `kind` separates "can't reach the server" from "the server refused the login".
 */
export async function verifySmtpConnection(settings: SmtpSettings, options: { withAuth?: boolean; timeoutMs?: number } = {}): Promise<SmtpVerification> {
  const timeout = options.timeoutMs ?? 8_000;
  try {
    const nodemailer = await import("nodemailer");
    await nodemailer
      .createTransport({
        host: settings.host,
        port: settings.port,
        secure: settings.secure,
        requireTLS: settings.requireTLS ?? false,
        connectionTimeout: timeout,
        greetingTimeout: timeout,
        socketTimeout: timeout,
        ...((options.withAuth ?? true) && settings.user ? { auth: { user: settings.user, pass: settings.pass ?? "" } } : {}),
      })
      .verify();
    return { ok: true };
  } catch (err) {
    const raw = err as { code?: string; responseCode?: number };
    const isAuth = raw.code === "EAUTH" || [530, 534, 535].includes(raw.responseCode ?? 0);
    return { ok: false, kind: isAuth ? "auth" : "unreachable", reason: smtpError(err).message };
  }
}

// ---------------------------------------------------------------------------
// Brevo — REST API with an API key, or the SMTP relay with the SMTP login + SMTP key
// ---------------------------------------------------------------------------

export const BREVO_SMTP_HOST = "smtp-relay.brevo.com";

export type BrevoTransport =
  | { kind: "api"; apiKey: string }
  | { kind: "smtp"; settings: SmtpSettings };

/**
 * How Brevo will be reached, from the configuration — or null when it can't be.
 *  - BREVO_API_KEY holding an API key (xkeysib-…)  → the REST API (also returns Brevo's message id)
 *  - an SMTP key (xsmtpsib-…, in BREVO_API_KEY or SMTP_PASS) + SMTP_USER → the SMTP relay (smtp-relay.brevo.com:587)
 * Brevo's SMTP keys are NOT accepted by its REST API, hence the two paths.
 */
export function brevoTransport(): BrevoTransport | null {
  const key = env.BREVO_API_KEY;
  const isSmtpKey = key?.startsWith("xsmtpsib-") ?? false;
  if (key && !isSmtpKey) return { kind: "api", apiKey: key };

  const pass = env.SMTP_PASS ?? (isSmtpKey ? key : undefined);
  if (env.SMTP_USER && pass) {
    const host = env.SMTP_HOST ?? BREVO_SMTP_HOST;
    return {
      kind: "smtp",
      settings: { host, port: env.SMTP_PORT, secure: env.SMTP_SECURE, user: env.SMTP_USER, pass, requireTLS: !env.SMTP_SECURE && host.endsWith("brevo.com") },
    };
  }
  return null;
}

/** https://developers.brevo.com/reference/sendtransacemail — auth is an `api-key` header, not a bearer token. */
class BrevoProvider implements EmailProvider {
  readonly name = "brevo" as const;
  private smtp: SmtpSender | undefined;

  async send(message: EmailMessage) {
    const transport = brevoTransport();
    if (!transport) {
      throw new EmailProviderError("Brevo is not usable: it needs an API key (xkeysib-…) or SMTP_USER together with the SMTP key (xsmtpsib-…)", false);
    }

    if (transport.kind === "smtp") {
      this.smtp ??= new SmtpSender(transport.settings);
      return this.smtp.send(message);
    }

    const base = (env.BREVO_BASE_URL ?? "https://api.brevo.com").replace(/\/$/, "");
    const response = await postJson(
      `${base}/v3/smtp/email`,
      { "api-key": transport.apiKey, Accept: "application/json" },
      {
        sender: addressObject(message.from),
        to: [{ email: message.to }],
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
        ...(message.replyTo ? { replyTo: addressObject(message.replyTo) } : {}),
        // Carries List-Unsubscribe / List-Unsubscribe-Post for one-click unsubscribe.
        ...(message.headers ? { headers: message.headers } : {}),
      },
    );
    const json = (await response.json().catch(() => ({}))) as { messageId?: string };
    return { id: json.messageId };
  }
}

/** https://resend.com/docs/api-reference/emails/send-email */
class ResendProvider implements EmailProvider {
  readonly name = "resend" as const;
  async send(message: EmailMessage) {
    const base = (env.RESEND_BASE_URL ?? "https://api.resend.com").replace(/\/$/, "");
    const response = await postJson(
      `${base}/emails`,
      { Authorization: `Bearer ${env.RESEND_API_KEY}` },
      {
        from: message.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        ...(message.headers ? { headers: message.headers } : {}),
      },
    );
    const json = (await response.json().catch(() => ({}))) as { id?: string };
    return { id: json.id };
  }
}

/** https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send */
class SendGridProvider implements EmailProvider {
  readonly name = "sendgrid" as const;
  async send(message: EmailMessage) {
    const base = (env.SENDGRID_BASE_URL ?? "https://api.sendgrid.com").replace(/\/$/, "");
    const response = await postJson(
      `${base}/v3/mail/send`,
      { Authorization: `Bearer ${env.SENDGRID_API_KEY}` },
      {
        personalizations: [{ to: [{ email: message.to }] }],
        from: addressObject(message.from),
        subject: message.subject,
        content: [
          { type: "text/plain", value: message.text },
          { type: "text/html", value: message.html },
        ],
        ...(message.replyTo ? { reply_to: addressObject(message.replyTo) } : {}),
        ...(message.headers ? { headers: message.headers } : {}),
      },
    );
    return { id: response.headers.get("x-message-id") ?? undefined };
  }
}

// ---------------------------------------------------------------------------
// Resilience: one retry for the provider we prefer, then the fallback chain
// ---------------------------------------------------------------------------

/** Mutable so tests don't have to wait. */
export const retryPolicy = { delayMs: 500 };

/**
 * A temporary failure (timeout, network error, 5xx, 429, SMTP 4xx) gets exactly one more attempt after a short pause.
 * A permanent one (bad key, unverified sender, rejected address) would only fail again, so it is passed on at once.
 */
class RetryOnce implements EmailProvider {
  constructor(private readonly inner: EmailProvider) {}

  get name(): EmailProviderName {
    return this.inner.name;
  }

  async send(message: EmailMessage) {
    try {
      return await this.inner.send(message);
    } catch (err) {
      if (!(err instanceof EmailProviderError) || !err.transient) throw err;
      log.warn({ provider: this.name, err: err.message }, "email provider had a temporary failure, retrying once");
      await new Promise((resolve) => setTimeout(resolve, retryPolicy.delayMs));
      return this.inner.send(message);
    }
  }
}

/**
 * Tries each provider in order and stops at the first that accepts the
 * message. Only if all of them fail does it throw, listing every failure —
 * the caller (email.service) then records the email as failed.
 */
class FallbackChain implements EmailProvider {
  constructor(private readonly members: EmailProvider[]) {}

  get name(): EmailProviderName {
    return (this.members[0] as EmailProvider).name;
  }

  /** Provider names in the order they are tried. */
  get order(): EmailProviderName[] {
    return this.members.map((member) => member.name);
  }

  async send(message: EmailMessage) {
    const failures: string[] = [];
    for (const member of this.members) {
      try {
        const result = await member.send(message);
        if (failures.length > 0) log.warn({ served: member.name, failed: failures.length }, "email sent through a fallback provider");
        return { ...result, provider: member.name };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        failures.push(`${member.name}: ${reason}`);
        log.warn({ provider: member.name, err: reason }, "email provider failed, trying the next one");
      }
    }
    throw new Error(`All email providers failed — ${failures.join(" | ")}`);
  }
}

/** Default order when several API providers are configured. */
const CHAIN_ORDER = ["brevo", "resend", "sendgrid"] as const;
type ChainProviderName = (typeof CHAIN_ORDER)[number];

const chainMember = (name: ChainProviderName): EmailProvider =>
  name === "brevo" ? new BrevoProvider() : name === "resend" ? new ResendProvider() : new SendGridProvider();

const isConfigured = (name: ChainProviderName): boolean =>
  name === "brevo" ? brevoTransport() !== null : Boolean(name === "resend" ? env.RESEND_API_KEY : env.SENDGRID_API_KEY);

/**
 * The API providers to try, in order: Brevo → Resend → SendGrid, each only if
 * it is configured. EMAIL_PROVIDER moves the provider it names to the front, so
 * an existing `EMAIL_PROVIDER=resend` still means "Resend first" — the others
 * are simply added behind it as fallbacks.
 */
function chainFor(preferred: ChainProviderName): ChainProviderName[] {
  return [preferred, ...CHAIN_ORDER.filter((name) => name !== preferred)].filter(isConfigured);
}

let provider: EmailProvider | undefined;

export function getEmailProvider(): EmailProvider {
  if (!provider) {
    switch (env.EMAIL_PROVIDER) {
      case "brevo":
      case "resend":
      case "sendgrid": {
        const members = chainFor(env.EMAIL_PROVIDER).map(chainMember);
        const [primary = chainMember(env.EMAIL_PROVIDER), ...fallbacks] = members;
        // The preferred provider gets one retry; a lone provider needs no chain wrapper (and keeps its own name and errors).
        provider = fallbacks.length > 0 ? new FallbackChain([new RetryOnce(primary), ...fallbacks]) : new RetryOnce(primary);
        break;
      }
      case "smtp":
        provider = new RetryOnce(new SmtpProvider());
        break;
      default:
        provider = new LogProvider();
    }
  }
  return provider;
}

/** The providers a send would try, in order (for `check:env` and the admin system page). */
export function emailProviderOrder(): EmailProviderName[] {
  const active = getEmailProvider();
  return active instanceof FallbackChain ? active.order : [active.name];
}

/** Test hook: swap the provider (e.g. to capture messages). */
export function setEmailProviderForTests(next: EmailProvider | undefined): void {
  provider = next;
}
