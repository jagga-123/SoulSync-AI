import { Schema, model, Types, type Document, type Model } from "mongoose";

export const GENDER_OPTIONS = ["male", "female", "non-binary", "other"] as const;
export const RELATIONSHIP_GOAL_OPTIONS = [
  "casual",
  "serious",
  "friendship",
  "not-sure",
] as const;

export type Gender = (typeof GENDER_OPTIONS)[number];
export type RelationshipGoal = (typeof RELATIONSHIP_GOAL_OPTIONS)[number];

export interface IProfile extends Document {
  userId: Types.ObjectId;
  age: number;
  gender: Gender;
  city: string;
  bio: string;
  interests: string[];
  relationshipGoal: RelationshipGoal;
  profileImage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const profileSchema = new Schema<IProfile>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    age: {
      type: Number,
      required: [true, "Age is required"],
      min: [18, "You must be at least 18 years old"],
      max: 120,
    },
    gender: {
      type: String,
      enum: GENDER_OPTIONS,
      required: [true, "Gender is required"],
    },
    city: {
      type: String,
      required: [true, "City is required"],
      trim: true,
      maxlength: 100,
    },
    bio: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    interests: {
      type: [String],
      default: [],
      validate: {
        validator: (value: string[]) => value.length <= 20,
        message: "You can list at most 20 interests",
      },
    },
    relationshipGoal: {
      type: String,
      enum: RELATIONSHIP_GOAL_OPTIONS,
      required: [true, "Relationship goal is required"],
    },
    profileImage: {
      type: String,
      trim: true,
      default: undefined,
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

export const Profile: Model<IProfile> = model<IProfile>("Profile", profileSchema);
