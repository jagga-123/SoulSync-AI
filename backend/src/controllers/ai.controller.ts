import type { Request, Response } from "express";
import { ZodError } from "zod";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { isValidObjectId } from "../utils/objectId";
import { recommendationsQuerySchema, type InterviewAnswerInput } from "../validators/ai.validator";
import * as interviewService from "../services/ai-interview.service";
import * as aiProfileService from "../services/ai-profile.service";
import * as aiMatchService from "../services/ai-match.service";
import { resolveRecommendationLimit } from "../services/premium.service";

export const getStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const status = await aiProfileService.getAIStatus(req.user.id);
  res.status(200).json(new ApiResponse("AI status fetched", { status }));
});

export const getInterview = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const interview = await interviewService.getInterviewState(req.user.id);
  res.status(200).json(new ApiResponse("Interview fetched", { interview }));
});

export const startInterview = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const interview = await interviewService.startInterview(req.user.id);
  res.status(200).json(new ApiResponse("Interview ready", { interview }));
});

export const answerInterview = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { content } = req.body as InterviewAnswerInput;

  const result = await interviewService.submitAnswer(req.user.id, content);
  res.status(200).json(
    new ApiResponse(result.completed ? "Interview complete" : "Answer recorded", {
      interview: result.state,
      completed: result.completed,
      aiProfile: result.aiProfile ?? null,
    }),
  );
});

export const completeInterview = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { state, aiProfile } = await interviewService.completeInterview(req.user.id);
  res.status(200).json(new ApiResponse("Interview complete", { interview: state, aiProfile }));
});

export const restartInterview = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const interview = await interviewService.restartInterview(req.user.id);
  res.status(200).json(new ApiResponse("Interview restarted", { interview }));
});

export const getMyAIProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const aiProfile = await aiProfileService.getAIProfile(req.user.id);
  if (!aiProfile) {
    throw ApiError.notFound("You haven't completed the AI interview yet.");
  }
  res.status(200).json(new ApiResponse("AI profile fetched", { aiProfile }));
});

export const getRecommendations = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  let query;
  try {
    query = recommendationsQuerySchema.parse(req.query);
  } catch (err) {
    if (err instanceof ZodError) {
      throw ApiError.unprocessable(
        "Invalid query parameters",
        err.errors.map((e) => ({ path: e.path.join("."), message: e.message })),
      );
    }
    throw err;
  }

  // With `priority_recommendations` on, free users see fewer; otherwise no cap.
  const { limit, capped, cap } = await resolveRecommendationLimit(req.user.id, query.limit);
  const result = await aiMatchService.getRecommendations(req.user.id, limit);
  res.status(200).json(new ApiResponse("Recommendations fetched", { ...result, capped, cap }));
});

export const getCompatibility = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { userId } = req.params;
  if (!userId || !isValidObjectId(userId)) throw ApiError.badRequest("Invalid user id");

  const lookup = await aiMatchService.getCompatibilityWith(req.user.id, userId);
  res.status(200).json(
    new ApiResponse(
      lookup.available ? "Compatibility fetched" : "Compatibility not available yet",
      lookup.available
        ? { available: true, compatibility: lookup.compatibility }
        : { available: false, reason: lookup.reason },
    ),
  );
});
