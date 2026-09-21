import { Schema, model, Types, type Document, type Model } from "mongoose";
import bcrypt from "bcryptjs";

export type UserRole = "user" | "admin";
export type UserStatus = "active" | "suspended";

export interface IUser extends Document {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
  // --- Phase 6 (all optional/defaulted, so existing accounts are unaffected) ---
  /** Documents created before Phase 6 have no status and count as active. */
  status: UserStatus;
  suspendedAt?: Date;
  suspendedReason?: string;
  emailVerified: boolean;
  emailVerification?: { tokenHash: string; expiresAt: Date };
  referralCode?: string;
  referredBy?: Types.ObjectId;
  lastActiveAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const SALT_ROUNDS = 12;

const userSchema = new Schema<IUser>(
  {
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please provide a valid email"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 8,
      select: false,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    status: { type: String, enum: ["active", "suspended"], default: "active" },
    suspendedAt: { type: Date },
    suspendedReason: { type: String, trim: true, maxlength: 300 },
    emailVerified: { type: Boolean, default: false },
    emailVerification: {
      type: new Schema({ tokenHash: String, expiresAt: Date }, { _id: false }),
      select: false,
    },
    referralCode: { type: String, unique: true, sparse: true, uppercase: true, trim: true },
    referredBy: { type: Schema.Types.ObjectId, ref: "User" },
    lastActiveAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.password;
        delete ret.emailVerification;
        delete ret.__v;
        delete ret._id;
        return ret;
      },
    },
  },
);

userSchema.index({ createdAt: -1 });
userSchema.index({ lastActiveAt: -1 });
userSchema.index({ status: 1 });

userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
  next();
});

userSchema.methods.comparePassword = function comparePassword(
  candidate: string,
): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

export const User: Model<IUser> = model<IUser>("User", userSchema);
