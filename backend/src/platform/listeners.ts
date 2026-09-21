import { Types } from "mongoose";
import { childLogger } from "../config/logger";
import { PLANS } from "../features/plans";
import { Message } from "../models/Message.model";
import { User } from "../models/User.model";
import { isUserOnline, isUserViewingConversation } from "../socket";
import { issueVerificationEmail } from "../services/account.service";
import { findHighCompatibilityCandidates } from "../services/ai-match.service";
import { sendTemplateEmail } from "../services/email/email.service";
import { notify } from "../services/notification.service";
import { qualifyReferral } from "../services/referral.service";
import { getSubscriptionView } from "../services/subscription.service";
import { events } from "./events";

const log = childLogger("listeners");

const HIGH_COMPATIBILITY_THRESHOLD = 80;
const MAX_CANDIDATES_NOTIFIED = 10;
const MESSAGE_EMAIL_THROTTLE_MS = 30 * 60 * 1000;

const utcDay = () => new Date().toISOString().slice(0, 10);
const firstName = (name: string) => name.trim().split(/\s+/)[0] || "Someone";

async function nameOf(userId: string): Promise<string> {
  const user = await User.findById(userId).select("fullName");
  return user?.fullName ?? "Someone";
}

const formatDate = (date: Date) => date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

let registered = false;

/** Wires the platform's side effects to domain events. Idempotent. */
export function registerEventListeners(): void {
  if (registered) return;
  registered = true;

  // ---- accounts -----------------------------------------------------------

  events.on("user.registered", async ({ userId, email, fullName }) => {
    // Configured admin addresses are promoted only once the email is *verified*
    // (see verifyEmail / ensureAdmins) — otherwise anyone could claim an admin
    // address by registering it first.
    await sendTemplateEmail({ email, userId, name: fullName }, "welcome", { name: fullName }, { category: "transactional" });
    await issueVerificationEmail(userId);
  });

  events.on("user.suspended", async ({ userId, reason }) => {
    const user = await User.findById(userId).select("email fullName");
    if (!user) return;
    await sendTemplateEmail({ email: user.email, userId, name: user.fullName }, "account-suspended", { name: user.fullName, reason }, { category: "transactional" });
  });

  // ---- likes & matches ------------------------------------------------------

  events.on("like.sent", async ({ likeId, senderId, receiverId }) => {
    const name = await nameOf(senderId);
    await notify(receiverId, {
      type: "like_received",
      title: "Someone likes you",
      message: `${firstName(name)} liked your profile. Head to Likes to respond.`,
      metadata: { likeId, senderId, senderName: name },
    });
  });

  events.on("match.created", async ({ matchId, userIds }) => {
    const [a, b] = userIds;
    const [nameA, nameB] = await Promise.all([nameOf(a), nameOf(b)]);

    for (const [userId, otherId, otherName] of [
      [a, b, nameB],
      [b, a, nameA],
    ] as const) {
      await notify(userId, {
        type: "match_created",
        title: "It's a match!",
        message: `You and ${firstName(otherName)} both said yes. Say hello!`,
        metadata: { matchId, otherUserId: otherId, otherName },
      });

      const me = await User.findById(userId).select("email fullName");
      if (me) {
        await sendTemplateEmail(
          { email: me.email, userId, name: me.fullName },
          "match",
          { name: me.fullName, matchName: otherName },
          { category: "notification", pref: "matches", dedupeKey: `match:${matchId}:${userId}` },
        );
      }
    }
  });

  // ---- messages -------------------------------------------------------------

  events.on("message.sent", async ({ conversationId, senderId, receiverId, preview }) => {
    // No alert for a message they're reading right now.
    if (await isUserViewingConversation(receiverId, conversationId)) return;

    const senderName = await nameOf(senderId);
    await notify(receiverId, {
      type: "message_received",
      title: `New message from ${firstName(senderName)}`,
      message: preview.slice(0, 140),
      dedupeKey: `message:${conversationId}`,
      metadata: { conversationId, senderId, senderName },
    });

    // Email only if they're offline, and at most once per conversation per half hour.
    if (isUserOnline(receiverId)) return;
    const receiver = await User.findById(receiverId).select("email fullName");
    if (!receiver) return;

    const unread = await Message.countDocuments({
      conversationId: new Types.ObjectId(conversationId),
      receiverId: new Types.ObjectId(receiverId),
      isRead: false,
    });
    await sendTemplateEmail(
      { email: receiver.email, userId: receiverId, name: receiver.fullName },
      "new-message",
      { name: receiver.fullName, senderName, preview, count: Math.max(1, unread) },
      { category: "notification", pref: "messages", dedupeKey: `msg-email:${conversationId}:${receiverId}`, dedupeWindowMs: MESSAGE_EMAIL_THROTTLE_MS },
    );
  });

  // ---- profile views --------------------------------------------------------

  events.on("profile.viewed", async ({ targetId }) => {
    // One rolling notification per day ("N people viewed your profile"), not one per viewer.
    await notify(targetId, {
      type: "profile_viewed",
      title: "Your profile is getting attention",
      message: "People are checking out your profile today.",
      dedupeKey: `profile-views:${utcDay()}`,
    });
  });

  // ---- AI interview ---------------------------------------------------------

  events.on("ai_profile.saved", async ({ userId, isFirst }) => {
    if (isFirst) {
      await notify(userId, {
        type: "ai_recommendation",
        title: "Your AI matches are ready",
        message: "SoulSync AI finished analysing your interview. See who you're most compatible with.",
        dedupeKey: "ai-ready",
        metadata: { link: "/discover" },
      });
      await qualifyReferral(userId);
    }

    // Tell the people who'd be a strong match for this newly-analysed profile.
    const candidates = await findHighCompatibilityCandidates(userId, HIGH_COMPATIBILITY_THRESHOLD, MAX_CANDIDATES_NOTIFIED);
    for (const candidate of candidates) {
      await notify(candidate.userId, {
        type: "ai_recommendation",
        title: "A new high-compatibility match",
        message: "Someone new who's a strong AI match for you just finished their interview.",
        // One per day per person, merged — never a flood.
        dedupeKey: `ai-rec:${utcDay()}`,
        metadata: { link: "/discover", topScore: candidate.score },
      });
    }
  });

  // ---- subscriptions --------------------------------------------------------

  events.on("subscription.changed", async ({ userId, plan, previousPlan, reason }) => {
    const user = await User.findById(userId).select("email fullName");
    if (!user) return;

    const view = await getSubscriptionView(userId);
    const expiry = view.expiryDate ? formatDate(view.expiryDate) : "";

    const copy: Partial<Record<typeof reason, { title: string; message: string }>> = {
      checkout: { title: `Welcome to ${PLANS[plan].name}`, message: `Your ${PLANS[plan].name} plan is active. Enjoy your new features.` },
      upgrade: { title: `You're now on ${PLANS[plan].name}`, message: `Your plan was upgraded from ${PLANS[previousPlan].name}.` },
      cancel_scheduled: { title: "Your subscription will end", message: `You'll keep ${PLANS[previousPlan].name} until ${expiry || "the end of your billing period"}.` },
      grant: { title: `You've been given ${PLANS[plan].name}`, message: `Enjoy ${PLANS[plan].name}${expiry ? ` until ${expiry}` : ""}.` },
      expired: { title: "Your Premium has ended", message: "You're back on the Free plan. Upgrade any time to get your features back." },
      payment_failed: { title: "Payment failed", message: "We couldn't process your last payment. Please update your payment method to keep Premium." },
    };
    const notification = copy[reason];
    if (notification) {
      await notify(userId, { type: "subscription", ...notification, metadata: { plan, previousPlan, reason, link: "/billing" } });
    }

    const emailData = { name: user.fullName, planName: PLANS[reason === "cancel_scheduled" ? previousPlan : plan].name, expiry };
    if (reason === "checkout" && plan !== "free") {
      await sendTemplateEmail({ email: user.email, userId, name: user.fullName }, "subscription-started", emailData, {
        category: "transactional",
        dedupeKey: `sub-started:${userId}:${plan}:${expiry}`,
        dedupeWindowMs: 60 * 60 * 1000,
      });
    } else if (reason === "cancel_scheduled") {
      await sendTemplateEmail({ email: user.email, userId, name: user.fullName }, "subscription-canceled", emailData, { category: "transactional" });
    }
  });

  // ---- growth & safety ------------------------------------------------------

  events.on("referral.qualified", async ({ referrerId }) => {
    await notify(referrerId, {
      type: "referral",
      title: "A friend you invited joined!",
      message: "They finished their AI interview — that counts as a successful referral.",
      metadata: { link: "/referrals" },
    });
  });

  events.on("report.resolved", async ({ reporterId, reportedId, action }) => {
    await notify(reporterId, {
      type: "safety",
      title: "We reviewed your report",
      message: "Thanks for helping keep SoulSync AI safe. Our moderators have looked at it and taken action where needed.",
    });
    if (action === "warn") {
      await notify(reportedId, {
        type: "safety",
        title: "A warning from our moderators",
        message: "A report about your behaviour was reviewed. Please follow our community guidelines — repeated issues may lead to suspension.",
      });
    }
  });

  log.info("event listeners registered");
}
