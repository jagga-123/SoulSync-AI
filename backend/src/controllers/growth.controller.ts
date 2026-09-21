import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { parseOrThrow, requireObjectId } from "../utils/parse";
import { inviteBody, waitlistBody } from "../validators/platform.validator";
import * as referrals from "../services/referral.service";
import * as waitlist from "../services/waitlist.service";
import { recordProfileView } from "../services/profile-view.service";

function userId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

export const referralSummary = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(new ApiResponse("Referral summary fetched", await referrals.getReferralSummary(userId(req))));
});

export const sendInvites = asyncHandler(async (req: Request, res: Response) => {
  const { emails } = parseOrThrow(inviteBody, req.body);
  const result = await referrals.sendInvites(userId(req), emails);
  res.status(200).json(new ApiResponse("Invitations sent", result));
});

/** Public. Responds identically whether or not the address was already listed. */
export const joinWaitlist = asyncHandler(async (req: Request, res: Response) => {
  const { email, referralCode } = parseOrThrow(waitlistBody, req.body);
  const result = await waitlist.joinWaitlist(email, referralCode);
  res.status(200).json(new ApiResponse("You're on the waitlist", result));
});

export const profileView = asyncHandler(async (req: Request, res: Response) => {
  const target = requireObjectId(req.params.userId, "user id");
  const result = await recordProfileView(userId(req), target);
  res.status(200).json(new ApiResponse("Profile view recorded", result));
});
