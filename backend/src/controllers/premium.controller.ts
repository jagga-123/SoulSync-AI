import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import * as premium from "../services/premium.service";

function userId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

export const likeAllowance = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(new ApiResponse("Like allowance fetched", { allowance: await premium.getLikeAllowance(userId(req)) }));
});

export const boostStatus = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(new ApiResponse("Boost status fetched", { boost: await premium.getBoostStatus(userId(req)) }));
});

export const activateBoost = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(new ApiResponse("Your profile is boosted", { boost: await premium.activateBoost(userId(req)) }));
});

export const getDeepAnalysis = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(new ApiResponse("Deep analysis fetched", await premium.getDeepAnalysis(userId(req))));
});

export const createDeepAnalysis = asyncHandler(async (req: Request, res: Response) => {
  const force = req.query.force === "true";
  res.status(200).json(new ApiResponse("Deep analysis ready", await premium.createDeepAnalysis(userId(req), { force })));
});

export const readReceipts = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(new ApiResponse("Read receipt insights fetched", await premium.getReadReceiptInsights(userId(req))));
});
