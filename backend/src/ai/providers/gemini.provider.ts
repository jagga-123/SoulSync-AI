import { GoogleGenAI } from "@google/genai";
import {
  AIProviderError,
  type AICompletion,
  type AICompletionRequest,
  type AIProvider,
  type ProviderOptions,
} from "./types";

export class GeminiProvider implements AIProvider {
  readonly name = "gemini" as const;
  readonly model: string;
  private readonly client: GoogleGenAI;

  constructor(options: ProviderOptions) {
    this.model = options.model;
    this.client = new GoogleGenAI({
      apiKey: options.apiKey,
      httpOptions: {
        ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
        timeout: options.timeoutMs,
      },
    });
  }

  async complete(request: AICompletionRequest): Promise<AICompletion> {
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: request.prompt,
        config: {
          systemInstruction: request.system,
          maxOutputTokens: request.maxOutputTokens,
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
          ...(request.json ? { responseMimeType: "application/json" } : {}),
        },
      });

      if (response.promptFeedback?.blockReason) {
        throw new AIProviderError("Gemini declined the request", "refusal", "gemini");
      }
      const finishReason = response.candidates?.[0]?.finishReason;
      if (finishReason === "SAFETY" || finishReason === "PROHIBITED_CONTENT") {
        throw new AIProviderError("Gemini declined the request", "refusal", "gemini");
      }

      const text = (response.text ?? "").trim();
      if (!text) throw new AIProviderError("Gemini returned no text", "empty", "gemini");

      return { text, provider: "gemini", model: this.model };
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      const message = err instanceof Error ? err.message : "Unknown error";
      throw new AIProviderError(`Gemini request failed: ${message}`, "upstream", "gemini");
    }
  }
}
