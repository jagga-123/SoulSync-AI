import { z } from "zod";
import { GENDER_OPTIONS, RELATIONSHIP_GOAL_OPTIONS } from "@/types/api";

export const profileFormSchema = z.object({
  age: z.coerce
    .number({ invalid_type_error: "Age is required" })
    .int("Age must be a whole number")
    .min(18, "You must be at least 18 years old")
    .max(120, "Please provide a valid age"),
  gender: z.enum(GENDER_OPTIONS, { required_error: "Please select a gender" }),
  city: z
    .string()
    .trim()
    .min(1, "City is required")
    .max(100, "City must be at most 100 characters"),
  bio: z.string().trim().max(500, "Bio must be at most 500 characters").optional(),
  interests: z.array(z.string().trim().min(1)).max(20, "You can list at most 20 interests").optional(),
  relationshipGoal: z.enum(RELATIONSHIP_GOAL_OPTIONS, {
    required_error: "Please select a relationship goal",
  }),
  profileImage: z
    .string()
    .trim()
    .url("Must be a valid URL")
    .optional()
    .or(z.literal("")),
});
export type ProfileFormValues = z.infer<typeof profileFormSchema>;
