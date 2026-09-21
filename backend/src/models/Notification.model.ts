import { Schema, model, Types, type Document, type Model } from "mongoose";
import { toJSONOptions } from "../utils/mongooseOptions";

export const NOTIFICATION_TYPES = [
  "like_received",
  "match_created",
  "message_received",
  "profile_viewed",
  "ai_recommendation",
  "subscription",
  "referral",
  "safety",
  "system",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface INotification extends Document {
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  readAt?: Date;
  metadata: Record<string, unknown>;
  /** Groups repeat events into one live notification (e.g. every message in a
   * conversation) — see notification.service#notify. */
  dedupeKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 500 },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
    metadata: { type: Schema.Types.Mixed, default: {} },
    dedupeKey: { type: String, trim: true, maxlength: 200 },
  },
  { timestamps: true, toJSON: toJSONOptions },
);

// The notification center: a user's list, most recently active first.
notificationSchema.index({ userId: 1, isRead: 1, updatedAt: -1 });
// At most one *unread* notification per dedupe key — the guarantee that lets
// repeat events (every message in a chat) merge atomically instead of piling up.
notificationSchema.index(
  { userId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { isRead: false, dedupeKey: { $type: "string" } } },
);
// Notifications are ephemeral — drop them after 90 days.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export const Notification: Model<INotification> = model<INotification>("Notification", notificationSchema);
