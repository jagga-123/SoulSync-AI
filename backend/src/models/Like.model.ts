import { Schema, model, Types, type Document, type Model } from "mongoose";

export const LIKE_STATUS_OPTIONS = ["pending", "accepted", "rejected"] as const;
export type LikeStatus = (typeof LIKE_STATUS_OPTIONS)[number];

export interface ILike extends Document {
  senderId: Types.ObjectId;
  receiverId: Types.ObjectId;
  status: LikeStatus;
  createdAt: Date;
  updatedAt: Date;
}

const likeSchema = new Schema<ILike>(
  {
    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiverId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true, // "incoming likes" is looked up by receiverId alone
    },
    status: {
      type: String,
      enum: LIKE_STATUS_OPTIONS,
      default: "pending",
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

// Also the DB-level guarantee against duplicate likes; senderId-only lookups
// (outgoing likes) are served by this index's prefix.
likeSchema.index({ senderId: 1, receiverId: 1 }, { unique: true });

export const Like: Model<ILike> = model<ILike>("Like", likeSchema);
