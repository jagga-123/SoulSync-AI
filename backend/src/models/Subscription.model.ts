import { Schema, model, Types, type Document, type Model } from "mongoose";
import { BILLING_INTERVALS, PLAN_IDS, type BillingInterval, type PlanId } from "../features/plans";
import { toJSONOptions } from "../utils/mongooseOptions";

export const SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due", "canceled", "expired"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const PAYMENT_PROVIDERS = ["stripe", "razorpay", "mock"] as const;
export type PaymentProviderName = (typeof PAYMENT_PROVIDERS)[number];

export interface ISubscription extends Document {
  userId: Types.ObjectId;
  /** "paid" = billed by a provider; "grant" = complimentary (referral reward, admin). */
  source: "paid" | "grant";
  plan: PlanId;
  status: SubscriptionStatus;
  billingInterval?: BillingInterval;
  provider?: PaymentProviderName;
  providerCustomerId?: string;
  providerSubscriptionId?: string;
  startDate: Date;
  /** Access ends here. A subscription is "live" while this is in the future. */
  expiryDate: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt?: Date;
  grantReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionSchema = new Schema<ISubscription>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    source: { type: String, enum: ["paid", "grant"], required: true, default: "paid" },
    plan: { type: String, enum: PLAN_IDS, required: true },
    status: { type: String, enum: SUBSCRIPTION_STATUSES, required: true, default: "active" },
    billingInterval: { type: String, enum: BILLING_INTERVALS },
    provider: { type: String, enum: PAYMENT_PROVIDERS },
    providerCustomerId: { type: String, trim: true },
    providerSubscriptionId: { type: String, trim: true },
    startDate: { type: Date, required: true, default: () => new Date() },
    expiryDate: { type: Date, required: true },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    canceledAt: { type: Date },
    grantReason: { type: String, trim: true, maxlength: 200 },
  },
  { timestamps: true, toJSON: toJSONOptions },
);

// One paid and one complimentary subscription per user; entitlements use the best live one.
subscriptionSchema.index({ userId: 1, source: 1 }, { unique: true });
subscriptionSchema.index({ provider: 1, providerSubscriptionId: 1 }, { sparse: true });
subscriptionSchema.index({ expiryDate: 1, status: 1 });

export const Subscription: Model<ISubscription> = model<ISubscription>("Subscription", subscriptionSchema);
