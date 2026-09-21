import "../helpers/setup-env";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startFakeProvider, type FakeProvider } from "../helpers/fake-provider";
import { startHarness, type Harness, type TestUser } from "../helpers/harness";

const METRICS_TOKEN = "metrics-token-for-tests-123456";
const EXTRA_ORIGIN = "https://staging.soulsync.test";

describe("production hardening", () => {
  let h: Harness;
  let sentry: FakeProvider;
  let admin: TestUser;
  let member: TestUser;

  before(async () => {
    sentry = await startFakeProvider(() => ({ body: { id: "event-id" } }));
    h = await startHarness({
      env: {
        METRICS_TOKEN,
        CLIENT_ORIGINS: EXTRA_ORIGIN,
        SENTRY_DSN: `http://publickey@127.0.0.1:${sentry.port}/1`,
        CLOUDINARY_CLOUD_NAME: "demo-cloud",
        CLOUDINARY_API_KEY: "123456789",
        CLOUDINARY_API_SECRET: "cloudinary-secret-for-tests",
      },
    });
    const { initErrorTracking } = await h.load("../../src/platform/error-tracker");
    assert.equal(await initErrorTracking(), "sentry");
    admin = await h.makeAdmin(await h.createUser({ name: "Ops Admin" }));
    member = await h.createUser({ name: "Regular Rae" });
  });
  after(async () => {
    await h.stop();
    await sentry.close();
  });

  const raw = (path: string, init: RequestInit = {}) => fetch(`${h.baseUrl}${path}`, init);

  describe("health checks", () => {
    it("liveness answers instantly and needs nothing", async () => {
      const res = await h.api.get("/health");
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
    });

    it("readiness reports the database as up, with uptime", async () => {
      const res = await h.api.get("/health/ready");
      assert.equal(res.status, 200);
      assert.equal(res.body.data.database, "up");
      assert.equal(res.body.data.environment, "test");
      assert.ok(res.body.data.uptimeSeconds >= 0);
      assert.ok(!JSON.stringify(res.body).includes("mongodb"), "no connection details in a public probe");
    });
  });

  describe("security headers", () => {
    it("sends a lockdown CSP, no sniffing, no referrer, no framing, no capabilities", async () => {
      const res = await raw("/api/health");
      const h2 = res.headers;
      assert.match(h2.get("content-security-policy") ?? "", /default-src 'none'/);
      assert.match(h2.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
      assert.equal(h2.get("x-content-type-options"), "nosniff");
      assert.equal(h2.get("referrer-policy"), "no-referrer");
      assert.equal(h2.get("cross-origin-resource-policy"), "cross-origin", "the separate frontend origin can read API responses");
      assert.match(h2.get("permissions-policy") ?? "", /camera=\(\).*microphone=\(\).*geolocation=\(\)/);
      assert.match(h2.get("strict-transport-security") ?? "", /max-age=/);
      assert.equal(h2.get("x-powered-by"), null, "doesn't advertise Express");
    });

    it("applies them to errors and unknown routes too", async () => {
      for (const path of ["/api/does-not-exist", "/api/auth/me"]) {
        const res = await raw(path);
        assert.equal(res.headers.get("x-content-type-options"), "nosniff", path);
        assert.ok(res.headers.get("x-request-id"), path);
      }
    });
  });

  describe("CORS", () => {
    const preflight = (origin: string) =>
      raw("/api/auth/login", { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,authorization" } });

    it("allows the configured client and extra origins, and only those", async () => {
      const app = await preflight("http://localhost:3000");
      assert.equal(app.status, 204);
      assert.equal(app.headers.get("access-control-allow-origin"), "http://localhost:3000");
      assert.equal((await preflight(EXTRA_ORIGIN)).headers.get("access-control-allow-origin"), EXTRA_ORIGIN);

      for (const evil of ["https://evil.example", "http://localhost:3001", "https://soulsync.test.evil.example", "null"]) {
        assert.equal((await preflight(evil)).headers.get("access-control-allow-origin"), null, `${evil} must not be allowed`);
      }
    });

    it("never reflects a wildcard or credentials to arbitrary sites on real requests", async () => {
      const res = await raw("/api/features/public", { headers: { Origin: "https://evil.example" } });
      assert.equal(res.status, 200, "the request itself is fine (it's a public endpoint)");
      assert.equal(res.headers.get("access-control-allow-origin"), null, "but the browser is not permitted to read it");
    });

    it("lets the frontend read the request id and rate-limit headers", async () => {
      const res = await raw("/api/health", { headers: { Origin: "http://localhost:3000" } });
      const exposed = (res.headers.get("access-control-expose-headers") ?? "").toLowerCase();
      for (const header of ["x-request-id", "retry-after", "ratelimit"]) assert.ok(exposed.includes(header), header);
    });
  });

  describe("request handling", () => {
    it("issues a request id, echoes a sane inbound one, and replaces a hostile one", async () => {
      const generated = (await raw("/api/health")).headers.get("x-request-id") ?? "";
      assert.match(generated, /^[0-9a-f-]{36}$/);

      const echoed = await raw("/api/health", { headers: { "x-request-id": "trace-abc-123456" } });
      assert.equal(echoed.headers.get("x-request-id"), "trace-abc-123456");

      for (const hostile of ["short", "has spaces in it 12345", "<script>alert(1)</script>", "x".repeat(200)]) {
        const res = await raw("/api/health", { headers: { "x-request-id": hostile } });
        assert.notEqual(res.headers.get("x-request-id"), hostile);
        assert.match(res.headers.get("x-request-id") ?? "", /^[0-9a-f-]{36}$/);
      }
    });

    it("answers unknown routes with the standard JSON envelope", async () => {
      const res = await h.api.get("/nope/nothing");
      assert.equal(res.status, 404);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /Route not found/);
    });

    it("turns malformed JSON into a 400, not a 500", async () => {
      const res = await raw("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"email": "a@b.co", ' });
      assert.equal(res.status, 400);
      assert.equal(((await res.json()) as { success: boolean }).success, false);
    });

    it("rejects oversized bodies with a 413", async () => {
      const res = await raw("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "a@b.co", password: "x".repeat(20_000) }) });
      assert.equal(res.status, 413);
    });

    it("doesn't leak internals in errors for bad input", async () => {
      const res = await h.api.get("/discover?limit=abc", { token: member.token });
      assert.ok(res.status < 500);
      assert.ok(!/at .*\.ts:\d+/.test(JSON.stringify(res.body)), "no stack traces");
    });
  });

  describe("metrics", () => {
    it("are closed without the token, in every wrong form", async () => {
      assert.equal((await h.api.get("/metrics")).status, 401);
      assert.equal((await h.api.get("/metrics", { token: "wrong-token-of-similar-length-12" })).status, 401);
      assert.equal((await h.api.get("/metrics", { headers: { "x-metrics-token": "nope" } })).status, 401);
      assert.equal((await h.api.get("/metrics", { token: member.token })).status, 401, "a member session isn't the scrape token");
      assert.equal((await h.api.get("/metrics", { token: admin.token })).status, 401, "not even an admin's");
    });

    it("expose Prometheus text to the scraper, via bearer token or header", async () => {
      await h.api.get("/features/public");
      await h.api.get("/features", { token: member.token });
      for (const options of [{ token: METRICS_TOKEN }, { headers: { "x-metrics-token": METRICS_TOKEN } }]) {
        const res = await h.api.get("/metrics", options);
        assert.equal(res.status, 200);
        assert.match(res.headers.get("content-type") ?? "", /text\/plain/);
        assert.match(res.body, /# HELP http_request_duration_seconds/);
        assert.match(res.body, /process_cpu_user_seconds_total/);
        assert.match(res.body, /socket_connections /);
      }
    });

    it("label HTTP metrics by route pattern, never by raw URL (no per-user cardinality)", async () => {
      await h.api.post(`/notifications/${"5f".repeat(12)}/read`, undefined, { token: member.token });
      const body = (await h.api.get("/metrics", { token: METRICS_TOKEN })).body as string;
      assert.match(body, /route="\/api\/notifications\/:id\/read"/);
      assert.ok(!body.includes("5f5f5f5f5f5f"), "ids never become label values");
      assert.match(body, /route="unmatched"/, "unknown paths collapse into one label");
    });

    it("count business events: emails, notifications, payments", async () => {
      const body = (await h.api.get("/metrics", { token: METRICS_TOKEN })).body as string;
      assert.match(body, /emails_total\{template="welcome",status="sent",provider="log"\} \d+/);
    });
  });

  describe("client error reports", () => {
    it("accepts an anonymous browser report and answers 204", async () => {
      const res = await raw("/api/client-errors", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Cannot read properties of undefined", digest: "abc123", path: "/matches", stack: "Error\n  at x (page.js:1:1)", userAgent: "test" }),
      });
      assert.equal(res.status, 204);
    });

    it("validates and bounds the report", async () => {
      const post = (body: unknown) => raw("/api/client-errors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      assert.equal((await post({})).status, 422);
      assert.equal((await post({ message: "x".repeat(501) })).status, 422);
      assert.equal((await post({ message: "ok", stack: "x".repeat(4001) })).status, 422);
    });
  });

  describe("photo uploads (Cloudinary)", () => {
    it("require a login", async () => {
      assert.equal((await h.api.post("/uploads/sign")).status, 401);
    });

    it("hand the browser a signed, per-user, images-only upload ticket — never the secret", async () => {
      const res = await h.api.post("/uploads/sign", undefined, { token: member.token });
      assert.equal(res.status, 200);
      const ticket = res.body.data;
      assert.equal(ticket.uploadUrl, "https://api.cloudinary.com/v1_1/demo-cloud/image/upload");
      assert.equal(ticket.apiKey, "123456789");
      assert.equal(ticket.folder, `soulsync/profiles/${member.id}`);
      assert.equal(ticket.allowed_formats, "jpg,jpeg,png,webp");
      assert.ok(Math.abs(ticket.timestamp - Date.now() / 1000) < 60);
      assert.ok(!JSON.stringify(ticket).includes("cloudinary-secret-for-tests"));

      const { signCloudinaryParams } = await h.load("../../src/services/upload.service");
      assert.equal(ticket.signature, signCloudinaryParams({ allowed_formats: ticket.allowed_formats, folder: ticket.folder, timestamp: ticket.timestamp }, "cloudinary-secret-for-tests"));
    });

    it("confine each user to their own folder", async () => {
      const other = await h.createUser({ name: "Other Olu" });
      const [a, b] = await Promise.all([member, other].map(async (u) => (await h.api.post("/uploads/sign", undefined, { token: u.token })).body.data));
      assert.notEqual(a.folder, b.folder);
      assert.notEqual(a.signature, b.signature);
    });

    it("say so plainly when storage isn't configured", async () => {
      const { env } = await h.load("../../src/config/env");
      const saved = env.CLOUDINARY_API_SECRET;
      env.CLOUDINARY_API_SECRET = undefined;
      try {
        const res = await h.api.post("/uploads/sign", undefined, { token: member.token });
        assert.equal(res.status, 501);
        assert.equal(res.body.error.code, "STORAGE_NOT_CONFIGURED");
      } finally {
        env.CLOUDINARY_API_SECRET = saved;
      }
    });
  });

  describe("error tracking (Sentry)", () => {
    const envelopes = () => sentry.matching("POST", "/api/1/envelope");

    it("reports unexpected 500s with the request id — without credentials or request bodies", async () => {
      const { User } = await h.load("../../src/models/User.model");
      const original = User.countDocuments;
      User.countDocuments = () => { throw new Error("boom: simulated database failure"); };
      let requestId = "";
      try {
        const res = await h.api.get("/admin/users", { token: admin.token, headers: { "x-request-id": "sentry-trace-0001" } });
        assert.equal(res.status, 500);
        requestId = res.headers.get("x-request-id") ?? "";
      } finally {
        User.countDocuments = original;
      }
      assert.equal(requestId, "sentry-trace-0001");

      const { flushErrorTracking } = await h.load("../../src/platform/error-tracker");
      await flushErrorTracking(3000);
      const sent = envelopes().map((r) => r.body).join("\n");
      assert.match(sent, /boom: simulated database failure/);
      assert.match(sent, /sentry-trace-0001/);
      assert.ok(!sent.includes(admin.token), "the bearer token never leaves the process");
      assert.ok(!/authorization/i.test(sent));
    });

    it("stays quiet for ordinary client errors (4xx)", async () => {
      await h.api.get("/admin/users", { token: member.token }); // 403
      await h.api.get("/definitely/not/here"); // 404
      await h.api.post("/auth/login", { email: "x@y.co", password: "wrong-pass1" }); // 401
      const { flushErrorTracking } = await h.load("../../src/platform/error-tracker");
      await flushErrorTracking(1500);
      const sent = envelopes().map((r) => r.body).join("\n");
      for (const clientError of ["Admin access required", "Route not found", "Invalid email or password"]) {
        assert.ok(!sent.includes(clientError), `"${clientError}" (a 4xx) must not be reported`);
      }
    });
  });

  describe("shutdown safety", () => {
    it("drains in-flight event handlers before the process would exit", async () => {
      const { events } = await h.load("../../src/platform/events");
      let done = false;
      events.on("user.registered", async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        done = true;
      });
      const registered = h.api.post("/auth/register", { fullName: "Drain Dot", email: `drain.${Date.now()}@test.local`, password: "Passw0rd!23" });
      await registered;
      assert.equal(done, false, "the request doesn't wait on side effects");
      await events.idle();
      assert.equal(done, true);
    });

    it("isolates a crashing event handler from the request and from other handlers", async () => {
      const { events } = await h.load("../../src/platform/events");
      let secondRan = false;
      events.on("user.registered", async () => { throw new Error("listener exploded"); });
      events.on("user.registered", async () => { secondRan = true; });
      const res = await h.api.post("/auth/register", { fullName: "Survivor Sam", email: `survivor.${Date.now()}@test.local`, password: "Passw0rd!23" });
      assert.equal(res.status, 201);
      await events.idle();
      assert.equal(secondRan, true);
    });
  });

  describe("database outage", () => {
    it("readiness flips to 503 so the platform stops routing here, while liveness stays green", async () => {
      await h.mongoose.disconnect();
      const down = await h.api.get("/health/ready");
      assert.equal(down.status, 503);
      assert.equal(down.body.data.database, "down");
      assert.equal((await h.api.get("/health")).status, 200, "liveness stays green — the process itself is fine");
    });
  });
});
