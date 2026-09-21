import type { Request, Response } from "express";
import { z, ZodError } from "zod";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import * as discoverService from "../services/discover.service";
import * as aiMatchService from "../services/ai-match.service";
import { assertPerk } from "../features/entitlements";
import { advancedDiscoverQuery } from "../validators/platform.validator";
import { RELATIONSHIP_GOAL_OPTIONS } from "../models/Profile.model";

const discoverQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(50).optional().default(12),
    city: z.string().trim().min(1).max(100).optional(),
    relationshipGoal: z.enum(RELATIONSHIP_GOAL_OPTIONS).optional(),
  })
  // Phase 6 advanced filters (Premium): age range, gender, interests.
  .merge(advancedDiscoverQuery)
  .refine((q) => q.ageMin === undefined || q.ageMax === undefined || q.ageMin <= q.ageMax, {
    message: "Minimum age can't be above maximum age",
    path: ["ageMin"],
  });

export const getDiscoverUsers = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  let filters;
  try {
    filters = discoverQuerySchema.parse(req.query);
  } catch (err) {
    if (err instanceof ZodError) {
      throw ApiError.unprocessable(
        "Invalid query parameters",
        err.errors.map((e) => ({ path: e.path.join("."), message: e.message })),
      );
    }
    throw err;
  }

  const usesAdvancedFilters =
    filters.ageMin !== undefined || filters.ageMax !== undefined || filters.gender !== undefined || (filters.interests?.length ?? 0) > 0;
  // 403 if the feature is switched off, 402 if the user's plan doesn't include it.
  if (usesAdvancedFilters) await assertPerk(req.user.id, "advanced_filters");

  const result = await discoverService.discoverUsers(req.user.id, filters);

  // Phase 5: each candidate gets an AI compatibility score + top reasons (or
  // `ai: null` if either side hasn't done the interview). Additive — the
  // existing `users` and `pagination` fields are unchanged.
  const { viewerReady, users } = await aiMatchService.attachAIScores(req.user.id, result.users);

  res
    .status(200)
    .json(new ApiResponse("Discover results fetched", { ...result, users, aiReady: viewerReady }));
});
