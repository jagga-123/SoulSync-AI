import { Schema, model, Types, type Document, type Model } from "mongoose";

export interface IConversation extends Document {
  participants: Types.ObjectId[];
  lastMessage?: string;
  lastMessageAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<IConversation>(
  {
    // Always stored sorted (string-compared) at creation time — see
    // utils/objectId.ts#orderUserIds — so the same two users can never end
    // up with two Conversation documents; the unique index below only works
    // because the array is written in a canonical order.
    participants: {
      type: [{ type: Schema.Types.ObjectId, ref: "User" }],
      required: true,
      validate: {
        validator: (value: Types.ObjectId[]) => value.length === 2,
        message: "A conversation must have exactly 2 participants",
      },
    },
    lastMessage: {
      type: String,
      trim: true,
    },
    lastMessageAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.__v;
        delete ret._id;
        return ret;
      },
    },
  },
);

conversationSchema.index({ participants: 1 }, { unique: true });

export const Conversation: Model<IConversation> = model<IConversation>(
  "Conversation",
  conversationSchema,
);
