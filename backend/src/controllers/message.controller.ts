import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { isValidObjectId } from "../utils/objectId";
import * as messageService from "../services/message.service";
import { getIO } from "../socket";
import type { SendMessageInput } from "../validators/message.validator";

export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const message = await messageService.sendMessage(req.user.id, req.body as SendMessageInput);

  // Also reachable over REST (not just the socket `send_message` event) —
  // still push it live to whichever connected sessions the participants have.
  const io = getIO();
  io?.to(`user:${message.receiverId}`).emit("message_received", { message });
  io?.to(`user:${message.senderId}`).emit("message_sent", { message });

  res.status(201).json(new ApiResponse("Message sent", { message }));
});

export const markRead = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { messageId } = req.params;
  if (!messageId || !isValidObjectId(messageId)) throw ApiError.badRequest("Invalid message id");

  const message = await messageService.markMessageRead(messageId, req.user.id);

  const io = getIO();
  io?.to(`user:${message.senderId}`).emit("message_read", {
    messageId: message.id,
    conversationId: message.conversationId,
    readAt: message.updatedAt,
  });

  res.status(200).json(new ApiResponse("Message marked as read", { message }));
});
