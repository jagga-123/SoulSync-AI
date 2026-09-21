import type { CommunicationStyle, InterviewCategory, TraitScores } from "./taxonomy";

export interface InterviewTurn {
  category: InterviewCategory;
  question: string;
  answer: string;
}

/** The public, user-entered profile context passed alongside the interview. */
export interface ProfileContext {
  bio: string;
  interests: string[];
  relationshipGoal: string;
}

export interface AnalysisInput {
  turns: InterviewTurn[];
  profile?: ProfileContext;
}

export type AnalysisSource = "llm" | "heuristic";

/** Everything the analysis engine produces — persisted as an AIProfile. */
export interface AnalysisResult {
  personalityType: string;
  traitScores: TraitScores;
  communicationStyle: CommunicationStyle;
  interests: string[];
  values: string[];
  lifestyleTraits: string[];
  emotionalTraits: string[];
  relationshipGoals: string[];
  strengths: string[];
  summary: string;
  confidenceScore: number;
  analysisSource: AnalysisSource;
  provider?: string;
  model?: string;
}

/** The vector of traits the compatibility engine compares. */
export interface CompatibilityProfile {
  interests: string[];
  communicationStyle: CommunicationStyle | null;
  values: string[];
  lifestyleTraits: string[];
  emotionalTraits: string[];
  relationshipGoals: string[];
  traitScores: TraitScores | null;
}
