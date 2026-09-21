import { Schema, model, Types, type Document, type Model } from "mongoose";

export const MESSAGE_TYPE_OPTIONS = ["text", "image"] as const;
export type MessageType = (typeof MESSAGE_TYPE_OPTIONS)[number];

export interface IMessage extends Document {
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  receiverId: Types.ObjectId;
  content: string;
  type: MessageType;
  isRead: boolean;
  /** Set by moderators (Phase 6). The content is masked in every response. */
  isHidden?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiverId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true, // unread-count lookups filter by receiverId + isRead
    },
    content: {
      type: String,
      required: [true, "Message content is required"],
      trim: true,
      maxlength: 2000,
    },
    type: {
      // Only "text" is actually sendable today — "image" is reserved for a
      // future upload feature, per the spec's own "(future)" note. No
      // upload pipeline is implemented in this phase.
      type: String,
      enum: MESSAGE_TYPE_OPTIONS,
      default: "text",
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    isHidden: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.__v;
        delete ret._id;
        // Moderated messages stay in the thread (so it still reads coherently)
        // but their text never leaves the server again.
        if (ret.isHidden) ret.content = "[Message removed by moderators]";
        delete ret.isHidden;
        return ret;
      },
    },
  },
);

// Fetching a conversation's messages, latest-first, is the hot path.
messageSchema.index({ conversationId: 1, createdAt: -1 });

export const Message: Model<IMessage> = model<IMessage>("Message", messageSchema);
