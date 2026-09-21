"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  Clock,
  Loader2,
  Lock,
  MessageCircle,
  RotateCcw,
  Send,
  Sparkles,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AIAvatar } from "@/components/ai/ai-avatar";
import { AnalyzingScreen } from "@/components/ai/analyzing-screen";
import { InterviewProgress } from "@/components/ai/interview-progress";
import { StreamingText } from "@/components/ai/streaming-text";
import { ThinkingIndicator } from "@/components/ai/thinking-indicator";
import { useLockPageScroll } from "@/hooks/use-lock-page-scroll";
import { useRequireAuth } from "@/hooks/use-require-auth";
import {
  completeInterview,
  getAIStatus,
  getInterview,
  restartInterview,
  startInterview,
  submitInterviewAnswer,
} from "@/lib/api/ai";
import { ApiClientError } from "@/lib/api-client";
import { categoryLabel } from "@/lib/ai-format";
import type { InterviewMessage, InterviewState } from "@/types/api";

const MAX_ANSWER_LENGTH = 1000;
// The analysis screen is held at least this long so its steps register
// instead of flashing by when the analysis returns instantly.
const MIN_ANALYSIS_DISPLAY_MS = 2600;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiClientError ? err.message : fallback;
}

export function InterviewView() {
  const { user, isLoading: isAuthLoading } = useRequireAuth();

  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [interview, setInterview] = useState<InterviewState | null>(null);
  const [hasBasicProfile, setHasBasicProfile] = useState(true);
  const [personalityType, setPersonalityType] = useState<string | null>(null);

  const [draft, setDraft] = useState("");
  const [pendingAnswer, setPendingAnswer] = useState<string | null>(null);
  const [streamId, setStreamId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // The chat layout fills the viewport and scrolls internally; the intro screen
  // is an ordinary page and must stay scrollable.
  const inChatLayout = phase === "ready" && interview !== null && interview.status !== "not_started";
  useLockPageScroll(inChatLayout);

  // --- initial load ---------------------------------------------------------
  useEffect(() => {
    if (!user) return;
    let active = true;

    Promise.all([getInterview(), getAIStatus()])
      .then(([interviewRes, statusRes]) => {
        if (!active) return;
        setInterview(interviewRes.interview);
        setHasBasicProfile(statusRes.status.hasBasicProfile);
        setPersonalityType(statusRes.status.aiProfile?.personalityType ?? null);
        setPhase("ready");
      })
      .catch((err) => {
        if (!active) return;
        setError(errorMessage(err, "Couldn't load your interview. Please try again."));
        setPhase("error");
      });

    return () => {
      active = false;
    };
  }, [user]);

  // An analysis started elsewhere (another tab, a dropped connection) is
  // still running server-side: poll until it lands rather than sitting stuck.
  const serverAnalyzing = interview?.status === "analyzing" && !isAnalyzing;
  useEffect(() => {
    if (!serverAnalyzing) return;
    const timer = setInterval(() => {
      getInterview()
        .then((res) => setInterview(res.interview))
        .catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, [serverAnalyzing]);

  // --- scrolling ------------------------------------------------------------
  const messageCount = interview?.messages.length ?? 0;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messageCount, pendingAnswer]);

  // Follow the text while it streams in, but never yank the view if the user
  // has scrolled up to reread something.
  const followStream = useCallback(() => {
    const el = scrollRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  // --- actions --------------------------------------------------------------
  async function handleStart() {
    setIsStarting(true);
    setError(null);
    try {
      const res = await startInterview();
      setInterview(res.interview);
      const first = res.interview.messages[0];
      if (first?.role === "assistant" && res.interview.progress.answered === 0) setStreamId(first.id);
    } catch (err) {
      if (err instanceof ApiClientError && (err.details as { code?: string } | undefined)?.code === "PROFILE_REQUIRED") {
        setHasBasicProfile(false);
      } else {
        setError(errorMessage(err, "Couldn't start the interview. Please try again."));
      }
    } finally {
      setIsStarting(false);
    }
  }

  async function handleSend() {
    const content = draft.trim();
    if (!content || pendingAnswer !== null || isAnalyzing) return;

    setError(null);
    setPendingAnswer(content);
    setDraft("");

    try {
      const res = await submitInterviewAnswer(content);
      setInterview(res.interview);
      if (res.aiProfile) setPersonalityType(res.aiProfile.personalityType);

      const last = res.interview.messages[res.interview.messages.length - 1];
      if (!res.completed && last?.role === "assistant") setStreamId(last.id);
    } catch (err) {
      // Give the text back so nothing the user wrote is lost.
      setDraft(content);
      if (err instanceof ApiClientError && err.status === 409) {
        // Out of sync with the server (e.g. answered in another tab) — reload.
        getInterview()
          .then((res) => setInterview(res.interview))
          .catch(() => {});
      }
      setError(errorMessage(err, "Something went wrong sending that. Please try again."));
    } finally {
      setPendingAnswer(null);
      inputRef.current?.focus();
    }
  }

  async function handleFinish() {
    setError(null);
    setIsAnalyzing(true);
    try {
      const [res] = await Promise.all([completeInterview(), sleep(MIN_ANALYSIS_DISPLAY_MS)]);
      setInterview(res.interview);
      setPersonalityType(res.aiProfile.personalityType);
    } catch (err) {
      setError(errorMessage(err, "The analysis didn't finish. Please try again."));
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleRestart() {
    setIsRestarting(true);
    setError(null);
    try {
      const res = await restartInterview();
      setInterview(res.interview);
      setConfirmRestart(false);
      const first = res.interview.messages[0];
      if (first?.role === "assistant") setStreamId(first.id);
    } catch (err) {
      setError(errorMessage(err, "Couldn't restart the interview. Please try again."));
    } finally {
      setIsRestarting(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    handleSend();
  }

  // --- render ---------------------------------------------------------------
  if (isAuthLoading || phase === "loading") {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-white/50" />
      </div>
    );
  }

  if (phase === "error" || !interview) {
    return (
      <div className="mx-auto max-w-md px-4 py-32">
        <Alert variant="destructive">
          <AlertDescription>{error ?? "Something went wrong."}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (interview.status === "not_started") {
    return (
      <IntroPanel
        hasBasicProfile={hasBasicProfile}
        isStarting={isStarting}
        error={error}
        onStart={handleStart}
      />
    );
  }

  const isCompleted = interview.status === "completed";
  const awaitingAnswer = interview.status === "in_progress" && pendingAnswer === null;
  const showAnalyzing = isAnalyzing || interview.status === "analyzing";

  return (
    <div className="mx-auto flex h-svh max-w-2xl flex-col pt-20 sm:pt-24">
      <header className="glass sticky top-20 z-10 shrink-0 px-4 py-3 sm:top-24 sm:px-6">
        <div className="flex items-center gap-3">
          <AIAvatar active={pendingAnswer !== null || showAnalyzing} className="size-10" />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-sm font-semibold text-white">AI Interview</h1>
            <p className="truncate text-xs text-white/45">
              {isCompleted
                ? "Complete"
                : interview.progress.currentCategory
                  ? `Topic: ${interview.progress.currentCategory}`
                  : "Getting to know you"}
            </p>
          </div>
          {!isCompleted && interview.progress.answered > 0 && !showAnalyzing && (
            <RestartControl
              confirming={confirmRestart}
              busy={isRestarting}
              onAsk={() => setConfirmRestart(true)}
              onCancel={() => setConfirmRestart(false)}
              onConfirm={handleRestart}
            />
          )}
        </div>
        <div className="mt-3">
          <InterviewProgress progress={interview.progress} />
        </div>
      </header>

      {error && (
        <div className="shrink-0 px-4 pt-3 sm:px-6">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}

      <div
        ref={scrollRef}
        data-lenis-prevent
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6"
      >
        {showAnalyzing ? (
          <div className="flex h-full items-center">
            <AnalyzingScreen />
          </div>
        ) : (
          <>
            {interview.messages.map((message) =>
              message.role === "assistant" ? (
                <AssistantMessage
                  key={message.id}
                  message={message}
                  animate={message.id === streamId}
                  onProgress={followStream}
                />
              ) : (
                <UserMessage key={message.id} content={message.content} />
              ),
            )}
            {pendingAnswer !== null && <UserMessage content={pendingAnswer} animateIn />}
            <AnimatePresence>{pendingAnswer !== null && <ThinkingIndicator />}</AnimatePresence>
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-white/10 bg-background/60 p-3 backdrop-blur-xl sm:p-4">
        {isCompleted ? (
          <CompletedPanel
            personalityType={personalityType}
            confirming={confirmRestart}
            busy={isRestarting}
            onAsk={() => setConfirmRestart(true)}
            onCancel={() => setConfirmRestart(false)}
            onConfirm={handleRestart}
          />
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={MAX_ANSWER_LENGTH}
                rows={2}
                disabled={!awaitingAnswer || showAnalyzing}
                aria-label="Your answer"
                placeholder="Type your answer…"
                className="max-h-40 min-h-[3.25rem] flex-1 resize-none rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-white/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!draft.trim() || !awaitingAnswer || showAnalyzing}
                aria-label="Send answer"
                className="size-11 shrink-0 rounded-full bg-gradient-brand text-white shadow-lg shadow-primary/25 hover:opacity-90 disabled:opacity-40"
              >
                <Send className="size-4" />
              </Button>
            </div>

            <div className="mt-2 flex items-center justify-between gap-3 px-1 text-[11px] text-white/40">
              <span className="hidden sm:inline">Enter to send · Shift+Enter for a new line</span>
              <span className="tabular-nums">
                {draft.length}/{MAX_ANSWER_LENGTH}
              </span>
              {interview.progress.canFinish && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleFinish}
                  disabled={pendingAnswer !== null || showAnalyzing}
                  className="ml-auto gap-1.5 rounded-full border-accent/40 bg-accent/10 text-accent hover:bg-accent/20"
                >
                  <Sparkles className="size-3.5" />
                  Finish &amp; analyse
                </Button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// pieces
// ---------------------------------------------------------------------------

function AssistantMessage({
  message,
  animate,
  onProgress,
}: {
  message: InterviewMessage;
  animate: boolean;
  onProgress: () => void;
}) {
  return (
    <motion.div
      initial={animate ? { opacity: 0, y: 12 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-end gap-2.5"
    >
      <AIAvatar />
      <div className="min-w-0 max-w-[85%]">
        <span className="mb-1 block pl-1 text-[10px] font-medium uppercase tracking-wider text-white/35">
          {categoryLabel(message.category)}
        </span>
        <div className="glass rounded-2xl rounded-bl-md px-4 py-3 text-sm leading-relaxed text-white/90">
          <StreamingText text={message.content} animate={animate} onProgress={onProgress} />
        </div>
      </div>
    </motion.div>
  );
}

function UserMessage({ content, animateIn = false }: { content: string; animateIn?: boolean }) {
  return (
    <motion.div
      initial={animateIn ? { opacity: 0, y: 12, scale: 0.98 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="flex justify-end"
    >
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-gradient-brand px-4 py-2.5 text-white">
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{content}</p>
      </div>
    </motion.div>
  );
}

function RestartControl({
  confirming,
  busy,
  onAsk,
  onCancel,
  onConfirm,
  label = "Start over",
  prompt = "Discard your answers?",
}: {
  confirming: boolean;
  busy: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  label?: string;
  prompt?: string;
}) {
  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onAsk}
        className="gap-1.5 text-white/50 hover:bg-white/5 hover:text-white"
      >
        <RotateCcw className="size-3.5" />
        <span className="hidden sm:inline">{label}</span>
        <span className="sm:hidden sr-only">{label}</span>
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="hidden text-xs text-white/55 sm:inline">{prompt}</span>
      <Button
        type="button"
        size="sm"
        onClick={onConfirm}
        disabled={busy}
        className="gap-1.5 rounded-full bg-destructive/80 text-white hover:bg-destructive"
      >
        {busy && <Loader2 className="size-3.5 animate-spin" />}
        Restart
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onCancel}
        disabled={busy}
        className="text-white/60 hover:bg-white/5 hover:text-white"
      >
        Cancel
      </Button>
    </div>
  );
}

function CompletedPanel({
  personalityType,
  confirming,
  busy,
  onAsk,
  onCancel,
  onConfirm,
}: {
  personalityType: string | null;
  confirming: boolean;
  busy: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
          <CheckCircle2 className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Your interview is complete</p>
          <p className="text-xs text-white/55">
            {personalityType ? (
              <>
                SoulSync sees you as <span className="text-white/85">{personalityType}</span>.
              </>
            ) : (
              "Your personality report is ready."
            )}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          asChild
          className="gap-2 rounded-full bg-gradient-brand text-white shadow-lg shadow-primary/25 hover:opacity-90"
        >
          <Link href="/personality-report">
            View my personality report
            <ArrowRight className="size-4" />
          </Link>
        </Button>
        <Button
          asChild
          variant="outline"
          className="rounded-full border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]"
        >
          <Link href="/discover">Find my matches</Link>
        </Button>
        <div className="sm:ml-auto">
          <RestartControl
            confirming={confirming}
            busy={busy}
            onAsk={onAsk}
            onCancel={onCancel}
            onConfirm={onConfirm}
            label="Retake interview"
            prompt="Replace this interview with a new one?"
          />
        </div>
      </div>
    </div>
  );
}

const INTRO_POINTS = [
  {
    icon: MessageCircle,
    title: "A conversation, not a form",
    body: "Answer 15–25 friendly questions in your own words. Each one builds on what you said.",
  },
  {
    icon: Brain,
    title: "AI reads between the lines",
    body: "We work out your personality, values, lifestyle and how you communicate — then match on that.",
  },
  {
    icon: Lock,
    title: "Your report stays yours",
    body: "Only you see your full report. Matches see just what you have in common.",
  },
  {
    icon: Clock,
    title: "About 10 minutes",
    body: "You can stop after 15 answers and pick it back up any time.",
  },
];

function IntroPanel({
  hasBasicProfile,
  isStarting,
  error,
  onStart,
}: {
  hasBasicProfile: boolean;
  isStarting: boolean;
  error: string | null;
  onStart: () => void;
}) {
  return (
    <div className="relative mx-auto max-w-2xl px-4 py-28 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="text-center"
      >
        <div className="flex justify-center">
          <AIAvatar active className="size-16" />
        </div>
        <h1 className="mt-6 font-display text-3xl font-semibold text-white sm:text-4xl">
          Let&apos;s get to <span className="text-gradient-brand">know you</span>
        </h1>
        <p className="mx-auto mt-3 max-w-md text-pretty text-white/55">
          Instead of swiping on photos, you&apos;ll chat with SoulSync AI. It learns who you really are
          — then finds people who genuinely fit.
        </p>
      </motion.div>

      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        {INTRO_POINTS.map((point, index) => (
          <motion.div
            key={point.title}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1 + index * 0.07, ease: [0.16, 1, 0.3, 1] }}
            className="glass rounded-2xl p-5"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10">
              <point.icon className="size-4 text-accent" />
            </span>
            <h2 className="mt-3 text-sm font-semibold text-white">{point.title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-white/55">{point.body}</p>
          </motion.div>
        ))}
      </div>

      {error && (
        <Alert variant="destructive" className="mt-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="mt-8 flex flex-col items-center gap-3">
        {hasBasicProfile ? (
          <Button
            onClick={onStart}
            disabled={isStarting}
            size="lg"
            className="gap-2 rounded-full bg-gradient-brand px-8 text-white shadow-lg shadow-primary/25 hover:opacity-90"
          >
            {isStarting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {isStarting ? "Starting…" : "Start the interview"}
          </Button>
        ) : (
          <div className="glass flex flex-col items-center gap-3 rounded-2xl px-6 py-5 text-center">
            <p className="text-sm text-white/70">
              Finish your basic profile first — the interview builds on it.
            </p>
            <Button
              asChild
              className="gap-2 rounded-full bg-gradient-brand text-white shadow-lg shadow-primary/25 hover:opacity-90"
            >
              <Link href="/onboarding">
                Complete my profile
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
