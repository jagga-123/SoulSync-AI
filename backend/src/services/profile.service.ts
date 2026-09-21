import { Profile } from "../models/Profile.model";
import { ApiError } from "../utils/ApiError";
import { deleteStoredPhoto } from "./photo.service";
import type { CreateProfileInput, UpdateProfileInput } from "../validators/profile.validator";

export async function createProfile(userId: string, input: CreateProfileInput) {
  const existing = await Profile.findOne({ userId });
  if (existing) {
    throw ApiError.conflict("A profile already exists for this account. Use update instead.");
  }

  const profile = await Profile.create({ userId, ...input });
  return profile.toJSON();
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  // Replacing the photo? Remember the old one so its file can be cleaned up afterwards.
  const previousImage = "profileImage" in input ? (await Profile.findOne({ userId }).select("profileImage").lean())?.profileImage : undefined;

  const profile = await Profile.findOneAndUpdate(
    { userId },
    { $set: input },
    { new: true, runValidators: true, context: "query" },
  );

  if (!profile) {
    throw ApiError.notFound("Profile not found. Complete your profile first.");
  }

  if (previousImage && previousImage !== profile.profileImage) void deleteStoredPhoto(userId, previousImage);

  return profile.toJSON();
}

export async function getProfileByUserId(userId: string) {
  const profile = await Profile.findOne({ userId });
  if (!profile) {
    throw ApiError.notFound("Profile not found");
  }
  return profile.toJSON();
}
