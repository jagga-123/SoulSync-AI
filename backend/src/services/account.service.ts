import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Types } from "mongoose";
import { appUrl, adminEmails } from "../config/env";
import { User } from "../models/User.model";
import {
  DEFAULT_EMAIL_PREFS,
  DEFAULT_NOTIFICATION_PREFS,
  UserSettings,
  type EmailPrefs,
  type NotificationPrefs,
} from "../models/UserSettings.model";
import { ApiError } from "../utils/ApiError";
import { sendTemplateEmail, verifyUnsubscribeToken, type UnsubscribeScope } from "./email/email.service";

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------

/** Creates a fresh verification token and emails the link. The raw token is
 * never stored — only its hash — so a database leak can't verify accounts. */
export async function issueVerificationEmail(userId: string): Promise<{ alreadyVerified: boolean }> {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound("User not found");
  if (user.emailVerified) return { alreadyVerified: true };

  const raw = randomBytes(32).toString("hex");
  user.emailVerification = { tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS) };
  await user.save();

  await sendTemplateEmail(
    { email: user.email, userId: user.id, name: user.fullName },
    "verify-email",
    { name: user.fullName, verifyUrl: `${appUrl}/verify-email?token=${user.id}.${raw}` },
    { category: "transactional" },
  );
  return { alreadyVerified: false };
}

export async function verifyEmail(token: string): Promise<void> {
  const [userId, raw] = token.split(".");
  if (!userId || !raw || !Types.ObjectId.isValid(userId)) {
    throw ApiError.badRequest("This verification link is invalid.");
  }

  const user = await User.findById(userId).select("+emailVerification");
  if (!user) throw ApiError.badRequest("This verification link is invalid.");
  if (user.emailVerified) return; // idempotent — clicking the link twice is fine

  const stored = user.emailVerification;
  if (!stored) throw ApiError.badRequest("This verification link is invalid or has already been used.");
  if (stored.expiresAt.getTime() < Date.now()) {
    throw ApiError.badRequest("This verification link has expired. Request a new one.");
  }

  const expected = Buffer.from(stored.tokenHash, "hex");
  const actual = Buffer.from(hashToken(raw), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw ApiError.badRequest("This verification link is invalid.");
  }

  user.emailVerified = true;
  user.emailVerification = undefined;
  // Proving control of a configured admin address is what earns the role.
  if (adminEmails.includes(user.email.toLowerCase())) user.role = "admin";
  await user.save();
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

export interface SettingsView {
  notifications: NotificationPrefs;
  email: EmailPrefs;
}

export async function getSettings(userId: string): Promise<SettingsView> {
  const settings = (await UserSettings.findOne({ userId: new Types.ObjectId(userId) }))?.toObject();
  return {
    notifications: { ...DEFAULT_NOTIFICATION_PREFS, ...(settings?.notifications ?? {}) },
    email: { ...DEFAULT_EMAIL_PREFS, ...(settings?.email ?? {}) },
  };
}

export async function updateSettings(
  userId: string,
  patch: { notifications?: Partial<NotificationPrefs>; email?: Partial<EmailPrefs> },
): Promise<SettingsView> {
  const set: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(patch.notifications ?? {})) set[`notifications.${key}`] = value;
  for (const [key, value] of Object.entries(patch.email ?? {})) set[`email.${key}`] = value;

  if (Object.keys(set).length > 0) {
    await UserSettings.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      { $set: set },
      { upsert: true, setDefaultsOnInsert: true },
    );
  }
  return getSettings(userId);
}

/** One-click unsubscribe from an email's signed link. No login needed. */
export async function unsubscribe(token: string): Promise<{ scope: UnsubscribeScope }> {
  const parsed = verifyUnsubscribeToken(token);
  if (!parsed) throw ApiError.badRequest("This unsubscribe link is invalid or has expired.");

  const email: Partial<EmailPrefs> =
    parsed.scope === "all"
      ? { matches: false, messages: false, weeklyReport: false, referrals: false }
      : { [parsed.scope]: false };

  await updateSettings(parsed.userId, { email });
  return { scope: parsed.scope };
}

// ---------------------------------------------------------------------------
// Admin bootstrap
// ---------------------------------------------------------------------------

/** Promotes any *verified* user whose email is listed in ADMIN_EMAILS. Idempotent. */
export async function ensureAdmins(): Promise<number> {
  if (adminEmails.length === 0) return 0;
  const result = await User.updateMany(
    { email: { $in: adminEmails }, emailVerified: true, role: { $ne: "admin" } },
    { $set: { role: "admin" } },
  );
  return result.modifiedCount;
}
