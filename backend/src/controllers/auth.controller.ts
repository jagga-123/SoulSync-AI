import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import * as authService from "../services/auth.service";
import type { LoginInput, RegisterInput } from "../validators/auth.validator";

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
