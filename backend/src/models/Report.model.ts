import { Schema, model, Types, type Document, type Model } from "mongoose";
import { toJSONOptions } from "../utils/mongooseOptions";

export const REPORT_REASONS = [
  "spam",
  "harassment",
  "fake_profile",
  "inappropriate_content",
  "underage",
  "scam",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ["pending", "reviewing", "resolved", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_ACTIONS = ["none", "warned", "suspended", "deleted", "message_hidden"] as const;
export type ReportAction = (typeof REPORT_ACTIONS)[number];

export interface IReport extends Document {
  reporterId: Types.ObjectId;
  reportedId: Types.ObjectId;
  reason: ReportReason;
  details: string;
  context?: { conversationId?: Types.ObjectId; messageId?: Types.ObjectId };
  status: ReportStatus;
  resolution?: {
    action: ReportAction;
    note: string;
    resolvedBy: Types.ObjectId;
    resolvedAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const reportSchema = new Schema<IReport>(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reportedId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    details: { type: String, trim: true, maxlength: 1000, default: "" },
    context: {
      conversationId: { type: Schema.Types.ObjectId, ref: "Conversation" },
      messageId: { type: Schema.Types.ObjectId, ref: "Message" },
    },
    status: { type: String, enum: REPORT_STATUSES, default: "pending" },
    resolution: {
      action: { type: String, enum: REPORT_ACTIONS },
      note: { type: String, trim: true, maxlength: 1000 },
      resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
      resolvedAt: { type: Date },
    },
  },
  { timestamps: true, toJSON: toJSONOptions },
);

reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ reportedId: 1, status: 1 });
reportSchema.index({ reporterId: 1, reportedId: 1, createdAt: -1 });

export const Report: Model<IReport> = model<IReport>("Report", reportSchema);
