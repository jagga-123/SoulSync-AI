import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { parseOrThrow } from "../utils/parse";
import { changePasswordBody, settingsBody, tokenBody } from "../validators/platform.validator";
import * as account from "../services/account.service";

function userId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  const { token } = parseOrThrow(tokenBody, req.body);
  await account.verifyEmail(token);
  res.status(200).json(new ApiResponse("Email verified", { verified: true }));
});

export const resendVerification = asyncHandler(async (req: Request, res: Response) => {
  const result = await account.issueVerificationEmail(userId(req));
  res
    .status(200)
    .json(new ApiResponse(result.alreadyVerified ? "Your email is already verified" : "Verification email sent", result));
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = parseOrThrow(changePasswordBody, req.body);
  const { token } = await account.changePassword(userId(req), currentPassword, newPassword);
  res.status(200).json(new ApiResponse("Password updated. You've been signed out on your other devices.", { token }));
});

export const revokeSessions = asyncHandler(async (req: Request, res: Response) => {
  await account.revokeSessions(userId(req));
  res.status(200).json(new ApiResponse("Signed out on every device.", { ok: true }));
});

export const getSettings = asyncHandler(async (req: Request, res: Response) => {
  const settings = await account.getSettings(userId(req));
  res.status(200).json(new ApiResponse("Settings fetched", { settings }));
});

export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const patch = parseOrThrow(settingsBody, req.body);
  const settings = await account.updateSettings(userId(req), patch);
  res.status(200).json(new ApiResponse("Settings saved", { settings }));
});

/** One-click unsubscribe. Accepts the token in the body (the web page) or the
 * query string (the email client's List-Unsubscribe POST). */
export const unsubscribe = asyncHandler(async (req: Request, res: Response) => {
  const raw = (req.body as { token?: string } | undefined)?.token ?? (typeof req.query.token === "string" ? req.query.token : "");
  const { token } = parseOrThrow(tokenBody, { token: raw });
  const result = await account.unsubscribe(token);
  res.status(200).json(new ApiResponse("You've been unsubscribed", result));
});
