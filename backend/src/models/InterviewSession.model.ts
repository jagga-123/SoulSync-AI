import { Schema, model, Types, type Document, type Model } from "mongoose";
import { INTERVIEW_CATEGORIES, type InterviewCategory } from "../ai/taxonomy";

export const INTERVIEW_STATUSES = ["in_progress", "analyzing", "completed"] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export const INTERVIEW_ROLES = ["assistant", "user"] as const;
export type InterviewRole = (typeof INTERVIEW_ROLES)[number];

export interface IInterviewMessage {
  id: string;
  role: InterviewRole;
  content: string;
  category: InterviewCategory;
  createdAt: Date;
}

export interface IInterviewSession extends Document {
  userId: Types.ObjectId;
  status: InterviewStatus;
  messages: IInterviewMessage[];
  answeredCount: number;
  /** True while the last message is a question the user hasn't answered.
   * The atomic compare-and-set on this flag is what makes a double-submitted
   * answer a clean 409 instead of two answers to one question. */
  awaitingAnswer: boolean;
  analysisStartedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IInterviewMessage>(
  {
    role: { type: String, enum: INTERVIEW_ROLES, required: true },
    content: { type: String, required: true, maxlength: 2000 },
    category: { type: String, enum: INTERVIEW_CATEGORIES, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  {
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

const interviewSessionSchema = new Schema<IInterviewSession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    status: { type: String, enum: INTERVIEW_STATUSES, default: "in_progress", required: true },
    messages: { type: [messageSchema], default: [] },
    answeredCount: { type: Number, default: 0, min: 0 },
    awaitingAnswer: { type: Boolean, default: false },
    analysisStartedAt: { type: Date },
    completedAt: { type: Date },
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

export const InterviewSession: Model<IInterviewSession> = model<IInterviewSession>(
  "InterviewSession",
  interviewSessionSchema,
);
