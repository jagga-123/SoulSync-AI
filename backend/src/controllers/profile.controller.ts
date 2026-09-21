import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import * as profileService from "../services/profile.service";
import type { CreateProfileInput, UpdateProfileInput } from "../validators/profile.validator";

export const createProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const profile = await profileService.createProfile(req.user.id, req.body as CreateProfileInput);
  res.status(201).json(new ApiResponse("Profile created successfully", { profile }));
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const profile = await profileService.updateProfile(req.user.id, req.body as UpdateProfileInput);
  res.status(200).json(new ApiResponse("Profile updated successfully", { profile }));
});

export const getMyProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const profile = await profileService.getProfileByUserId(req.user.id);
  res.status(200).json(new ApiResponse("Profile fetched successfully", { profile }));
});
