import { z } from "zod";
import { MESSAGE_TYPE_OPTIONS } from "../models/Message.model";

export const sendMessageSchema = z.object({
  body: z.object({
    conversationId: z
      .string({ required_error: "conversationId is required" })
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid conversation id"),
    content: z
      .string({ required_error: "Message content is required" })
      .trim()
      .min(1, "Message can't be empty")
      .max(2000, "Message is too long"),
    type: z.enum(MESSAGE_TYPE_OPTIONS).optional().default("text"),
  }),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>["body"];
