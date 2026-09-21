import Anthropic from "@anthropic-ai/sdk";
import {
  AIProviderError,
  type AICompletion,
  type AICompletionRequest,
  type AIProvider,
  type ProviderOptions,
} from "./types";

interface ClaudeOptions extends ProviderOptions {
  refusalFallback: boolean;
}

function readText(content: ReadonlyArray<{ type: string }>): string {
  return content
    .map((block) => (block.type === "text" ? String((block as { text?: unknown }).text ?? "") : ""))
    .join("");
}

export class ClaudeProvider implements AIProvider {
  readonly name = "claude" as const;
  readonly model: string;
  private readonly client: Anthropic;
  private readonly refusalFallback: boolean;

  constructor(options: ClaudeOptions) {
    this.model = options.model;
    this.refusalFallback = options.refusalFallback;
    this.client = new Anthropic({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
      timeout: options.timeoutMs,
      // No SDK retries: a hung request would otherwise wait 2× the timeout,
      // and every caller already has an instant built-in fallback.
      maxRetries: 0,
    });
  }

  async complete(request: AICompletionRequest): Promise<AICompletion> {
    // No `temperature`/`top_p` — current Claude models reject them. Depth is
    // steered with `effort`; the interview's short, structured tasks run at
    // "low"/"medium" so thinking doesn't eat the latency budget.
    const params = {
      model: this.model,
      max_tokens: request.maxOutputTokens,
      system: request.system,
      messages: [{ role: "user" as const, content: request.prompt }],
      output_config: { effort: request.effort ?? "low" },
    };

    try {
      const response = this.refusalFallback
        ? await this.client.beta.messages.create({
            ...params,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
          })
        : await this.client.messages.create(params);

      if (response.stop_reason === "refusal") {
        throw new AIProviderError("Claude declined the request", "refusal", "claude");
      }

      const text = readText(response.content).trim();
      if (!text) throw new AIProviderError("Claude returned no text", "empty", "claude");

      return { text, provider: "claude", model: response.model ?? this.model };
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      const message = err instanceof Error ? err.message : "Unknown error";
      throw new AIProviderError(`Claude request failed: ${message}`, "upstream", "claude");
    }
  }
}
