import { env } from "../config/env";
import { childLogger } from "../config/logger";
import { createProvider } from "../ai/providers";
import type { AICompletion, AICompletionRequest, AIProvider, AIProviderName } from "../ai/providers/types";
import { aiRequestsTotal } from "../platform/metrics";

const log = childLogger("ai");

/** Groq answers in well under a second; if it hasn't in this long, Gemini gets the request. */
const PRIMARY_TIMEOUT_CAP_MS = 15_000;

export interface GenerateAIRequest {
  system: string;
  prompt: string;
  /** 0–2. Unset → each provider's default (Groq: 0.3 for JSON output, 0.7 otherwise). */
  temperature?: number;
  maxOutputTokens?: number;
  json?: boolean;
  effort?: AICompletionRequest["effort"];
  /** Only a label for logs and metrics ("interview question", "analysis", …). */
  task?: string;
}

export interface GenerateAIResponse {
  text: string;
  /** The provider that actually served this request — not necessarily the primary. */
  provider: AIProviderName;
  model: string;
}

/** Thrown when every configured provider failed (or none is configured). */
export class AllAIProvidersFailedError extends Error {
  constructor(
    message: string,
    public readonly attempts: Array<{ provider: AIProviderName; error: string }>,
  ) {
    super(message);
    this.name = "AllAIProvidersFailedError";
  }
}

const providers = new Map<AIProviderName, Promise<AIProvider>>();

/**
 * Providers in the order they are tried: Groq → Gemini → OpenAI → Anthropic,
 * each only if its key is set. (If all of them fail the caller falls back to
 * the built-in engine.)
 */
export function aiProviderChain(): AIProviderName[] {
  const keyed: Array<[AIProviderName, string | undefined]> = [
    ["groq", env.GROQ_API_KEY],
    ["gemini", env.GEMINI_API_KEY],
    ["openai", env.OPENAI_API_KEY],
    ["claude", env.ANTHROPIC_API_KEY],
  ];
  return keyed.filter(([, key]) => Boolean(key)).map(([name]) => name);
}

/** Provider errors can echo a request URL; never let an API key reach the logs or an error message. */
function redactKeys(text: string): string {
  return [env.GROQ_API_KEY, env.GEMINI_API_KEY, env.OPENAI_API_KEY, env.ANTHROPIC_API_KEY].reduce<string>(
    (out, key) => (key ? out.split(key).join("[key]") : out),
    text,
  );
}

function getProvider(name: AIProviderName): Promise<AIProvider> {
  let provider = providers.get(name);
  if (!provider) {
    // Groq is the primary: cap its timeout so a slow answer hands over to the fallback quickly.
    provider = createProvider(name, name === "groq" ? Math.min(env.AI_REQUEST_TIMEOUT_MS, PRIMARY_TIMEOUT_CAP_MS) : undefined);
    providers.set(name, provider);
  }
  return provider;
}

/** Test hook: drop the memoised providers so the next call re-reads the config. */
export function resetAIClientForTests(): void {
  providers.clear();
}

/**
 * One AI completion with automatic failover: Groq first, Gemini if Groq fails
 * for ANY reason (error, timeout, rate limit, empty or refused answer).
 * Returns the text plus the provider that produced it. Throws
 * AllAIProvidersFailedError only when every configured provider failed —
 * callers decide what "graceful" means then (the AI features fall back to the
 * built-in analysis engine, see `tryComplete`).
 */
export async function generateAIResponse(request: GenerateAIRequest): Promise<GenerateAIResponse> {
  const chain = aiProviderChain();
  const task = request.task ?? "unspecified";
  const attempts: Array<{ provider: AIProviderName; error: string }> = [];

  if (chain.length === 0) {
    throw new AllAIProvidersFailedError("No AI provider is configured (set GROQ_API_KEY and/or GEMINI_API_KEY)", attempts);
  }

  const completionRequest: AICompletionRequest = {
    system: request.system,
    prompt: request.prompt,
    maxOutputTokens: request.maxOutputTokens ?? 1024,
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    ...(request.json ? { json: true } : {}),
    ...(request.effort ? { effort: request.effort } : {}),
  };

  for (const name of chain) {
    const started = Date.now();
    try {
      const provider = await getProvider(name);
      const completion: AICompletion = await provider.complete(completionRequest);
      aiRequestsTotal.inc({ task, provider: name, status: "ok" });
      log.info(
        { task, provider: completion.provider, model: completion.model, ms: Date.now() - started, fallback: attempts.length > 0 },
        attempts.length > 0 ? `AI request served by fallback provider ${completion.provider}` : "AI request served",
      );
      return { text: completion.text, provider: completion.provider, model: completion.model };
    } catch (err) {
      const error = redactKeys(err instanceof Error ? err.message : String(err)).slice(0, 300);
      attempts.push({ provider: name, error });
      aiRequestsTotal.inc({ task, provider: name, status: "error" });
      log.warn({ task, provider: name, ms: Date.now() - started, error }, `AI provider ${name} failed`);
    }
  }

  throw new AllAIProvidersFailedError(
    `All AI providers failed — ${attempts.map((a) => `${a.provider}: ${a.error}`).join(" | ")}`,
    attempts,
  );
}
