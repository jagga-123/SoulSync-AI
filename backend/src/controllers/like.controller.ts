import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { isValidObjectId } from "../utils/objectId";
import * as likeService from "../services/like.service";

export const sendLike = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { userId } = req.params;
  if (!userId || !isValidObjectId(userId)) throw ApiError.badRequest("Invalid user id");

  const like = await likeService.sendLike(req.user.id, userId);
  res.status(201).json(new ApiResponse("Like sent", { like }));
});

export const getIncoming = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const likes = await likeService.getIncomingLikes(req.user.id);
  res.status(200).json(new ApiResponse("Incoming likes fetched", { likes }));
});

export const getOutgoing = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const likes = await likeService.getOutgoingLikes(req.user.id);
  res.status(200).json(new ApiResponse("Outgoing likes fetched", { likes }));
});

export const acceptLike = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { likeId } = req.params;
  if (!likeId || !isValidObjectId(likeId)) throw ApiError.badRequest("Invalid like id");

  const match = await likeService.acceptLike(likeId, req.user.id);
  res.status(200).json(new ApiResponse("Like accepted — it's a match!", { match }));
});

export const rejectLike = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { likeId } = req.params;
  if (!likeId || !isValidObjectId(likeId)) throw ApiError.badRequest("Invalid like id");

  const like = await likeService.rejectLike(likeId, req.user.id);
  res.status(200).json(new ApiResponse("Like rejected", { like }));
});
