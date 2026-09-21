import { Schema, model, Types, type Document, type Model } from "mongoose";
import { toJSONOptions } from "../utils/mongooseOptions";

export interface IFeatureFlag extends Document {
  key: string;
  enabled: boolean;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const featureFlagSchema = new Schema<IFeatureFlag>(
  {
    key: { type: String, required: true, unique: true, trim: true },
    enabled: { type: Boolean, required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, toJSON: toJSONOptions },
);

export const FeatureFlag: Model<IFeatureFlag> = model<IFeatureFlag>("FeatureFlag", featureFlagSchema);
