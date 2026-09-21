import { Schema, model, Types, type Document, type Model } from "mongoose";
import { PLAN_IDS, type PlanId } from "../features/plans";
import { toJSONOptions } from "../utils/mongooseOptions";

export interface IReferral extends Document {
  referrerId: Types.ObjectId;
  /** Each person can be referred once. */
  referredId: Types.ObjectId;
  code: string;
  /** "qualified" = the referred person completed the AI interview — a real
   * signal, so throwaway signups can't farm rewards. */
  status: "pending" | "qualified";
  qualifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const referralSchema = new Schema<IReferral>(
  {
    referrerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    referredId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    code: { type: String, required: true },
    status: { type: String, enum: ["pending", "qualified"], default: "pending" },
    qualifiedAt: { type: Date },
  },
  { timestamps: true, toJSON: toJSONOptions },
);

export const Referral: Model<IReferral> = model<IReferral>("Referral", referralSchema);

export interface IReferralReward extends Document {
  userId: Types.ObjectId;
  /** The successful-referral count this reward was earned at. */
  threshold: number;
  reward: { type: "premium_days"; plan: PlanId; days: number };
  grantedAt: Date;
}

const referralRewardSchema = new Schema<IReferralReward>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    threshold: { type: Number, required: true },
    reward: {
      type: { type: String, enum: ["premium_days"], required: true },
      plan: { type: String, enum: PLAN_IDS, required: true },
      days: { type: Number, required: true },
    },
    grantedAt: { type: Date, default: () => new Date() },
  },
  { toJSON: toJSONOptions },
);

// A milestone pays out once per user, however often qualification is re-evaluated.
referralRewardSchema.index({ userId: 1, threshold: 1 }, { unique: true });

export const ReferralReward: Model<IReferralReward> = model<IReferralReward>("ReferralReward", referralRewardSchema);
