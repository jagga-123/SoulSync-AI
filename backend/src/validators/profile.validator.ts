import { z } from "zod";
import { GENDER_OPTIONS, RELATIONSHIP_GOAL_OPTIONS } from "../models/Profile.model";

// Defined once, without defaults, so the same rules can be reused for both
// "create" (where a default makes sense) and "update" (where a default would
// silently overwrite an existing value the client simply didn't send).
const fields = {
  age: z.coerce
    .number({ required_error: "Age is required" })
    .int("Age must be a whole number")
    .min(18, "You must be at least 18 years old")
    .max(120, "Please provide a valid age"),
  gender: z.enum(GENDER_OPTIONS, {
    required_error: "Gender is required",
    invalid_type_error: "Please select a valid gender option",
  }),
  city: z
    .string({ required_error: "City is required" })
    .trim()
    .min(1, "City is required")
    .max(100, "City must be at most 100 characters"),
  bio: z.string().trim().max(500, "Bio must be at most 500 characters"),
  interests: z
    .array(z.string().trim().min(1).max(40))
    .max(20, "You can list at most 20 interests"),
  relationshipGoal: z.enum(RELATIONSHIP_GOAL_OPTIONS, {
    required_error: "Relationship goal is required",
    invalid_type_error: "Please select a valid relationship goal",
  }),
  profileImage: z
    .string()
    .trim()
    .url("Profile image must be a valid URL")
    .optional()
    .or(z.literal("").transform(() => undefined)),
};

export const createProfileSchema = z.object({
  body: z.object({
    age: fields.age,
    gender: fields.gender,
    city: fields.city,
    bio: fields.bio.optional().default(""),
    interests: fields.interests.optional().default([]),
    relationshipGoal: fields.relationshipGoal,
    profileImage: fields.profileImage,
  }),
});

export const updateProfileSchema = z.object({
  body: z
    .object({
      age: fields.age.optional(),
      gender: fields.gender.optional(),
      city: fields.city.optional(),
      bio: fields.bio.optional(),
      interests: fields.interests.optional(),
      relationshipGoal: fields.relationshipGoal.optional(),
      profileImage: fields.profileImage,
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "Provide at least one field to update",
    }),
});

export type CreateProfileInput = z.infer<typeof createProfileSchema>["body"];
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>["body"];
