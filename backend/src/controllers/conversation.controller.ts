import type { Request, Response } from "express";
import { z, ZodError } from "zod";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { isValidObjectId } from "../utils/objectId";
import * as conversationService from "../services/conversation.service";

const messagesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
});

export const getConversations = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const conversations = await conversationService.getConversationsForUser(req.user.id);
  res.status(200).json(new ApiResponse("Conversations fetched", { conversations }));
});

export const getMessages = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { id } = req.params;
  if (!id || !isValidObjectId(id)) throw ApiError.badRequest("Invalid conversation id");

  let query;
  try {
    query = messagesQuerySchema.parse(req.query);
  } catch (err) {
    if (err instanceof ZodError) {
      throw ApiError.unprocessable(
        "Invalid query parameters",
        err.errors.map((e) => ({ path: e.path.join("."), message: e.message })),
      );
    }
    throw err;
  }

  const result = await conversationService.getMessages(id, req.user.id, query.page, query.limit);
  res.status(200).json(new ApiResponse("Messages fetched", result));
});

export const startConversation = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { matchId } = req.params;
  if (!matchId || !isValidObjectId(matchId)) throw ApiError.badRequest("Invalid match id");

  const conversation = await conversationService.startConversation(matchId, req.user.id);
  res.status(200).json(new ApiResponse("Conversation ready", { conversation }));
});
