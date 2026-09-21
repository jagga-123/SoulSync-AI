import { Schema, model, Types, type Document, type Model } from "mongoose";
import {
  COMMUNICATION_STYLES,
  TRAIT_KEYS,
  type CommunicationStyle,
  type TraitScores,
} from "../ai/taxonomy";

export const ANALYSIS_SOURCES = ["llm", "heuristic"] as const;
export type AnalysisSourceValue = (typeof ANALYSIS_SOURCES)[number];

export interface IAIProfile extends Document {
  userId: Types.ObjectId;
  personalityType: string;
  traitScores: TraitScores;
  communicationStyle: CommunicationStyle;
  interests: string[];
  values: string[];
  lifestyleTraits: string[];
  emotionalTraits: string[];
  relationshipGoals: string[];
  strengths: string[];
  summary: string;
  confidenceScore: number;
  analysisSource: AnalysisSourceValue;
  provider?: string;
  // Not `model`: that name is taken by Mongoose's Document#model().
  providerModel?: string;
  interviewAnswerCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const traitScoresSchema = new Schema(
  Object.fromEntries(
    TRAIT_KEYS.map((key) => [key, { type: Number, required: true, min: 0, max: 100 }]),
  ),
  { _id: false },
);

const aiProfileSchema = new Schema<IAIProfile>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    personalityType: { type: String, required: true, trim: true, maxlength: 60 },
    traitScores: { type: traitScoresSchema, required: true },
    communicationStyle: { type: String, enum: COMMUNICATION_STYLES, required: true },
    interests: { type: [String], default: [] },
    values: { type: [String], default: [] },
    lifestyleTraits: { type: [String], default: [] },
    emotionalTraits: { type: [String], default: [] },
    relationshipGoals: { type: [String], default: [] },
    strengths: { type: [String], default: [] },
    summary: { type: String, required: true, maxlength: 1000 },
    confidenceScore: { type: Number, required: true, min: 0, max: 100 },
    analysisSource: { type: String, enum: ANALYSIS_SOURCES, required: true },
    provider: { type: String, trim: true },
    providerModel: { type: String, trim: true },
    interviewAnswerCount: { type: Number, required: true, min: 0 },
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

export const AIProfile: Model<IAIProfile> = model<IAIProfile>("AIProfile", aiProfileSchema);
