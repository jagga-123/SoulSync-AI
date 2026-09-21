import { apiFetch } from "@/lib/api-client";
import type {
  AIProfile,
  AIRecommendation,
  AIStatus,
  CompatibilityLookup,
  InterviewState,
} from "@/types/api";

export function getAIStatus() {
  return apiFetch<{ status: AIStatus }>("/ai/status");
}

export function getInterview() {
  return apiFetch<{ interview: InterviewState }>("/ai/interview");
}

export function startInterview() {
  return apiFetch<{ interview: InterviewState }>("/ai/interview/start", { method: "POST" });
}

export function submitInterviewAnswer(content: string) {
  return apiFetch<{
    interview: InterviewState;
    completed: boolean;
    aiProfile: AIProfile | null;
  }>("/ai/interview/answer", { method: "POST", body: { content } });
}

export function completeInterview() {
  return apiFetch<{ interview: InterviewState; aiProfile: AIProfile }>("/ai/interview/complete", {
    method: "POST",
  });
}

export function restartInterview() {
  return apiFetch<{ interview: InterviewState }>("/ai/interview/restart", { method: "POST" });
}

export function getMyAIProfile() {
  return apiFetch<{ aiProfile: AIProfile }>("/ai/profile/me");
}

export function getRecommendations(limit = 10) {
  return apiFetch<{ viewerReady: boolean; recommendations: AIRecommendation[] }>(
    `/ai/recommendations?limit=${limit}`,
  );
}

export function getCompatibility(userId: string) {
  return apiFetch<CompatibilityLookup>(`/ai/compatibility/${userId}`);
}
