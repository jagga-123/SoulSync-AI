import { env } from "../config/env";
import { emailProviderOrder, getEmailProvider, type EmailProviderName } from "./email/providers";

export interface SendEmailRequest {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Extra headers — used for List-Unsubscribe / List-Unsubscribe-Post; every provider passes them through. */
  headers?: Record<string, string>;
}

export interface SendEmailResult {
  /** The provider that actually delivered the message (a fallback if the primary failed). */
  provider: EmailProviderName;
  /** The provider's own message id, when it returns one. */
  id?: string;
  /** The provider's own acknowledgement — for SMTP the server's reply, e.g. "250 2.0.0 OK: queued as …". */
  detail?: string;
}

/**
 * The one place the app hands an email to a transport.
 *
 *   EMAIL_PROVIDER=log                    → written to the server log, nothing is delivered
 *   EMAIL_PROVIDER=smtp                   → the configured SMTP server (e.g. Brevo's relay), no fallbacks
 *   EMAIL_PROVIDER=brevo|resend|sendgrid  → Brevo → Resend → SendGrid, each only if configured;
 *                                           the next one is tried when one fails
 *
 * Sender identity: EVERY email is sent From `EMAIL_FROM` and Reply-To `EMAIL_REPLY_TO`, read from the environment.
 * There is no per-message override and no fallback address, so the sender can't drift from the one verified with
 * the provider. Throws only when every provider failed. Templates, preferences, dedupe and EmailLog bookkeeping
 * stay in email.service.ts.
 */
export async function sendEmail(request: SendEmailRequest): Promise<SendEmailResult> {
  const from = env.EMAIL_FROM;
  // (env validation already guarantees EMAIL_FROM for every real provider; "log" delivers nothing and needs none.)
  if (!from && env.EMAIL_PROVIDER !== "log") throw new Error("EMAIL_FROM is not set — refusing to send without a verified sender identity");

  const transport = getEmailProvider();
  const replyTo = env.EMAIL_REPLY_TO;
  const result = await transport.send({
    from: from ?? "",
    ...(replyTo ? { replyTo } : {}),
    to: request.to,
    subject: request.subject,
    html: request.html,
    text: request.text,
    ...(request.headers && Object.keys(request.headers).length ? { headers: request.headers } : {}),
  });
  return { provider: result.provider ?? transport.name, id: result.id, ...(result.detail ? { detail: result.detail } : {}) };
}

/** Providers a send would try, in order — for `check:env` and the admin system page. */
export function emailProviderChain(): EmailProviderName[] {
  return emailProviderOrder();
}
