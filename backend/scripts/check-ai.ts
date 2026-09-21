/**
 * Live check of every configured AI provider (a tiny real request each), then of the
 * Groq → Gemini → OpenAI → Anthropic chain the app actually uses. Never prints keys.
 *
 *   npm run check:ai              # each keyed provider + the chain
 *   npm run check:ai -- --models  # also list the models each account can use (Groq, Gemini)
 */
import { env } from "../src/config/env";
import { createProvider, resolveProviderName } from "../src/ai/providers";
import type { AIProviderName } from "../src/ai/providers/types";
import { aiProviderChain, generateAIResponse } from "../src/services/aiClient";

const secrets = [env.GROQ_API_KEY, env.GEMINI_API_KEY, env.OPENAI_API_KEY, env.ANTHROPIC_API_KEY].filter(Boolean) as string[];
const redact = (text: string) => secrets.reduce((out, key) => out.split(key).join("[key]"), text);

const ALL: Array<{ name: AIProviderName; key: string | undefined; model: string }> = [
  { name: "groq", key: env.GROQ_API_KEY, model: env.GROQ_MODEL },
  { name: "gemini", key: env.GEMINI_API_KEY, model: env.GEMINI_MODEL },
  { name: "openai", key: env.OPENAI_API_KEY, model: env.OPENAI_MODEL },
  { name: "claude", key: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL },
];

function line(fields: Record<string, string | number | boolean>) {
  for (const [key, value] of Object.entries(fields)) console.log(`  ${key.padEnd(14)}${value}`);
  console.log("");
}

async function listModels() {
  console.log("Models this account can use");
  if (env.GROQ_API_KEY) {
    const res = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` } });
    const json = (await res.json().catch(() => ({}))) as { data?: Array<{ id: string }> };
    console.log(`  groq    ${res.ok ? (json.data ?? []).map((m) => m.id).join(", ") : `HTTP ${res.status}`}`);
  }
  if (env.GEMINI_API_KEY) {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": env.GEMINI_API_KEY } });
    const json = (await res.json().catch(() => ({}))) as { models?: Array<{ name: string; supportedGenerationMethods?: string[] }> };
    const names = (json.models ?? []).filter((m) => m.supportedGenerationMethods?.includes("generateContent")).map((m) => m.name.replace("models/", ""));
    console.log(`  gemini  ${res.ok ? names.join(", ") : `HTTP ${res.status}`}`);
  }
  console.log("");
}

async function main() {
  console.log(`\nAI_PROVIDER=${env.AI_PROVIDER}  →  resolved: ${resolveProviderName() ?? "built-in engine"}  |  chain: ${aiProviderChain().join(" → ") || "(none)"}\n`);
  if (process.argv.includes("--models")) await listModels();

  console.log("Each configured provider");
  for (const { name, key, model } of ALL) {
    if (!key) {
      line({ provider: name, model: model, working: "not configured (no API key)" });
      continue;
    }
    const started = Date.now();
    try {
      const provider = await createProvider(name);
      const result = await provider.complete({ system: "You are terse.", prompt: "Reply with exactly the word: OK", maxOutputTokens: 512 });
      line({ provider: name, model: result.model, working: true, response_time: `${Date.now() - started}ms`, sample: JSON.stringify(result.text.slice(0, 40)) });
    } catch (err) {
      const message = redact(err instanceof Error ? err.message : String(err)).replace(/\s+/g, " ");
      line({ provider: name, model, working: false, response_time: `${Date.now() - started}ms`, error: message.slice(0, 260) });
    }
  }

  console.log("The chain the app uses (fallback_used = an earlier provider failed)");
  const started = Date.now();
  try {
    const result = await generateAIResponse({ system: "You are terse.", prompt: "Reply with exactly the word: OK", maxOutputTokens: 512, task: "check:ai" });
    const first = aiProviderChain()[0];
    line({ provider: result.provider, model: result.model, working: true, response_time: `${Date.now() - started}ms`, fallback_used: result.provider !== first });
  } catch (err) {
    line({ provider: "(none)", working: false, response_time: `${Date.now() - started}ms`, fallback_used: "all providers failed → the built-in engine is used", error: redact(err instanceof Error ? err.message : String(err)).slice(0, 300) });
  }
}

void main();
