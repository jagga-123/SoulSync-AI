import { User } from "../models/User.model";
import { ApiError } from "../utils/ApiError";
import { signToken } from "../utils/jwt";
import { childLogger } from "../config/logger";
import { events } from "../platform/events";
import type { LoginInput, RegisterInput } from "../validators/auth.validator";
import { attributeReferral } from "./referral.service";
import { assertRegistrationAllowed, consumeInvite } from "./waitlist.service";

const log = childLogger("auth");

export async function registerUser(input: RegisterInput) {
  // No-op unless the `waitlist_mode` feature flag is on.
  await assertRegistrationAllowed({
    email: input.email,
    inviteCode: input.inviteCode,
    referralCode: input.referralCode,
  });

  const existing = await User.findOne({ email: input.email });
  if (existing) {
    throw ApiError.conflict("An account with this email already exists");
  }

  const user = await User.create({
    fullName: input.fullName,
    email: input.email,
    password: input.password,
  });

  // Growth side effects are best-effort: a broken invite link must never cost
  // someone their account.
  if (input.referralCode) {
    await attributeReferral(user.id, input.referralCode).catch((err) => log.warn({ err }, "referral attribution failed"));
  }
  await consumeInvite(input.email).catch((err) => log.warn({ err }, "waitlist invite bookkeeping failed"));

  events.emit("user.registered", { userId: user.id, email: user.email, fullName: user.fullName });

  return user.toJSON();
}

export async function loginUser(input: LoginInput) {
  const user = await User.findOne({ email: input.email }).select("+password");
  if (!user) {
    throw ApiError.unauthorized("Invalid email or password");
  }

  const isMatch = await user.comparePassword(input.password);
  if (!isMatch) {
    throw ApiError.unauthorized("Invalid email or password");
  }

  // Checked after the password so status is never revealed to someone who
  // doesn't know the credentials.
  if (user.status === "suspended") {
    throw new ApiError(403, "Your account has been suspended. Contact support if you think this is a mistake.", {
      code: "ACCOUNT_SUSPENDED",
    });
  }

  const token = signToken({ id: user.id, role: user.role });

  return { user: user.toJSON(), token };
}

export async function getUserById(id: string) {
  const user = await User.findById(id);
  if (!user) {
    throw ApiError.notFound("User not found");
  }
  return user.toJSON();
}
