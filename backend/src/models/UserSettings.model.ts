import { Schema, model, Types, type Document, type Model } from "mongoose";
import { toJSONOptions } from "../utils/mongooseOptions";

export interface NotificationPrefs {
  like: boolean;
  match: boolean;
  message: boolean;
  profileView: boolean;
  aiRecommendation: boolean;
}

export interface EmailPrefs {
  matches: boolean;
  messages: boolean;
  weeklyReport: boolean;
  referrals: boolean;
}

export interface IUserSettings extends Document {
  userId: Types.ObjectId;
  notifications: NotificationPrefs;
  email: EmailPrefs;
  createdAt: Date;
  updatedAt: Date;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  like: true,
  match: true,
  message: true,
  profileView: true,
  aiRecommendation: true,
};

export const DEFAULT_EMAIL_PREFS: EmailPrefs = {
  matches: true,
  messages: true,
  weeklyReport: true,
  referrals: true,
};

const flag = { type: Boolean, default: true };

const userSettingsSchema = new Schema<IUserSettings>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    notifications: {
      like: flag,
      match: flag,
      message: flag,
      profileView: flag,
      aiRecommendation: flag,
    },
    email: {
      matches: flag,
      messages: flag,
      weeklyReport: flag,
      referrals: flag,
    },
  },
  { timestamps: true, toJSON: toJSONOptions },
);

export const UserSettings: Model<IUserSettings> = model<IUserSettings>("UserSettings", userSettingsSchema);
