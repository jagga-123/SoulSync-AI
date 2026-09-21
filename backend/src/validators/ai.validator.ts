import { z } from "zod";

// Generous raw ceiling — the precise 1,000-character rule (measured after
// control characters are stripped) lives in ai/sanitize.ts#validateInterviewAnswer,
// which gives the user a specific message. This just stops absurd payloads early.
export const interviewAnswerSchema = z.object({
  body: z.object({
    content: z
      .string({ required_error: "Answer is required", invalid_type_error: "Answer must be text" })
      .max(4000, "Answer is too long"),
  }),
});

export const recommendationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(30).optional().default(10),
});

export type InterviewAnswerInput = z.infer<typeof interviewAnswerSchema>["body"];
