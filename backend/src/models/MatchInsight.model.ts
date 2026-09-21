import { Schema, model, Types, type Document, type Model } from "mongoose";
import type {
  CompatibilityDimension,
  CompatibilityReason,
  CompatibilityTier,
  DimensionScore,
} from "../ai/compatibility";

export interface IMatchInsight extends Document {
  // Canonically ordered exactly like Match (see utils/objectId.ts#orderUserIds),
  // so a pair has one insight no matter who asks.
  userOne: Types.ObjectId;
  userTwo: Types.ObjectId;
  score: number;
  tier: CompatibilityTier;
  breakdown: Record<CompatibilityDimension, DimensionScore>;
  reasons: CompatibilityReason[];
  explanation: string;
  explanationSource: "llm" | "template";
  provider?: string;
  // Not `model`: that name is taken by Mongoose's Document#model().
  providerModel?: string;
  /** The AIProfile.updatedAt of each person when this was computed — if either
   * profile has changed since, the insight is stale and gets regenerated. */
  inputsUpdatedAt: { userOne: Date; userTwo: Date };
  createdAt: Date;
  updatedAt: Date;
}

const matchInsightSchema = new Schema<IMatchInsight>(
  {
    userOne: { type: Schema.Types.ObjectId, ref: "User", required: true },
    userTwo: { type: Schema.Types.ObjectId, ref: "User", required: true },
    score: { type: Number, required: true, min: 0, max: 100 },
    tier: {
      type: String,
      enum: ["exceptional", "strong", "promising", "exploring"],
      required: true,
    },
    breakdown: { type: Schema.Types.Mixed, required: true },
    reasons: {
      type: [
        new Schema(
          {
            dimension: { type: String, required: true },
            text: { type: String, required: true, maxlength: 300 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    explanation: { type: String, required: true, maxlength: 1000 },
    explanationSource: { type: String, enum: ["llm", "template"], required: true },
    provider: { type: String, trim: true },
    providerModel: { type: String, trim: true },
    inputsUpdatedAt: {
      userOne: { type: Date, required: true },
      userTwo: { type: Date, required: true },
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

matchInsightSchema.index({ userOne: 1, userTwo: 1 }, { unique: true });

export const MatchInsight: Model<IMatchInsight> = model<IMatchInsight>(
  "MatchInsight",
  matchInsightSchema,
);
