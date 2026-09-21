export type UserRole = "user" | "admin";

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  /** Phase 6: whether the email address has been verified. */
  emailVerified?: boolean;
  createdAt: string;
  updatedAt: string;
}

export const GENDER_OPTIONS = ["male", "female", "non-binary", "other"] as const;
export type Gender = (typeof GENDER_OPTIONS)[number];

export const RELATIONSHIP_GOAL_OPTIONS = [
  "casual",
  "serious",
  "friendship",
  "not-sure",
] as const;
export type RelationshipGoal = (typeof RELATIONSHIP_GOAL_OPTIONS)[number];

export interface UserProfile {
  id: string;
  userId: string;
  age: number;
  gender: Gender;
  city: string;
  bio: string;
  interests: string[];
  relationshipGoal: RelationshipGoal;
  profileImage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiSuccessBody<T> {
  success: true;
  message: string;
  data: T;
}

export interface ApiErrorBody {
  success: false;
  message: string;
  error?: unknown;
}

export interface FieldError {
  path: string;
  message: string;
}

/** Another user's public card data — no email, no role. Shared by
 * discover, likes, and matches responses. */
export interface PublicProfile {
  id: string;
  fullName: string;
  age: number;
  city: string;
  bio: string;
  interests: string[];
  relationshipGoal: RelationshipGoal;
  profileImage?: string;
}

export interface DiscoverPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

/** A discover candidate: the public profile plus, when both people have done
 * the AI interview, an AI compatibility score. `ai: null` means "not
 * available for this pair"; `undefined` means the API predates Phase 5. */
export type DiscoverUser = PublicProfile & { ai?: AIMatchSummary | null };

export interface DiscoverResult {
  users: DiscoverUser[];
  pagination: DiscoverPagination;
  /** True when the signed-in user has an AI profile (so scores can exist). */
  aiReady?: boolean;
}

export type LikeStatus = "pending" | "accepted" | "rejected";

export interface LikeRecord {
  id: string;
  senderId: string;
  receiverId: string;
  status: LikeStatus;
  createdAt: string;
  updatedAt: string;
}

export interface LikeEntry {
  likeId: string;
  status: LikeStatus;
  createdAt: string;
  user: PublicProfile;
}

export interface MatchEntry {
  matchId: string;
  compatibilityScore: number;
  matchedAt: string;
  sharedInterests: string[];
  user: PublicProfile;
}

export interface ConversationRecord {
  id: string;
  participants: string[];
  lastMessage: string | null;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationListItem {
  conversationId: string;
  user: PublicProfile;
  lastMessage: string | null;
  lastMessageAt: string;
  unreadCount: number;
}

export type MessageType = "text" | "image";

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  content: string;
  type: MessageType;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MessagesPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface MessagesResult {
  messages: ChatMessage[];
  pagination: MessagesPagination;
}

// ---------------------------------------------------------------------------
// Phase 5 — AI interview, personality report, AI compatibility
// ---------------------------------------------------------------------------

export type InterviewStatus = "not_started" | "in_progress" | "analyzing" | "completed";

export interface InterviewMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  category: string;
  createdAt: string;
}

export interface InterviewProgress {
  answered: number;
  min: number;
  max: number;
  percent: number;
  canFinish: boolean;
  currentCategory: string | null;
}

export interface InterviewState {
  status: InterviewStatus;
  messages: InterviewMessage[];
  progress: InterviewProgress;
  hasAIProfile: boolean;
}

export interface TraitScores {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  emotionalStability: number;
}

export type CommunicationStyle =
  | "direct"
  | "empathetic"
  | "analytical"
  | "playful"
  | "reserved"
  | "expressive"
  | "balanced";

export interface AIProfile {
  id: string;
  userId: string;
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
  /** "llm" = written by an AI provider; "heuristic" = SoulSync's built-in engine. */
  analysisSource: "llm" | "heuristic";
  provider?: string;
  providerModel?: string;
  interviewAnswerCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AIStatus {
  hasBasicProfile: boolean;
  aiProviderConfigured: boolean;
  interview: {
    status: InterviewStatus;
    answered: number;
    min: number;
    max: number;
    canFinish: boolean;
  };
  hasAIProfile: boolean;
  aiProfile: {
    personalityType: string;
    communicationStyle: CommunicationStyle;
    summary: string;
    strengths: string[];
    confidenceScore: number;
    analysisSource: "llm" | "heuristic";
    updatedAt: string;
  } | null;
}

export type CompatibilityTier = "exceptional" | "strong" | "promising" | "exploring";

export type CompatibilityDimension =
  | "values"
  | "interests"
  | "communication"
  | "lifestyle"
  | "relationshipGoals"
  | "personality";

export interface AIMatchSummary {
  score: number;
  tier: CompatibilityTier;
  reasons: string[];
}

export interface DimensionScore {
  score: number;
  weight: number;
  available: boolean;
}

export interface AICompatibilityDetail extends AIMatchSummary {
  breakdown: Record<CompatibilityDimension, DimensionScore>;
  reasonDetails: { dimension: CompatibilityDimension; text: string }[];
  explanation: string;
  explanationSource: "llm" | "template";
  shared: {
    interests: string[];
    values: string[];
    lifestyleTraits: string[];
    relationshipGoals: string[];
  };
}

export type CompatibilityLookup =
  | { available: true; compatibility: AICompatibilityDetail }
  | { available: false; reason: "viewer_not_ready" | "other_not_ready" };

export interface AIRecommendation {
  user: PublicProfile;
  ai: AIMatchSummary & { explanation: string };
}
