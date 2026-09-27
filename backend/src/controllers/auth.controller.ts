import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import * as authService from "../services/auth.service";
import * as accountService from "../services/account.service";
import type { ForgotPasswordInput, LoginInput, RegisterInput, ResetPasswordInput } from "../validators/auth.validator";

export const register = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.registerUser(req.body as RegisterInput);
  res.status(201).json(new ApiResponse("Account created successfully", { user }));
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { user, token } = await authService.loginUser(req.body as LoginInput);
  res.status(200).json(new ApiResponse("Logged in successfully", { user, token }));
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const user = await authService.getUserById(req.user.id);
  res.status(200).json(new ApiResponse("Current user fetched", { user }));
});

/** Always the same response, whether or not the address has an account — see `account.service.ts`. */
export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body as ForgotPasswordInput;
  await accountService.requestPasswordReset(email);
  res.status(200).json(new ApiResponse("If that email has an account, we've sent a reset link.", { ok: true }));
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { token, password } = req.body as ResetPasswordInput;
  await accountService.resetPassword(token, password);
  res.status(200).json(new ApiResponse("Password reset. Please sign in with your new password.", { ok: true }));
});
