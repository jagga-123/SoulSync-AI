export type AIProviderName = "claude" | "openai" | "gemini" | "groq";

/**
 * One provider-neutral, single-turn completion. Everything the interview,
 * analysis and explanation features need fits this shape, which is what keeps
 * swapping (or adding) a provider to a single new file.
 */
export interface AICompletionRequest {
  system: string;
  prompt: string;
  maxOutputTokens: number;
  /** Ask the provider for JSON output where it has a native mode. */
  json?: boolean;
  /** Reasoning-depth hint, honored by providers that expose one. */
  effort?: "low" | "medium" | "high";
  /** Sampling temperature, honored by Groq and Gemini; left to each provider's default when unset. */
  temperature?: number;
}

export interface AICompletion {
  text: string;
  provider: AIProviderName;
  model: string;
}

export interface AIProvider {
  readonly name: AIProviderName;
  readonly model: string;
  complete(request: AICompletionRequest): Promise<AICompletion>;
}

export type AIProviderErrorKind = "refusal" | "empty" | "upstream";

export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly kind: AIProviderErrorKind,
    public readonly provider: AIProviderName,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

export interface ProviderOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs: number;
}
