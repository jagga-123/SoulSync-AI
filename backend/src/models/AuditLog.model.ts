import { Schema, model, Types, type Document, type Model } from "mongoose";
import { toJSONOptions } from "../utils/mongooseOptions";

export interface IAuditLog extends Document {
  actorId: Types.ObjectId;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata: Record<string, unknown>;
  ip?: string;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actorEmail: { type: String, required: true },
    action: { type: String, required: true },
    targetType: { type: String, required: true },
    targetId: { type: String },
    metadata: { type: Schema.Types.Mixed, default: {} },
    ip: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: toJSONOptions },
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });

export const AuditLog: Model<IAuditLog> = model<IAuditLog>("AuditLog", auditLogSchema);
