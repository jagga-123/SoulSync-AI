import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { parseOrThrow, requireObjectId } from "../utils/parse";
import { blockBody, reportBody } from "../validators/platform.validator";
import * as blocks from "../services/block.service";
import * as reports from "../services/report.service";

function userId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

export const createReport = asyncHandler(async (req: Request, res: Response) => {
  const body = parseOrThrow(reportBody, req.body);
  const report = await reports.createReport(userId(req), body);
  res.status(201).json(new ApiResponse("Thanks — your report was sent to our moderators", { reportId: report.id }));
});

export const listBlocks = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(new ApiResponse("Blocked users fetched", { blocks: await blocks.listBlockedUsers(userId(req)) }));
});

export const block = asyncHandler(async (req: Request, res: Response) => {
  const body = parseOrThrow(blockBody, req.body);
  await blocks.blockUser(userId(req), body.userId);
  res.status(200).json(new ApiResponse("User blocked", { userId: body.userId }));
});

export const unblock = asyncHandler(async (req: Request, res: Response) => {
  const target = requireObjectId(req.params.userId, "user id");
  await blocks.unblockUser(userId(req), target);
  res.status(200).json(new ApiResponse("User unblocked", { userId: target }));
});
