import {
  AIProviderError,
  type AICompletion,
  type AICompletionRequest,
  type AIProvider,
  type ProviderOptions,
} from "./types";

const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";

/**
 * Groq's free tier limits tokens per minute and says how long to wait ("try again in 1.2s"). A wait
 * this short is cheaper than handing the request to the fallback, so it is worth exactly one retry.
 */
const MAX_RETRY_WAIT_MS = 2000;

/** How long Groq asks us to wait: the `retry-after` header (seconds), else "try again in 1.2s" / "in 340ms" in the message. */
export function retryAfterMs(header: string | null, body: string): number | null {
  const seconds = header !== null && header.trim() !== "" ? Number(header) : Number.NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const match = body.match(/try again in ([\d.]+)\s*(ms|s)\b/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Math.round(match[2]?.toLowerCase() === "ms" ? value : value * 1000);
}

/** Structured extraction wants steadier output than a conversational question. */
const JSON_TEMPERATURE = 0.3;
const CHAT_TEMPERATURE = 0.7;

interface ChatCompletionResponse {
  model?: string;
  choices?: Array<{ finish_reason?: string; message?: { content?: string | null } }>;
}

/**
 * Groq's OpenAI-compatible chat endpoint, over plain fetch (no SDK). Groq is
 * the primary provider because it answers in a fraction of a second, which
 * matters here: the interview makes one model call per answer.
 * https://console.groq.com/docs/api-reference#chat-create
 */
export class GroqProvider implements AIProvider {
  readonly name = "groq" as const;
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: ProviderOptions) {
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs;
  }

  private send(request: AICompletionRequest): Promise<Response> {
    return fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        max_completion_tokens: request.maxOutputTokens,
        temperature: request.temperature ?? (request.json ? JSON_TEMPERATURE : CHAT_TEMPERATURE),
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.prompt },
        ],
        ...(request.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
  }

  async complete(request: AICompletionRequest): Promise<AICompletion> {
    try {
      let response = await this.send(request);

      if (response.status === 429) {
        const wait = retryAfterMs(response.headers.get("retry-after"), await response.clone().text().catch(() => ""));
        if (wait !== null && wait <= MAX_RETRY_WAIT_MS) {
          await new Promise((resolve) => setTimeout(resolve, wait + 50));
          response = await this.send(request);
        }
      }

      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 300);
        throw new AIProviderError(`Groq request failed: HTTP ${response.status} ${detail}`.trim(), "upstream", "groq");
      }

      const json = (await response.json()) as ChatCompletionResponse;
      const choice = json.choices?.[0];
      if (!choice) throw new AIProviderError("Groq returned no choices", "empty", "groq");
      if (choice.finish_reason === "content_filter") throw new AIProviderError("Groq declined the request", "refusal", "groq");

      const text = (choice.message?.content ?? "").trim();
      if (!text) throw new AIProviderError("Groq returned no text", "empty", "groq");

      return { text, provider: "groq", model: json.model ?? this.model };
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      const message = err instanceof Error ? err.message : "Unknown error";
      throw new AIProviderError(`Groq request failed: ${message}`, "upstream", "groq");
    }
  }
}
