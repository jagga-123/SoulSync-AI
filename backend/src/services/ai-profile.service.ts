import { Types } from "mongoose";
import { AIProfile, type IAIProfile } from "../models/AIProfile.model";
import { InterviewSession } from "../models/InterviewSession.model";
import { Profile } from "../models/Profile.model";
import { INTERVIEW_MAX_ANSWERS, INTERVIEW_MIN_ANSWERS } from "../ai/taxonomy";
import { resolveProviderName } from "../ai/providers";
import type { AnalysisResult } from "../ai/types";
import { events } from "../platform/events";

export async function getAIProfile(userId: string): Promise<IAIProfile | null> {
  return AIProfile.findOne({ userId: new Types.ObjectId(userId) });
}

/** Creates or replaces a user's AI profile (re-taking the interview
 * overwrites the previous analysis; createdAt is preserved). */
export async function saveAIProfile(
  userId: string,
  analysis: AnalysisResult,
  interviewAnswerCount: number,
): Promise<IAIProfile> {
  const { provider, model, ...rest } = analysis;

  const update: Record<string, unknown> = {
    $set: {
      ...rest,
      interviewAnswerCount,
      ...(provider ? { provider } : {}),
      ...(model ? { providerModel: model } : {}),
    },
  };
  // A heuristic re-analysis must not keep the provider of an earlier LLM one.
  if (!provider || !model) {
    update.$unset = {
      ...(provider ? {} : { provider: 1 }),
      ...(model ? {} : { providerModel: 1 }),
    };
  }

  const isFirst = !(await AIProfile.exists({ userId: new Types.ObjectId(userId) }));
  const saved = await AIProfile.findOneAndUpdate({ userId: new Types.ObjectId(userId) }, update, {
    upsert: true,
    new: true,
    runValidators: true,
    setDefaultsOnInsert: true,
  });
  events.emit("ai_profile.saved", { userId, isFirst });
  return saved as IAIProfile;
}

export type InterviewStatusLabel = "not_started" | "in_progress" | "analyzing" | "completed";

export interface AIStatus {
  hasBasicProfile: boolean;
  aiProviderConfigured: boolean;
  interview: {
    status: InterviewStatusLabel;
    answered: number;
    min: number;
    max: number;
    canFinish: boolean;
  };
  hasAIProfile: boolean;
  aiProfile: {
    personalityType: string;
    communicationStyle: string;
    summary: string;
    strengths: string[];
    confidenceScore: number;
    analysisSource: string;
    updatedAt: Date;
  } | null;
}

/** Everything the dashboard needs about a user's AI journey in one round trip. */
export async function getAIStatus(userId: string): Promise<AIStatus> {
  const objectId = new Types.ObjectId(userId);

  const [profileExists, session, aiProfile] = await Promise.all([
    Profile.exists({ userId: objectId }),
    InterviewSession.findOne({ userId: objectId }),
    AIProfile.findOne({ userId: objectId }),
  ]);

  const answered = session?.answeredCount ?? 0;
  const status: InterviewStatusLabel = session ? session.status : "not_started";

  return {
    hasBasicProfile: Boolean(profileExists),
    aiProviderConfigured: resolveProviderName() !== null,
    interview: {
      status,
      answered,
      min: INTERVIEW_MIN_ANSWERS,
      max: INTERVIEW_MAX_ANSWERS,
      canFinish: status === "in_progress" && answered >= INTERVIEW_MIN_ANSWERS,
    },
    hasAIProfile: Boolean(aiProfile),
    aiProfile: aiProfile
      ? {
          personalityType: aiProfile.personalityType,
          communicationStyle: aiProfile.communicationStyle,
          summary: aiProfile.summary,
          strengths: aiProfile.strengths,
          confidenceScore: aiProfile.confidenceScore,
          analysisSource: aiProfile.analysisSource,
          updatedAt: aiProfile.updatedAt,
        }
      : null,
  };
}
