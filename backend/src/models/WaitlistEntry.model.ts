import { Schema, model, type Document, type Model } from "mongoose";
import { toJSONOptions } from "../utils/mongooseOptions";

export interface IWaitlistEntry extends Document {
  email: string;
  position: number;
  referralCode?: string;
  status: "waiting" | "invited" | "joined";
  /** Single-use code that lets this person register while waitlist mode is on. */
  inviteCode?: string;
  invitedAt?: Date;
  joinedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const waitlistEntrySchema = new Schema<IWaitlistEntry>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    position: { type: Number, required: true },
    referralCode: { type: String, trim: true, uppercase: true },
    status: { type: String, enum: ["waiting", "invited", "joined"], default: "waiting" },
    inviteCode: { type: String, unique: true, sparse: true },
    invitedAt: { type: Date },
    joinedAt: { type: Date },
  },
  { timestamps: true, toJSON: toJSONOptions },
);

waitlistEntrySchema.index({ status: 1, position: 1 });

export const WaitlistEntry: Model<IWaitlistEntry> = model<IWaitlistEntry>("WaitlistEntry", waitlistEntrySchema);
