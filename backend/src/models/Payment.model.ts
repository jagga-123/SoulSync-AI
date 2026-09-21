import { Schema, model, Types, type Document, type Model } from "mongoose";
import { BILLING_INTERVALS, PLAN_IDS, type BillingInterval, type PlanId } from "../features/plans";
import { toJSONOptions } from "../utils/mongooseOptions";
import { PAYMENT_PROVIDERS, type PaymentProviderName } from "./Subscription.model";

export const PAYMENT_STATUSES = ["succeeded", "failed", "refunded", "pending"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface IPayment extends Document {
  userId: Types.ObjectId;
  subscriptionId?: Types.ObjectId;
  provider: PaymentProviderName;
  providerPaymentId?: string;
  plan: PlanId;
  interval?: BillingInterval;
  /** Minor units (cents / paise). */
  amount: number;
  currency: string;
  status: PaymentStatus;
  description: string;
  receiptUrl?: string;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    subscriptionId: { type: Schema.Types.ObjectId, ref: "Subscription" },
    provider: { type: String, enum: PAYMENT_PROVIDERS, required: true },
    providerPaymentId: { type: String, trim: true },
    plan: { type: String, enum: PLAN_IDS, required: true },
    interval: { type: String, enum: BILLING_INTERVALS },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, lowercase: true, trim: true },
    status: { type: String, enum: PAYMENT_STATUSES, required: true },
    description: { type: String, required: true, trim: true, maxlength: 200 },
    receiptUrl: { type: String, trim: true },
    paidAt: { type: Date },
  },
  { timestamps: true, toJSON: toJSONOptions },
);

paymentSchema.index({ userId: 1, createdAt: -1 });
// A provider payment id is recorded once, however many times a webhook is retried.
paymentSchema.index(
  { provider: 1, providerPaymentId: 1 },
  { unique: true, partialFilterExpression: { providerPaymentId: { $type: "string" } } },
);

export const Payment: Model<IPayment> = model<IPayment>("Payment", paymentSchema);
