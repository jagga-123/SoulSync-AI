import { Types } from "mongoose";
import { childLogger } from "../config/logger";
import { isFeatureEnabled } from "../features/feature.service";
import { Notification, type INotification, type NotificationType } from "../models/Notification.model";
import { DEFAULT_NOTIFICATION_PREFS, UserSettings, type NotificationPrefs } from "../models/UserSettings.model";
import { notificationsCreated } from "../platform/metrics";
import { getIO, personalRoom } from "../socket";
import type { SerializedNotification } from "../socket/types";
import { ApiError } from "../utils/ApiError";

const log = childLogger("notifications");

export interface NotifyInput {
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  /** Repeat events with the same key merge into one unread notification. */
  dedupeKey?: string;
}

const PREF_FOR_TYPE: Partial<Record<NotificationType, keyof NotificationPrefs>> = {
  like_received: "like",
  match_created: "match",
  message_received: "message",
  profile_viewed: "profileView",
  ai_recommendation: "aiRecommendation",
};

function serialize(notification: INotification): SerializedNotification {
  return notification.toJSON() as unknown as SerializedNotification;
}

export async function getNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  const settings = (await UserSettings.findOne({ userId: new Types.ObjectId(userId) }))?.toObject();
  return { ...DEFAULT_NOTIFICATION_PREFS, ...(settings?.notifications ?? {}) };
}

export async function getUnreadCount(userId: string): Promise<number> {
  return Notification.countDocuments({ userId: new Types.ObjectId(userId), isRead: false });
}

async function pushToUser(userId: string, notification: INotification): Promise<void> {
  const io = getIO();
  if (!io) return;
  const unreadCount = await getUnreadCount(userId);
  io.to(personalRoom(userId)).emit("notification", { notification: serialize(notification), unreadCount });
}

async function pushCount(userId: string): Promise<void> {
  const io = getIO();
  if (!io) return;
  io.to(personalRoom(userId)).emit("notification_count", { unreadCount: await getUnreadCount(userId) });
}

/**
 * Creates (or merges into) an in-app notification and pushes it live. Returns
 * null when notifications are switched off or the user has muted this type.
 * Never throws for delivery problems — a notification must not break the action
 * that caused it (callers additionally run inside the event bus).
 */
export async function notify(userId: string, input: NotifyInput): Promise<INotification | null> {
  if (!(await isFeatureEnabled("notifications"))) return null;

  const pref = PREF_FOR_TYPE[input.type];
  if (pref && !(await getNotificationPrefs(userId))[pref]) return null;

  const userObjectId = new Types.ObjectId(userId);
  let notification: INotification | null;

  if (input.dedupeKey) {
    // Atomic "merge or create": the partial unique index guarantees a single
    // unread notification per key, so a burst of events can't create duplicates.
    const set: Record<string, unknown> = { title: input.title, message: input.message };
    for (const [key, value] of Object.entries(input.metadata ?? {})) set[`metadata.${key}`] = value;

    const attempt = () =>
      Notification.findOneAndUpdate(
        { userId: userObjectId, dedupeKey: input.dedupeKey, isRead: false },
        { $set: set, $inc: { "metadata.count": 1 }, $setOnInsert: { type: input.type } },
        { upsert: true, new: true },
      );

    try {
      notification = await attempt();
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
      notification = await attempt(); // lost the insert race — merge into the winner
    }
  } else {
    notification = await Notification.create({
      userId: userObjectId,
      type: input.type,
      title: input.title,
      message: input.message,
      metadata: input.metadata ?? {},
    });
  }

  if (!notification) return null;
  notificationsCreated.inc({ type: input.type });

  try {
    await pushToUser(userId, notification);
  } catch (err) {
    log.warn({ err, userId }, "couldn't push notification over the socket");
  }
  return notification;
}

export interface ListOptions {
  page: number;
  limit: number;
  unreadOnly: boolean;
}

export async function listNotifications(userId: string, options: ListOptions) {
  const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
  if (options.unreadOnly) filter.isRead = false;

  const [items, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ updatedAt: -1 })
      .skip((options.page - 1) * options.limit)
      .limit(options.limit),
    Notification.countDocuments(filter),
    getUnreadCount(userId),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / options.limit));
  return {
    notifications: items.map(serialize),
    unreadCount,
    pagination: { page: options.page, limit: options.limit, total, totalPages, hasMore: options.page < totalPages },
  };
}

export async function markRead(userId: string, notificationId: string): Promise<SerializedNotification> {
  const notification = await Notification.findOne({ _id: notificationId, userId: new Types.ObjectId(userId) });
  if (!notification) throw ApiError.notFound("Notification not found");

  if (!notification.isRead) {
    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();
    void pushCount(userId);
  }
  return serialize(notification);
}

export async function markAllRead(userId: string): Promise<number> {
  const result = await Notification.updateMany(
    { userId: new Types.ObjectId(userId), isRead: false },
    { $set: { isRead: true, readAt: new Date() } },
  );
  void pushCount(userId);
  return result.modifiedCount;
}

export async function deleteNotification(userId: string, notificationId: string): Promise<void> {
  const result = await Notification.deleteOne({ _id: notificationId, userId: new Types.ObjectId(userId) });
  if (result.deletedCount === 0) throw ApiError.notFound("Notification not found");
  void pushCount(userId);
}
