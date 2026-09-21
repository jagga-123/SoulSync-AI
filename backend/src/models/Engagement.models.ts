import { Schema, model, Types, type Document, type Model } from "mongoose";
import { toJSONOptions } from "../utils/mongooseOptions";

// ---- ProfileView --------------------------------------------------------

export interface IProfileView extends Document {
  viewerId: Types.ObjectId;
  targetId: Types.ObjectId;
  /** UTC day (YYYY-MM-DD) — one recorded view per viewer, target and day. */
  day: string;
  createdAt: Date;
}

const profileViewSchema = new Schema<IProfileView>(
  {
    viewerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    targetId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    day: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: toJSONOptions },
);

profileViewSchema.index({ viewerId: 1, targetId: 1, day: 1 }, { unique: true });
profileViewSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 60 });

export const ProfileView: Model<IProfileView> = model<IProfileView>("ProfileView", profileViewSchema);

// ---- ProfileBoost -------------------------------------------------------

export interface IProfileBoost extends Document {
  userId: Types.ObjectId;
  startsAt: Date;
  endsAt: Date;
  createdAt: Date;
}

const profileBoostSchema = new Schema<IProfileBoost>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: toJSONOptions },
);

profileBoostSchema.index({ userId: 1, endsAt: -1 });
profileBoostSchema.index({ endsAt: 1 });

export const ProfileBoost: Model<IProfileBoost> = model<IProfileBoost>("ProfileBoost", profileBoostSchema);

// ---- DeepAnalysis -------------------------------------------------------

export interface IDeepAnalysis extends Document {
  userId: Types.ObjectId;
  data: Record<string, unknown>;
  source: "llm" | "heuristic";
  provider?: string;
  /** The AIProfile version this was generated from — if the profile changes, it's stale. */
  aiProfileUpdatedAt: Date;
  generatedAt: Date;
}

const deepAnalysisSchema = new Schema<IDeepAnalysis>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    data: { type: Schema.Types.Mixed, required: true },
    source: { type: String, enum: ["llm", "heuristic"], required: true },
    provider: { type: String },
    aiProfileUpdatedAt: { type: Date, required: true },
    generatedAt: { type: Date, required: true },
  },
  { toJSON: toJSONOptions },
);

export const DeepAnalysis: Model<IDeepAnalysis> = model<IDeepAnalysis>("DeepAnalysis", deepAnalysisSchema);

// ---- JobLock ------------------------------------------------------------

export interface IJobLock extends Document {
  name: string;
  lockedUntil?: Date | null;
  lastRunAt?: Date;
  lastStatus?: "ok" | "error";
  lastError?: string;
  lastDurationMs?: number;
  lastResult?: Record<string, unknown>;
}

const jobLockSchema = new Schema<IJobLock>({
  name: { type: String, required: true, unique: true },
  lockedUntil: { type: Date, default: null },
  lastRunAt: { type: Date },
  lastStatus: { type: String, enum: ["ok", "error"] },
  lastError: { type: String, maxlength: 500 },
  lastDurationMs: { type: Number },
  lastResult: { type: Schema.Types.Mixed },
});

export const JobLock: Model<IJobLock> = model<IJobLock>("JobLock", jobLockSchema);
