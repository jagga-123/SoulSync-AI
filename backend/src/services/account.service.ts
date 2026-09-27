import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Types } from "mongoose";
import { appUrl, adminEmails } from "../config/env";
import { signToken } from "../utils/jwt";
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
import { deleteUserCascade } from "./moderation.service";

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

const timingSafeTokenMatch = (storedHex: string, raw: string): boolean => {
  const expected = Buffer.from(storedHex, "hex");
  const actual = Buffer.from(hashToken(raw), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

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

  if (!timingSafeTokenMatch(stored.tokenHash, raw)) {
    throw ApiError.badRequest("This verification link is invalid.");
  }

  user.emailVerified = true;
  user.emailVerification = undefined;
  // Proving control of a configured admin address is what earns the role.
  if (adminEmails.includes(user.email.toLowerCase())) user.role = "admin";
  await user.save();
}

// ---------------------------------------------------------------------------
// Forgot / reset password
// ---------------------------------------------------------------------------

/**
 * Issues a password-reset token and emails the link — but only if the address belongs to an
 * account. The response is the same either way (see `forgotPasswordSchema`'s note and the
 * controller): this function is what actually keeps that promise, by simply doing nothing
 * when there's no match, rather than returning a signal the controller could leak.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await User.findOne({ email });
  if (!user) return; // no account with this email — say nothing

  const raw = randomBytes(32).toString("hex");
  user.passwordReset = { tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS) };
  await user.save();

  await sendTemplateEmail(
    { email: user.email, userId: user.id, name: user.fullName },
    "reset-password",
    { name: user.fullName, resetUrl: `${appUrl}/reset-password?token=${user.id}.${raw}` },
    { category: "transactional" },
  );
}

/** Sets a new password from a reset link. Bumps `tokenVersion`, so every device signed in under
 * the old password (including, deliberately, whoever is using the account right now if it isn't
 * the real owner) is signed out — the same protection a "change password" flow gives. */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const [userId, raw] = token.split(".");
  if (!userId || !raw || !Types.ObjectId.isValid(userId)) {
    throw ApiError.badRequest("This reset link is invalid.");
  }

  const user = await User.findById(userId).select("+passwordReset");
  if (!user) throw ApiError.badRequest("This reset link is invalid.");

  const stored = user.passwordReset;
  if (!stored) throw ApiError.badRequest("This reset link is invalid or has already been used.");
  if (stored.expiresAt.getTime() < Date.now()) {
    throw ApiError.badRequest("This reset link has expired. Request a new one.");
  }
  if (!timingSafeTokenMatch(stored.tokenHash, raw)) {
    throw ApiError.badRequest("This reset link is invalid.");
  }

  user.password = newPassword; // re-hashed by the pre-save hook
  user.passwordReset = undefined;
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();

  await sendTemplateEmail(
    { email: user.email, userId: user.id, name: user.fullName },
    "password-changed",
    { name: user.fullName },
    { category: "transactional" },
  );
}

// ---------------------------------------------------------------------------
// Change password / sign out everywhere
// ---------------------------------------------------------------------------

/** Changes a signed-in member's password. Bumps `tokenVersion` (signing out every other device)
 * but hands back a freshly-signed token for the device making this request, so the person who
 * just proved they know the password doesn't get logged out by their own change. */
export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<{ token: string }> {
  const user = await User.findById(userId).select("+password");
  if (!user) throw ApiError.notFound("User not found");

  if (!(await user.comparePassword(currentPassword))) {
    throw ApiError.badRequest("That isn't your current password.");
  }
  if (await user.comparePassword(newPassword)) {
    throw ApiError.badRequest("New password must be different from your current one.");
  }

  user.password = newPassword; // re-hashed by the pre-save hook
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();

  await sendTemplateEmail(
    { email: user.email, userId: user.id, name: user.fullName },
    "password-changed",
    { name: user.fullName },
    { category: "transactional" },
  );

  return { token: signToken({ id: user.id, role: user.role, tv: user.tokenVersion }) };
}

/** "Sign out everywhere": bumps `tokenVersion`, which invalidates every token issued so far —
 * including, deliberately, the one used to make this request. The caller signs out locally too. */
export async function revokeSessions(userId: string): Promise<void> {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
}

/** Self-service account deletion: verifies the member's own password, then runs the
 * same permanent cascade delete used by admin moderation (profile, matches, messages,
 * photos, and everything else tied to the account). */
export async function deleteAccount(userId: string, password: string): Promise<void> {
  const user = await User.findById(userId).select("+password");
  if (!user) throw ApiError.notFound("User not found");
  if (!(await user.comparePassword(password))) {
    throw ApiError.badRequest("That isn't your password.");
  }
  await deleteUserCascade(userId);
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
