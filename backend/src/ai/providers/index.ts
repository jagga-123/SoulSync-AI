import { env } from "../../config/env";
import type { AICompletion, AICompletionRequest, AIProvider, AIProviderName } from "./types";

export type { AIProvider, AIProviderName, AICompletion, AICompletionRequest } from "./types";
export { AIProviderError } from "./types";

/** Which provider the current configuration selects, or null for the
 * built-in engine. With GROQ_API_KEY set that is always "groq" (Gemini
 * standing behind it as the fallback — see services/aiClient.ts); only
 * AI_PROVIDER=local overrides it. */
export function resolveProviderName(): AIProviderName | null {
  if (env.AI_PROVIDER === "local") return null;
  if (env.GROQ_API_KEY) return "groq";

  switch (env.AI_PROVIDER) {
    case "claude":
    case "openai":
    case "gemini":
      return env.AI_PROVIDER;
    case "auto":
    default:
      if (env.ANTHROPIC_API_KEY) return "claude";
      if (env.OPENAI_API_KEY) return "openai";
      if (env.GEMINI_API_KEY) return "gemini";
      return null;
  }
}

let providerPromise: Promise<AIProvider | null> | undefined;

/** Builds one provider from the current config. `timeoutMs` overrides AI_REQUEST_TIMEOUT_MS (used for the fast primary). */
export async function createProvider(name: AIProviderName, timeoutMs: number = env.AI_REQUEST_TIMEOUT_MS): Promise<AIProvider> {
  // Loaded lazily so only the configured provider's SDK is ever imported.
  switch (name) {
    case "claude": {
      const { ClaudeProvider } = await import("./claude.provider");
      return new ClaudeProvider({
        apiKey: env.ANTHROPIC_API_KEY as string,
        model: env.ANTHROPIC_MODEL,
        baseUrl: env.ANTHROPIC_BASE_URL,
        timeoutMs,
        refusalFallback: env.ANTHROPIC_REFUSAL_FALLBACK,
      });
    }
    case "openai": {
      const { OpenAIProvider } = await import("./openai.provider");
      return new OpenAIProvider({
        apiKey: env.OPENAI_API_KEY as string,
        model: env.OPENAI_MODEL,
        baseUrl: env.OPENAI_BASE_URL,
        timeoutMs,
      });
    }
    case "gemini": {
      const { GeminiProvider } = await import("./gemini.provider");
      return new GeminiProvider({
        apiKey: env.GEMINI_API_KEY as string,
        model: env.GEMINI_MODEL,
        baseUrl: env.GEMINI_BASE_URL,
        timeoutMs,
      });
    }
    case "groq": {
      const { GroqProvider } = await import("./groq.provider");
      return new GroqProvider({
        apiKey: env.GROQ_API_KEY as string,
        model: env.GROQ_MODEL,
        baseUrl: env.GROQ_BASE_URL,
        timeoutMs,
      });
    }
  }
}

/** The configured provider, or null when the built-in engine should be used. */
export function getAIProvider(): Promise<AIProvider | null> {
  if (!providerPromise) {
    const name = resolveProviderName();
    providerPromise = name ? createProvider(name) : Promise.resolve(null);
  }
  return providerPromise;
}

/**
 * Runs a completion against the configured provider and never throws: any
 * failure (timeout, refusal, outage, malformed config) is logged and reported
 * as `null`, which callers treat as "use the built-in engine". This is the one
 * place the LLM-or-fallback decision is made, so the interview can't die
 * because a vendor is having a bad day.
 */
export async function tryComplete(
  task: string,
  request: AICompletionRequest,
): Promise<AICompletion | null> {
  try {
    if (resolveProviderName() === "groq") {
      // Groq → Gemini failover lives in services/aiClient.ts; the provider that
      // really answered comes back on the completion (and is stored with it).
      const { generateAIResponse } = await import("../../services/aiClient");
      return await generateAIResponse({ ...request, task });
    }
    const provider = await getAIProvider();
    if (!provider) return null;
    return await provider.complete(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[ai] ${task}: provider failed, using built-in engine — ${message}`);
    return null;
  }
}
