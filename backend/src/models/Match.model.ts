import { Schema, model, Types, type Document, type Model } from "mongoose";

export interface IMatch extends Document {
  userOne: Types.ObjectId;
  userTwo: Types.ObjectId;
  compatibilityScore: number;
  createdAt: Date;
  updatedAt: Date;
}

const matchSchema = new Schema<IMatch>(
  {
    // Canonically ordered (userOne < userTwo as strings) at creation time so
    // the same pair can never produce two Match documents regardless of who
    // liked whom first — see utils/objectId.ts#orderUserIds.
    userOne: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    userTwo: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    compatibilityScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
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

matchSchema.index({ userOne: 1, userTwo: 1 }, { unique: true });

export const Match: Model<IMatch> = model<IMatch>("Match", matchSchema);
