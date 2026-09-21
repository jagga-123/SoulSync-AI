import OpenAI from "openai";
import {
  AIProviderError,
  type AICompletion,
  type AICompletionRequest,
  type AIProvider,
  type ProviderOptions,
} from "./types";

export class OpenAIProvider implements AIProvider {
  readonly name = "openai" as const;
  readonly model: string;
  private readonly client: OpenAI;

  constructor(options: ProviderOptions) {
    this.model = options.model;
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
      timeout: options.timeoutMs,
      // No SDK retries — see ClaudeProvider: bounded latency beats a retry
      // when an instant built-in fallback exists.
      maxRetries: 0,
    });
  }

  async complete(request: AICompletionRequest): Promise<AICompletion> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        max_completion_tokens: request.maxOutputTokens,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.prompt },
        ],
        ...(request.json ? { response_format: { type: "json_object" as const } } : {}),
      });

      const choice = response.choices[0];
      if (!choice) throw new AIProviderError("OpenAI returned no choices", "empty", "openai");

      if (choice.message.refusal || choice.finish_reason === "content_filter") {
        throw new AIProviderError("OpenAI declined the request", "refusal", "openai");
      }

      const text = (choice.message.content ?? "").trim();
      if (!text) throw new AIProviderError("OpenAI returned no text", "empty", "openai");

      return { text, provider: "openai", model: response.model ?? this.model };
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      const message = err instanceof Error ? err.message : "Unknown error";
      throw new AIProviderError(`OpenAI request failed: ${message}`, "upstream", "openai");
    }
  }
}
