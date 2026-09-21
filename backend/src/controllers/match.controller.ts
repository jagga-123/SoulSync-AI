import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import * as matchService from "../services/match.service";

export const getMatches = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const matches = await matchService.getMatchesForUser(req.user.id);
  res.status(200).json(new ApiResponse("Matches fetched", { matches }));
});
