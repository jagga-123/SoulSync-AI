import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { env, isProduction } from "../../config/env";
import { childLogger } from "../../config/logger";
import { isFeatureEnabled } from "../../features/feature.service";
import { EmailLog } from "../../models/EmailLog.model";
import { User } from "../../models/User.model";
import { DEFAULT_EMAIL_PREFS, UserSettings, type EmailPrefs } from "../../models/UserSettings.model";
import { emailsTotal } from "../../platform/metrics";
import { sendEmail } from "../emailClient";
import { getEmailProvider } from "./providers";
import { renderTemplate, type RenderedEmail, type TemplateData, type TemplateName } from "./templates";

const log = childLogger("email");

export type EmailCategory = "transactional" | "notification";

export interface Recipient {
  email: string;
  userId?: string;
  name?: string;
}

export interface SendOptions {
  category: EmailCategory;
  /** For "notification" emails: which user preference governs this email. */
  pref?: keyof EmailPrefs;
  /** Skip if an email with this key was already logged within `dedupeWindowMs`. */
  dedupeKey?: string;
  dedupeWindowMs?: number;
}

export type SendOutcome = "sent" | "skipped" | "failed";

const ONE_YEAR_S = 60 * 60 * 24 * 365;

export type UnsubscribeScope = keyof EmailPrefs | "all";

export function signUnsubscribeToken(userId: string, scope: UnsubscribeScope): string {
  return jwt.sign({ sub: userId, purpose: "unsubscribe", scope }, env.JWT_SECRET, { expiresIn: ONE_YEAR_S });
}

export function verifyUnsubscribeToken(token: string): { userId: string; scope: UnsubscribeScope } | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub?: string; purpose?: string; scope?: UnsubscribeScope };
    if (payload.purpose !== "unsubscribe" || !payload.sub || !payload.scope) return null;
    return { userId: payload.sub, scope: payload.scope };
  } catch {
    return null;
  }
}

export async function getEmailPrefs(userId: string): Promise<EmailPrefs> {
  const settings = (await UserSettings.findOne({ userId: new Types.ObjectId(userId) }))?.toObject();
  return { ...DEFAULT_EMAIL_PREFS, ...(settings?.email ?? {}) };
}

async function record(
  recipient: Recipient,
  template: TemplateName,
  options: SendOptions,
  subject: string,
  status: "sent" | "failed" | "skipped",
  /** The provider that delivered — or, for a failure, the primary one that was tried first. */
  provider: string,
  extra: { error?: string; providerMessageId?: string } = {},
): Promise<void> {
  emailsTotal.inc({ template, status, provider });
  await EmailLog.create({
    to: recipient.email,
    userId: recipient.userId ? new Types.ObjectId(recipient.userId) : undefined,
    template,
    category: options.category,
    subject,
    provider,
    status,
    dedupeKey: options.dedupeKey,
    ...extra,
  }).catch((err) => log.warn({ err }, "couldn't write email log"));
}

/**
 * Renders and sends a template email. It NEVER throws: email is a side effect
 * of other actions, and a provider outage must not fail a registration or a
 * match. Outcomes are recorded in EmailLog (visible to admins) and metrics.
 *
 * "notification" emails additionally honour: the global flag, the user's
 * email preferences, a verified address (we don't mail addresses nobody has
 * confirmed), and an optional dedupe window.
 */
export async function sendTemplateEmail<K extends TemplateName>(
  recipient: Recipient,
  template: K,
  data: TemplateData[K],
  options: SendOptions,
): Promise<SendOutcome> {
  let subject: string = template;
  let rendered: RenderedEmail | undefined;
  try {
    let unsubscribeUrl: string | undefined;

    if (options.category === "notification") {
      if (!(await isFeatureEnabled("email_notifications"))) return "skipped";

      if (recipient.userId) {
        if (options.pref && !(await getEmailPrefs(recipient.userId))[options.pref]) return "skipped";

        const user = await User.findById(recipient.userId).select("emailVerified status");
        if (!user || !user.emailVerified || user.status === "suspended") return "skipped";

        unsubscribeUrl = `${env.CLIENT_URL.replace(/\/$/, "")}/unsubscribe?token=${signUnsubscribeToken(
          recipient.userId,
          options.pref ?? "all",
        )}`;
      }
    }

    if (options.dedupeKey) {
      const since = new Date(Date.now() - (options.dedupeWindowMs ?? Number.MAX_SAFE_INTEGER / 4));
      const existing = await EmailLog.exists({ dedupeKey: options.dedupeKey, status: "sent", createdAt: { $gte: since } });
      if (existing) return "skipped";
    }

    rendered = renderTemplate(template, data, unsubscribeUrl);
    // Header-injection guard: a subject can embed a user-controlled display name.
    subject = rendered.subject.replace(/[\r\n]+/g, " ").slice(0, 200);

    const headers: Record<string, string> = {};
    if (unsubscribeUrl && env.API_PUBLIC_URL && recipient.userId) {
      const token = unsubscribeUrl.split("token=")[1];
      headers["List-Unsubscribe"] = `<${env.API_PUBLIC_URL.replace(/\/$/, "")}/account/unsubscribe?token=${token}>`;
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    }

    const result = await sendEmail({
      to: recipient.email,
      subject,
      html: rendered.html,
      text: rendered.text,
      headers,
    });

    await record(recipient, template, options, subject, "sent", result.provider, { providerMessageId: result.id });
    return "sent";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err, template, to: recipient.email }, "email send failed");
    // In development a failed send would otherwise swallow the verification link: show what would have been sent.
    if (!isProduction && rendered) log.info({ to: recipient.email, subject, text: rendered.text.slice(0, 400) }, "email (delivery failed — content logged for development)");
    await record(recipient, template, options, subject, "failed", getEmailProvider().name, { error: message.slice(0, 500) });
    return "failed";
  }
}
