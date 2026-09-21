import { Schema, model, Types, type Document, type Model } from "mongoose";
import { toJSONOptions } from "../utils/mongooseOptions";

export interface IBlock extends Document {
  blockerId: Types.ObjectId;
  blockedId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const blockSchema = new Schema<IBlock>(
  {
    blockerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    blockedId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, toJSON: toJSONOptions },
);

blockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });
blockSchema.index({ blockedId: 1 });

export const Block: Model<IBlock> = model<IBlock>("Block", blockSchema);
