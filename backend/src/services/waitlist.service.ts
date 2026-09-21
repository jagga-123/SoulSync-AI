import { randomBytes } from "node:crypto";
import { appUrl } from "../config/env";
import { isFeatureEnabled } from "../features/feature.service";
import { User } from "../models/User.model";
import { WaitlistEntry, type IWaitlistEntry } from "../models/WaitlistEntry.model";
import { ApiError } from "../utils/ApiError";
import { sendTemplateEmail } from "./email/email.service";

const INVITE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function newInviteCode(): string {
  const bytes = randomBytes(12);
  return Array.from(bytes, (byte) => INVITE_ALPHABET[byte % INVITE_ALPHABET.length]).join("");
}

/** Position among people still waiting, by join order. */
async function livePosition(entry: IWaitlistEntry): Promise<number> {
  if (entry.status !== "waiting") return 0;
  return WaitlistEntry.countDocuments({ status: "waiting", createdAt: { $lte: entry.createdAt } });
}

export async function joinWaitlist(
  email: string,
  referralCode?: string,
): Promise<{ position: number; alreadyOnList: boolean }> {
  const normalized = email.trim().toLowerCase();

  const existing = await WaitlistEntry.findOne({ email: normalized });
  if (existing) return { position: await livePosition(existing), alreadyOnList: true };

  const last = await WaitlistEntry.findOne().sort({ position: -1 }).select("position");
  let entry: IWaitlistEntry;
  try {
    entry = await WaitlistEntry.create({
      email: normalized,
      position: (last?.position ?? 0) + 1,
      referralCode: referralCode?.trim().toUpperCase() || undefined,
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      const winner = await WaitlistEntry.findOne({ email: normalized });
      if (winner) return { position: await livePosition(winner), alreadyOnList: true };
    }
    throw err;
  }

  const position = await livePosition(entry);
  await sendTemplateEmail({ email: normalized }, "waitlist-confirmation", { position }, { category: "transactional" });
  return { position, alreadyOnList: false };
}

export async function listWaitlist(options: { status?: IWaitlistEntry["status"]; page: number; limit: number }) {
  const filter = options.status ? { status: options.status } : {};
  const [entries, total] = await Promise.all([
    WaitlistEntry.find(filter)
      .sort({ position: 1 })
      .skip((options.page - 1) * options.limit)
      .limit(options.limit),
    WaitlistEntry.countDocuments(filter),
  ]);
  return {
    entries: entries.map((entry) => entry.toJSON()),
    pagination: { page: options.page, limit: options.limit, total, totalPages: Math.max(1, Math.ceil(total / options.limit)) },
  };
}

async function invite(entry: IWaitlistEntry): Promise<void> {
  entry.inviteCode = entry.inviteCode ?? newInviteCode();
  entry.status = "invited";
  entry.invitedAt = new Date();
  await entry.save();

  await sendTemplateEmail(
    { email: entry.email },
    "waitlist-invite",
    { inviteUrl: `${appUrl}/register?invite=${entry.inviteCode}&email=${encodeURIComponent(entry.email)}` },
    { category: "transactional" },
  );
}

export async function inviteWaitlistEntry(entryId: string): Promise<IWaitlistEntry> {
  const entry = await WaitlistEntry.findById(entryId);
  if (!entry) throw ApiError.notFound("Waitlist entry not found");
  if (entry.status === "joined") throw ApiError.conflict("This person has already joined.");
  await invite(entry);
  return entry;
}

/** Invites the next `count` people in line. */
export async function inviteNext(count: number): Promise<number> {
  const next = await WaitlistEntry.find({ status: "waiting" }).sort({ position: 1 }).limit(count);
  for (const entry of next) await invite(entry);
  return next.length;
}

/**
 * Registration gate. With `waitlist_mode` off this is a no-op. With it on, a
 * registration needs either an invite issued to that same email address (so a
 * code can't be passed around) or a referral code that belongs to a real,
 * active member.
 */
export async function assertRegistrationAllowed(input: {
  email: string;
  inviteCode?: string;
  referralCode?: string;
}): Promise<void> {
  if (!(await isFeatureEnabled("waitlist_mode"))) return;

  if (input.inviteCode) {
    const entry = await WaitlistEntry.findOne({ inviteCode: input.inviteCode.trim().toLowerCase(), status: "invited" });
    if (entry && entry.email === input.email.trim().toLowerCase()) return;
  }
  if (input.referralCode) {
    const referrer = await User.exists({ referralCode: input.referralCode.trim().toUpperCase(), status: { $ne: "suspended" } });
    if (referrer) return;
  }

  throw new ApiError(403, "SoulSync AI is invite-only right now. Join the waitlist to get access.", {
    code: "WAITLIST_REQUIRED",
  });
}

/** Marks an invite as used once the account exists. */
export async function consumeInvite(email: string): Promise<void> {
  await WaitlistEntry.updateOne(
    { email: email.trim().toLowerCase(), status: { $in: ["waiting", "invited"] } },
    { $set: { status: "joined", joinedAt: new Date() } },
  );
}
