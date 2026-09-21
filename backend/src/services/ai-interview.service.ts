import { Types } from "mongoose";
import { ApiError } from "../utils/ApiError";
import {
  InterviewSession,
  type IInterviewMessage,
  type IInterviewSession,
} from "../models/InterviewSession.model";
import { Profile } from "../models/Profile.model";
import type { IAIProfile } from "../models/AIProfile.model";
import { analyzeInterview } from "../ai/analysis";
import { generateNextQuestion } from "../ai/interviewer";
import { pickBankQuestion } from "../ai/question-bank";
import { validateInterviewAnswer } from "../ai/sanitize";
import {
  CATEGORY_LABELS,
  INTERVIEW_MAX_ANSWERS,
  INTERVIEW_MIN_ANSWERS,
  type InterviewCategory,
} from "../ai/taxonomy";
import type { InterviewTurn, ProfileContext } from "../ai/types";
import { getAIProfile, saveAIProfile, type InterviewStatusLabel } from "./ai-profile.service";

const NOMINAL_INTERVIEW_LENGTH = 20;
// An "analyzing" claim older than this is assumed to belong to a crashed
// request and can be taken over.
const STALE_ANALYSIS_MS = 2 * 60 * 1000;

export interface InterviewMessageDTO {
  id: string;
  role: "assistant" | "user";
  content: string;
  category: InterviewCategory;
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
  status: InterviewStatusLabel;
  messages: InterviewMessageDTO[];
  progress: InterviewProgress;
  hasAIProfile: boolean;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function emptyState(hasAIProfile: boolean): InterviewState {
  return {
    status: "not_started",
    messages: [],
    progress: {
      answered: 0,
      min: INTERVIEW_MIN_ANSWERS,
      max: INTERVIEW_MAX_ANSWERS,
      percent: 0,
      canFinish: false,
      currentCategory: null,
    },
    hasAIProfile,
  };
}

function toState(session: IInterviewSession, hasAIProfile: boolean): InterviewState {
  const json = session.toJSON() as unknown as {
    messages: Array<Omit<IInterviewMessage, "createdAt"> & { createdAt: Date }>;
  };
  const messages: InterviewMessageDTO[] = json.messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    category: message.category,
    createdAt: new Date(message.createdAt).toISOString(),
  }));

  const last = messages[messages.length - 1];
  const awaiting = session.status === "in_progress" && last?.role === "assistant";

  return {
    status: session.status,
    messages,
    progress: {
      answered: session.answeredCount,
      min: INTERVIEW_MIN_ANSWERS,
      max: INTERVIEW_MAX_ANSWERS,
      percent: Math.min(100, Math.round((session.answeredCount / INTERVIEW_MAX_ANSWERS) * 100)),
      canFinish: session.status === "in_progress" && session.answeredCount >= INTERVIEW_MIN_ANSWERS,
      currentCategory: awaiting && last ? CATEGORY_LABELS[last.category] : null,
    },
    hasAIProfile,
  };
}

/** Answered (question → answer) pairs, oldest first. A trailing question the
 * user hasn't answered yet is not a turn. */
function buildTurns(messages: readonly IInterviewMessage[]): InterviewTurn[] {
  const turns: InterviewTurn[] = [];
  for (let i = 0; i < messages.length - 1; i++) {
    const question = messages[i];
    const answer = messages[i + 1];
    if (question?.role === "assistant" && answer?.role === "user") {
      turns.push({ category: question.category, question: question.content, answer: answer.content });
    }
  }
  return turns;
}

async function loadProfileContext(userId: Types.ObjectId): Promise<ProfileContext | undefined> {
  const profile = await Profile.findOne({ userId });
  if (!profile) return undefined;
  return {
    bio: profile.bio,
    interests: profile.interests,
    relationshipGoal: profile.relationshipGoal,
  };
}

async function requireBasicProfile(userId: Types.ObjectId): Promise<void> {
  const exists = await Profile.exists({ userId });
  if (!exists) {
    throw ApiError.conflict("Complete your basic profile before starting the AI interview.", {
      code: "PROFILE_REQUIRED",
    });
  }
}

async function findSession(userId: string): Promise<IInterviewSession | null> {
  return InterviewSession.findOne({ userId: new Types.ObjectId(userId) });
}

async function hasAIProfile(userId: string): Promise<boolean> {
  return Boolean(await getAIProfile(userId));
}

/** Generates and appends the next question. The compare-and-set on
 * `awaitingAnswer: false` guarantees only one concurrent caller writes it. */
async function appendNextQuestion(session: IInterviewSession): Promise<IInterviewSession> {
  const messages = session.messages as unknown as IInterviewMessage[];
  const asked = messages.filter((m) => m.role === "assistant").map((m) => m.content);
  const profile = await loadProfileContext(session.userId);

  const next = await generateNextQuestion({
    turns: buildTurns(messages),
    askedQuestions: asked,
    profile,
    nominalLength: NOMINAL_INTERVIEW_LENGTH,
  });

  const updated = await InterviewSession.findOneAndUpdate(
    { _id: session._id, status: "in_progress", awaitingAnswer: false },
    {
      $push: { messages: { role: "assistant", content: next.content, category: next.category } },
      $set: { awaitingAnswer: true },
    },
    { new: true },
  );
  return updated ?? ((await InterviewSession.findById(session._id)) as IInterviewSession);
}

// ---------------------------------------------------------------------------
// analysis + completion
// ---------------------------------------------------------------------------

/** Runs the analysis and marks the interview completed. Idempotent: calling
 * it for an already-completed interview returns the existing AI profile, and
 * a concurrent caller gets a 409 instead of running the analysis twice. */
async function runAnalysis(userId: string): Promise<IAIProfile> {
  const userObjectId = new Types.ObjectId(userId);
  const staleCutoff = new Date(Date.now() - STALE_ANALYSIS_MS);

  const claimed = await InterviewSession.findOneAndUpdate(
    {
      userId: userObjectId,
      $or: [
        { status: "in_progress" },
        { status: "analyzing", analysisStartedAt: { $lt: staleCutoff } },
      ],
    },
    { $set: { status: "analyzing", analysisStartedAt: new Date() } },
    { new: true },
  );

  if (!claimed) {
    const existing = await findSession(userId);
    if (!existing) throw ApiError.notFound("You haven't started the AI interview yet.");
    if (existing.status === "completed") {
      const profile = await getAIProfile(userId);
      if (profile) return profile;
    }
    throw ApiError.conflict("Your analysis is already in progress. Give it a moment.");
  }

  try {
    const messages = claimed.messages as unknown as IInterviewMessage[];
    const turns = buildTurns(messages);
    const profile = await loadProfileContext(userObjectId);

    const analysis = await analyzeInterview({ turns, profile });
    const aiProfile = await saveAIProfile(userId, analysis, turns.length);

    const update: Record<string, unknown> = {
      $set: { status: "completed", completedAt: new Date(), awaitingAnswer: false },
      $unset: { analysisStartedAt: 1 },
    };
    // Drop a trailing, never-answered question so the saved transcript ends
    // on the user's last answer.
    if (messages[messages.length - 1]?.role === "assistant") {
      update.$pop = { messages: 1 };
    }
    await InterviewSession.updateOne({ _id: claimed._id }, update);

    return aiProfile;
  } catch (err) {
    await InterviewSession.updateOne(
      { _id: claimed._id, status: "analyzing" },
      { $set: { status: "in_progress" }, $unset: { analysisStartedAt: 1 } },
    );
    throw err;
  }
}

// ---------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------

/** Current interview state. Also self-heals a session whose next question was
 * never written (e.g. the server restarted mid-request). */
export async function getInterviewState(userId: string): Promise<InterviewState> {
  let session = await findSession(userId);
  const hasProfile = await hasAIProfile(userId);
  if (!session) return emptyState(hasProfile);

  if (session.status === "in_progress" && !session.awaitingAnswer) {
    if (session.answeredCount >= INTERVIEW_MAX_ANSWERS) {
      await runAnalysis(userId);
      session = (await findSession(userId)) as IInterviewSession;
      return toState(session, true);
    }
    session = await appendNextQuestion(session);
  }
  return toState(session, hasProfile);
}

export async function startInterview(userId: string): Promise<InterviewState> {
  const userObjectId = new Types.ObjectId(userId);
  await requireBasicProfile(userObjectId);

  const existing = await findSession(userId);
  if (existing) return getInterviewState(userId);

  const opener = pickBankQuestion("personality", []);
  try {
    await InterviewSession.create({
      userId: userObjectId,
      status: "in_progress",
      awaitingAnswer: true,
      answeredCount: 0,
      messages: [{ role: "assistant", content: opener, category: "personality" }],
    });
  } catch (err) {
    // A concurrent start already created it — that's fine, fall through.
    if (!(typeof err === "object" && err !== null && (err as { code?: number }).code === 11000)) {
      throw err;
    }
  }
  return getInterviewState(userId);
}

export interface AnswerResult {
  state: InterviewState;
  completed: boolean;
  aiProfile?: IAIProfile;
}

export async function submitAnswer(userId: string, rawContent: string): Promise<AnswerResult> {
  const content = validateInterviewAnswer(rawContent);

  const session = await findSession(userId);
  if (!session) throw ApiError.notFound("Start the AI interview first.");
  if (session.status === "completed") {
    throw ApiError.conflict("Your interview is already complete. Start a new one to retake it.");
  }
  if (session.status === "analyzing") {
    throw ApiError.conflict("Your interview is being analyzed. Give it a moment.");
  }

  const messages = session.messages as unknown as IInterviewMessage[];
  const lastQuestion = messages[messages.length - 1];
  if (!session.awaitingAnswer || lastQuestion?.role !== "assistant") {
    throw ApiError.conflict("Please wait for the next question before answering.");
  }

  // Atomic: only one submission can flip awaitingAnswer true → false.
  const recorded = await InterviewSession.findOneAndUpdate(
    { _id: session._id, status: "in_progress", awaitingAnswer: true },
    {
      $push: { messages: { role: "user", content, category: lastQuestion.category } },
      $set: { awaitingAnswer: false },
      $inc: { answeredCount: 1 },
    },
    { new: true },
  );
  if (!recorded) {
    throw ApiError.conflict("That question was already answered. Please wait for the next one.");
  }

  if (recorded.answeredCount >= INTERVIEW_MAX_ANSWERS) {
    const aiProfile = await runAnalysis(userId);
    const finished = (await findSession(userId)) as IInterviewSession;
    return { state: toState(finished, true), completed: true, aiProfile };
  }

  const withQuestion = await appendNextQuestion(recorded);
  return { state: toState(withQuestion, await hasAIProfile(userId)), completed: false };
}

export async function completeInterview(
  userId: string,
): Promise<{ state: InterviewState; aiProfile: IAIProfile }> {
  const session = await findSession(userId);
  if (!session) throw ApiError.notFound("Start the AI interview first.");

  if (session.status !== "completed" && session.answeredCount < INTERVIEW_MIN_ANSWERS) {
    throw ApiError.conflict(
      `Answer at least ${INTERVIEW_MIN_ANSWERS} questions so the analysis has enough to go on (you're at ${session.answeredCount}).`,
    );
  }

  const aiProfile = await runAnalysis(userId);
  const finished = (await findSession(userId)) as IInterviewSession;
  return { state: toState(finished, true), aiProfile };
}

/** Discards the current interview and starts a fresh one. The existing AI
 * profile is kept (and keeps powering matches) until the new analysis replaces it. */
export async function restartInterview(userId: string): Promise<InterviewState> {
  const session = await findSession(userId);
  if (session?.status === "analyzing") {
    throw ApiError.conflict("Your interview is being analyzed. Give it a moment.");
  }
  if (session) await InterviewSession.deleteOne({ _id: session._id });
  return startInterview(userId);
}
