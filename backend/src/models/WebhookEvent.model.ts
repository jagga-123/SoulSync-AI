import { Schema, model, type Document, type Model } from "mongoose";

export interface IWebhookEvent extends Document {
  provider: string;
  eventId: string;
  type: string;
  processedAt: Date;
}

const webhookEventSchema = new Schema<IWebhookEvent>({
  provider: { type: String, required: true },
  eventId: { type: String, required: true },
  type: { type: String, required: true },
  processedAt: { type: Date, default: () => new Date() },
});

// Providers redeliver webhooks; the unique key is what makes handling idempotent.
webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
webhookEventSchema.index({ processedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

export const WebhookEvent: Model<IWebhookEvent> = model<IWebhookEvent>("WebhookEvent", webhookEventSchema);
