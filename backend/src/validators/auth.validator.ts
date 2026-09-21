import { z } from "zod";

export const registerSchema = z.object({
  body: z.object({
    fullName: z
      .string({ required_error: "Full name is required" })
      .trim()
      .min(2, "Full name must be at least 2 characters")
      .max(100, "Full name must be at most 100 characters"),
    email: z
      .string({ required_error: "Email is required" })
      .trim()
      .toLowerCase()
      .email("Please provide a valid email"),
    password: z
      .string({ required_error: "Password is required" })
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password must be at most 72 characters")
      .regex(/[a-zA-Z]/, "Password must contain at least one letter")
      .regex(/[0-9]/, "Password must contain at least one number"),
    // Phase 6 (optional): a friend's referral code, or a waitlist invite code.
    referralCode: z.string().trim().max(20).optional(),
    inviteCode: z.string().trim().max(40).optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z
      .string({ required_error: "Email is required" })
      .trim()
      .toLowerCase()
      .email("Please provide a valid email"),
    password: z.string({ required_error: "Password is required" }).min(1, "Password is required"),
  }),
});

export type RegisterInput = z.infer<typeof registerSchema>["body"];
export type LoginInput = z.infer<typeof loginSchema>["body"];
