import { z } from "zod";

/** The one password rule, shared by register, reset, and change-password so they can never drift apart. */
export const passwordField = z
  .string({ required_error: "Password is required" })
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters")
  .regex(/[a-zA-Z]/, "Password must contain at least one letter")
  .regex(/[0-9]/, "Password must contain at least one number");

const emailField = z
  .string({ required_error: "Email is required" })
  .trim()
  .toLowerCase()
  .email("Please provide a valid email");

export const registerSchema = z.object({
  body: z.object({
    fullName: z
      .string({ required_error: "Full name is required" })
      .trim()
      .min(2, "Full name must be at least 2 characters")
      .max(100, "Full name must be at most 100 characters"),
    email: emailField,
    password: passwordField,
    // Phase 6 (optional): a friend's referral code, or a waitlist invite code.
    referralCode: z.string().trim().max(20).optional(),
    inviteCode: z.string().trim().max(40).optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: emailField,
    password: z.string({ required_error: "Password is required" }).min(1, "Password is required"),
  }),
});

/** Always returns 200 regardless of whether the address is registered — the response must never
 * reveal which emails have accounts. */
export const forgotPasswordSchema = z.object({
  body: z.object({ email: emailField }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string({ required_error: "Reset token is required" }).min(10).max(600),
    password: passwordField,
  }),
});

export type RegisterInput = z.infer<typeof registerSchema>["body"];
export type LoginInput = z.infer<typeof loginSchema>["body"];
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>["body"];
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>["body"];
