import "../helpers/setup-env";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import { env } from "../../src/config/env";
import { resolveProviderName, tryComplete } from "../../src/ai/providers";
import { registry } from "../../src/platform/metrics";
import { retryAfterMs } from "../../src/ai/providers/groq.provider";
import { AllAIProvidersFailedError, aiProviderChain, generateAIResponse, resetAIClientForTests } from "../../src/services/aiClient";
import { startFakeProvider, type FakeProvider } from "../helpers/fake-provider";

const config = env as unknown as Record<string, unknown>;
const GROQ_KEY = "gsk_test_groq_key_1234567890";
const GEMINI_KEY = "AQ.test_gemini_key_1234567890";

const groqReply = (text: string) => ({ model: "llama-3.3-70b-versatile", choices: [{ finish_reason: "stop", message: { role: "assistant", content: text } }] });
const geminiReply = (text: string) => ({ candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text }] } }] });

describe("AI provider fallback (Groq → Gemini, over real HTTP, no network)", () => {
  let api: FakeProvider;
  let groq: "ok" | "rate-limit" | "rate-limit-once" | "rate-limit-long" | "empty" | "leaky" = "ok";
  let gemini: "ok" | "down" = "ok";

  const configure = (values: Record<string, unknown> = {}) => {
    Object.assign(config, {
      AI_PROVIDER: "auto",
      GROQ_API_KEY: GROQ_KEY,
      GROQ_MODEL: "llama-3.3-70b-versatile",
      GROQ_BASE_URL: `${api.url}/openai/v1`,
      GEMINI_API_KEY: GEMINI_KEY,
      GEMINI_MODEL: "gemini-test",
      GEMINI_BASE_URL: api.url,
      AI_REQUEST_TIMEOUT_MS: 5000,
      ...values,
    });
    resetAIClientForTests();
  };

  before(async () => {
    api = await startFakeProvider((req) => {
      if (req.path === "/openai/v1/chat/completions") {
        if (groq === "rate-limit") return { status: 429, body: { error: { message: "Rate limit reached for model" } } };
        if (groq === "rate-limit-long") return { status: 429, headers: { "retry-after": "30" }, body: { error: { message: "Rate limit reached. Please try again in 30s." } } };
        if (groq === "rate-limit-once") {
          groq = "ok"; // the next request (the retry) succeeds
          return { status: 429, body: { error: { message: "Rate limit reached for model `x` on input tokens per minute. Please try again in 120ms." } } };
        }
        if (groq === "empty") return { body: groqReply("   ") };
        if (groq === "leaky") return { status: 401, body: { error: { message: `Invalid API key ${GROQ_KEY}` } } };
        return { body: groqReply("Groq says hello.") };
      }
      if (req.path === "/v1/chat/completions") {
        return { body: { id: "chatcmpl-test", object: "chat.completion", model: "gpt-4o-mini", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "OpenAI says hello." } }] } };
      }
      if (req.path.endsWith(":generateContent")) {
        if (gemini === "down") return { status: 503, body: { error: { code: 503, message: "high demand", status: "UNAVAILABLE" } } };
        return { body: geminiReply("Gemini says hello.") };
      }
      return undefined;
    });
  });
  after(() => api.close());

  beforeEach(() => {
    groq = "ok";
    gemini = "ok";
    api.requests.length = 0;
    configure();
  });

  describe("generateAIResponse", () => {
    it("uses Groq first and reports it as the provider", async () => {
      const result = await generateAIResponse({ system: "Be brief.", prompt: "Say hello.", temperature: 0.4, maxOutputTokens: 300 });
      assert.deepEqual(result, { text: "Groq says hello.", provider: "groq", model: "llama-3.3-70b-versatile" });
      assert.equal(api.matching("POST", "/openai/v1/chat/completions").length, 1);
      assert.equal(api.matching("POST", "/v1beta").length, 0, "Gemini is not called when Groq answers");

      const call = api.requests[0]!;
      assert.equal(call.headers.authorization, `Bearer ${GROQ_KEY}`);
      assert.equal(call.json.model, "llama-3.3-70b-versatile");
      assert.equal(call.json.temperature, 0.4);
      assert.equal(call.json.max_completion_tokens, 300);
      assert.deepEqual(call.json.messages, [{ role: "system", content: "Be brief." }, { role: "user", content: "Say hello." }]);
      assert.ok(!("response_format" in call.json));
    });

    it("picks a sensible temperature when none is given: steadier for JSON, livelier for prose", async () => {
      await generateAIResponse({ system: "s", prompt: "p" });
      await generateAIResponse({ system: "s", prompt: "p", json: true });
      assert.equal(api.requests[0]!.json.temperature, 0.7);
      assert.equal(api.requests[1]!.json.temperature, 0.3);
      assert.deepEqual(api.requests[1]!.json.response_format, { type: "json_object" });
    });

    it("falls back to Gemini when Groq is rate limited, and says so", async () => {
      groq = "rate-limit";
      const result = await generateAIResponse({ system: "s", prompt: "p", temperature: 0.2 });
      assert.equal(result.provider, "gemini");
      assert.equal(result.text, "Gemini says hello.");
      assert.equal(result.model, "gemini-test");
      assert.equal(api.matching("POST", "/openai/v1/chat/completions").length, 1);
      assert.equal(api.requests.filter((r) => r.path.endsWith(":generateContent")).length, 1);
      assert.equal(api.requests.find((r) => r.path.endsWith(":generateContent"))!.json.generationConfig.temperature, 0.2, "temperature reaches Gemini too");
    });

    it("retries Groq once when it says the wait is short (free-tier tokens-per-minute), staying on the primary", async () => {
      groq = "rate-limit-once";
      const result = await generateAIResponse({ system: "s", prompt: "p" });
      assert.equal(result.provider, "groq");
      assert.equal(api.matching("POST", "/openai/v1/chat/completions").length, 2, "one 429, one retry");
      assert.equal(api.requests.filter((r) => r.path.endsWith(":generateContent")).length, 0, "Gemini was not needed");
    });

    it("does not wait around for a long rate limit — it hands over to Gemini at once", async () => {
      groq = "rate-limit-long";
      const started = Date.now();
      const result = await generateAIResponse({ system: "s", prompt: "p" });
      assert.equal(result.provider, "gemini");
      assert.equal(api.matching("POST", "/openai/v1/chat/completions").length, 1, "no retry");
      assert.ok(Date.now() - started < 4000);
    });

    it("reads the wait Groq asks for from the header or the message", () => {
      assert.equal(retryAfterMs("2", ""), 2000);
      assert.equal(retryAfterMs(null, "Please try again in 1.5s. Need more tokens?"), 1500);
      assert.equal(retryAfterMs(null, "Please try again in 274.285714ms."), 274);
      assert.equal(retryAfterMs(null, "no hint here"), null);
      assert.equal(retryAfterMs("", "no hint here"), null);
    });

    it("falls back when Groq answers with nothing", async () => {
      groq = "empty";
      assert.equal((await generateAIResponse({ system: "s", prompt: "p" })).provider, "gemini");
    });

    it("falls back when Groq times out", async () => {
      const slow: Server = createServer(() => { /* never answers */ });
      await new Promise<void>((resolve) => slow.listen(0, "127.0.0.1", resolve));
      try {
        configure({ GROQ_BASE_URL: `http://127.0.0.1:${(slow.address() as AddressInfo).port}/openai/v1`, AI_REQUEST_TIMEOUT_MS: 300 });
        const started = Date.now();
        assert.equal((await generateAIResponse({ system: "s", prompt: "p" })).provider, "gemini");
        assert.ok(Date.now() - started < 4000, "gives up on Groq quickly");
      } finally {
        slow.closeAllConnections();
        await new Promise<void>((resolve) => slow.close(() => resolve()));
      }
    });

    it("throws — naming both providers — when both fail, and never leaks an API key", async () => {
      groq = "leaky";
      gemini = "down";
      await assert.rejects(
        generateAIResponse({ system: "s", prompt: "p" }),
        (err: unknown) => {
          assert.ok(err instanceof AllAIProvidersFailedError);
          assert.deepEqual(err.attempts.map((a) => a.provider), ["groq", "gemini"]);
          assert.match(err.message, /groq: .*HTTP 401/);
          assert.match(err.message, /gemini: /);
          assert.ok(!err.message.includes(GROQ_KEY) && !err.message.includes(GEMINI_KEY), "no key in the error");
          return true;
        },
      );
    });

    it("extends the chain Groq → Gemini → OpenAI → Anthropic when those keys exist", async () => {
      // A generous timeout: the first call loads two SDKs, which is slow on a busy machine.
      configure({ OPENAI_API_KEY: "sk-test-openai", OPENAI_BASE_URL: `${api.url}/v1`, ANTHROPIC_API_KEY: "sk-ant-test", AI_REQUEST_TIMEOUT_MS: 60_000 });
      try {
        assert.deepEqual(aiProviderChain(), ["groq", "gemini", "openai", "claude"]);
        groq = "rate-limit";
        gemini = "down";
        const result = await generateAIResponse({ system: "s", prompt: "p" });
        assert.equal(result.provider, "openai");
        assert.equal(result.text, "OpenAI says hello.");
      } finally {
        Object.assign(config, { OPENAI_API_KEY: undefined, OPENAI_BASE_URL: undefined, ANTHROPIC_API_KEY: undefined });
        resetAIClientForTests();
      }
    });

    it("works with Groq alone, and with Gemini alone", async () => {
      configure({ GEMINI_API_KEY: undefined });
      assert.deepEqual(aiProviderChain(), ["groq"]);
      assert.equal((await generateAIResponse({ system: "s", prompt: "p" })).provider, "groq");
      groq = "rate-limit";
      await assert.rejects(generateAIResponse({ system: "s", prompt: "p" }), AllAIProvidersFailedError);

      groq = "ok";
      configure({ GROQ_API_KEY: undefined });
      assert.deepEqual(aiProviderChain(), ["gemini"]);
      assert.equal((await generateAIResponse({ system: "s", prompt: "p" })).provider, "gemini");
    });

    it("throws a clear error when no provider is configured", async () => {
      configure({ GROQ_API_KEY: undefined, GEMINI_API_KEY: undefined });
      await assert.rejects(generateAIResponse({ system: "s", prompt: "p" }), /No AI provider is configured/);
    });

    it("counts every attempt by provider so the fallback rate is visible in /metrics", async () => {
      groq = "rate-limit";
      await generateAIResponse({ system: "s", prompt: "p", task: "unit-test-task" });
      const metrics = await registry.metrics();
      assert.match(metrics, /ai_requests_total\{[^}]*task="unit-test-task"[^}]*provider="groq"[^}]*status="error"[^}]*\} 1/);
      assert.match(metrics, /ai_requests_total\{[^}]*task="unit-test-task"[^}]*provider="gemini"[^}]*status="ok"[^}]*\} 1/);
    });
  });

  describe("how the AI features reach it (tryComplete)", () => {
    const request = { system: "s", prompt: "p", maxOutputTokens: 200 };

    it("routes through Groq whenever GROQ_API_KEY is set, whatever AI_PROVIDER says", async () => {
      for (const AI_PROVIDER of ["auto", "gemini", "claude", "openai"]) {
        configure({ AI_PROVIDER, ANTHROPIC_API_KEY: "sk-ant-x", OPENAI_API_KEY: "sk-x" });
        assert.equal(resolveProviderName(), "groq", AI_PROVIDER);
        const completion = await tryComplete("unit test", request);
        assert.equal(completion?.provider, "groq", AI_PROVIDER);
      }
      config.ANTHROPIC_API_KEY = undefined;
      config.OPENAI_API_KEY = undefined;
    });

    it("hands the caller the provider that really answered, so it is stored with the result", async () => {
      groq = "rate-limit";
      const completion = await tryComplete("unit test", request);
      assert.equal(completion?.provider, "gemini");
      assert.equal(completion?.model, "gemini-test");
    });

    it("returns null — meaning 'use the built-in engine' — when every provider fails", async () => {
      groq = "rate-limit";
      gemini = "down";
      const originalWarn = console.warn;
      const warnings: string[] = [];
      console.warn = (...args: unknown[]) => void warnings.push(args.join(" "));
      try {
        assert.equal(await tryComplete("unit test", request), null);
      } finally {
        console.warn = originalWarn;
      }
      assert.match(warnings.join("\n"), /unit test: provider failed, using built-in engine — All AI providers failed/);
    });

    it("AI_PROVIDER=local still means never call an external AI, even with a Groq key", async () => {
      configure({ AI_PROVIDER: "local" });
      assert.equal(resolveProviderName(), null);
      assert.equal(await tryComplete("unit test", request), null);
      assert.equal(api.requests.length, 0);
    });

    it("keeps the previous behaviour when no Groq key is set", async () => {
      configure({ GROQ_API_KEY: undefined, AI_PROVIDER: "auto" });
      assert.equal(resolveProviderName(), "gemini", "auto still picks the first keyed provider");
      configure({ GROQ_API_KEY: undefined, GEMINI_API_KEY: undefined });
      assert.equal(resolveProviderName(), null);
      assert.equal(await tryComplete("unit test", request), null);
    });
  });
});
