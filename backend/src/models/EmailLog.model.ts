import { Schema, model, Types, type Document, type Model } from "mongoose";
import { toJSONOptions } from "../utils/mongooseOptions";

export interface IEmailLog extends Document {
  to: string;
  userId?: Types.ObjectId;
  template: string;
  category: "transactional" | "notification";
  subject: string;
  provider: string;
  status: "sent" | "failed" | "skipped";
  error?: string;
  /** Prevents repeat sends (e.g. one weekly report per user per ISO week). */
  dedupeKey?: string;
  providerMessageId?: string;
  createdAt: Date;
}

const emailLogSchema = new Schema<IEmailLog>(
  {
    to: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    template: { type: String, required: true },
    category: { type: String, enum: ["transactional", "notification"], required: true },
    subject: { type: String, required: true },
    provider: { type: String, required: true },
    status: { type: String, enum: ["sent", "failed", "skipped"], required: true },
    error: { type: String, maxlength: 500 },
    dedupeKey: { type: String },
    providerMessageId: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: toJSONOptions },
);

emailLogSchema.index({ dedupeKey: 1, createdAt: -1 }, { sparse: true });
emailLogSchema.index({ userId: 1, createdAt: -1 });
emailLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

export const EmailLog: Model<IEmailLog> = model<IEmailLog>("EmailLog", emailLogSchema);
