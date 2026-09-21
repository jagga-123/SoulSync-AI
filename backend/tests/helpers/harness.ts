import "./setup-env";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { MongoMemoryServer } from "mongodb-memory-server";
import { io as connectClient, type Socket } from "socket.io-client";

export interface CapturedEmail {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

export interface TestUser {
  id: string;
  email: string;
  name: string;
  token: string;
}

export interface ApiResult<T = any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  status: number;
  body: T;
  headers: Headers;
}

export interface RequestOptions {
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
  raw?: string | Buffer;
}

let userCounter = 0;
const runId = Math.random().toString(36).slice(2, 7);

/**
 * Boots the real application against a throwaway in-memory MongoDB: the same
 * Express app, routes, services, Socket.IO server and event listeners the
 * production process runs — only the database is disposable and outgoing email
 * is captured instead of sent. Each test file gets its own isolated instance.
 *
 * Extra environment can be passed in `env`; it is applied before any
 * application module loads (config/env.ts reads `process.env` once, at import).
 */
export async function startHarness(options: { env?: Record<string, string> } = {}) {
  for (const [key, value] of Object.entries(options.env ?? {})) process.env[key] = value;

  const mongo = await MongoMemoryServer.create();
  const mongoose = (await import("mongoose")).default;
  await mongoose.connect(mongo.getUri("soulsync_test"));

  const [{ default: app }, { initSocket }, { registerEventListeners }, { events }, emailProviders, { registerScheduledJobs }] = await Promise.all([
    import("../../src/app"),
    import("../../src/socket"),
    import("../../src/platform/listeners"),
    import("../../src/platform/events"),
    import("../../src/services/email/providers"),
    import("../../src/platform/scheduled"),
  ]);
  // Jobs are registered so they can be triggered on demand; the timers (startJobs) are never started in tests.
  registerScheduledJobs();

  const outbox: CapturedEmail[] = [];
  emailProviders.setEmailProviderForTests({
    name: "log",
    async send(message) {
      outbox.push(message as CapturedEmail);
      return { id: `test-${outbox.length}` };
    },
  });

  registerEventListeners();

  const httpServer: Server = createServer(app);
  const io = initSocket(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const port = (httpServer.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const sockets = new Set<Socket>();

  async function request<T = any>(method: string, path: string, opts: RequestOptions = {}): Promise<ApiResult<T>> { // eslint-disable-line @typescript-eslint/no-explicit-any
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

    let body: string | Buffer | undefined;
    if (opts.raw !== undefined) {
      body = opts.raw;
    } else if (opts.body !== undefined) {
      headers["Content-Type"] ??= "application/json";
      body = JSON.stringify(opts.body);
    }

    const response = await fetch(`${baseUrl}${path}`, { method, headers, body, signal: AbortSignal.timeout(30_000) });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON body (e.g. metrics) stays as text */
    }
    return { status: response.status, body: parsed as T, headers: response.headers };
  }

  const api = {
    get: <T = any>(path: string, opts?: RequestOptions) => request<T>("GET", `/api${path}`, opts), // eslint-disable-line @typescript-eslint/no-explicit-any
    post: <T = any>(path: string, body?: unknown, opts: RequestOptions = {}) => request<T>("POST", `/api${path}`, { ...opts, body }), // eslint-disable-line @typescript-eslint/no-explicit-any
    put: <T = any>(path: string, body?: unknown, opts: RequestOptions = {}) => request<T>("PUT", `/api${path}`, { ...opts, body }), // eslint-disable-line @typescript-eslint/no-explicit-any
    del: <T = any>(path: string, opts?: RequestOptions) => request<T>("DELETE", `/api${path}`, opts), // eslint-disable-line @typescript-eslint/no-explicit-any
  };

  /** Lets fire-and-forget event handlers (notifications, emails…) finish. */
  const settle = () => events.idle();

  async function createUser(
    opts: {
      name?: string;
      email?: string;
      profile?: boolean | Partial<{ age: number; gender: string; city: string; bio: string; interests: string[]; relationshipGoal: string }>;
      verified?: boolean;
    } = {},
  ): Promise<TestUser> {
    userCounter++;
    const name = opts.name ?? `Test User${userCounter}`;
    const email = opts.email ?? `user${userCounter}.${runId}@test.local`;

    const registered = await api.post("/auth/register", { fullName: name, email, password: "Passw0rd!23" });
    if (registered.status !== 201) throw new Error(`register failed: ${JSON.stringify(registered.body)}`);
    const login = await api.post("/auth/login", { email, password: "Passw0rd!23" });
    if (login.status !== 200) throw new Error(`login failed: ${JSON.stringify(login.body)}`);

    const user: TestUser = { id: login.body.data.user.id, email, name, token: login.body.data.token };

    if (opts.profile) {
      const overrides = typeof opts.profile === "object" ? opts.profile : {};
      const created = await api.post(
        "/profile",
        { age: 28, gender: "other", city: "Testville", bio: "Hi there", interests: ["Travel", "Hiking"], relationshipGoal: "serious", ...overrides },
        { token: user.token },
      );
      if (created.status !== 201) throw new Error(`profile failed: ${JSON.stringify(created.body)}`);
    }
    if (opts.verified) {
      const { User } = await import("../../src/models/User.model");
      await User.updateOne({ _id: user.id }, { $set: { emailVerified: true } });
    }

    await settle(); // welcome + verification emails
    return user;
  }

  /**
   * Bulk-creates users straight in the database (no bcrypt, no HTTP) — for
   * tests that need many accounts. They can't log in with a password, but each
   * comes with a valid session token.
   */
  async function seedUsers(
    count: number,
    opts: {
      prefix?: string;
      profile?: boolean | Partial<{ age: number; gender: string; city: string; bio: string; interests: string[]; relationshipGoal: string }>;
      aiProfile?: boolean | Record<string, unknown>;
      verified?: boolean;
    } = {},
  ): Promise<TestUser[]> {
    const [{ User }, { Profile }, { AIProfile }, { signToken }] = await Promise.all([
      import("../../src/models/User.model"),
      import("../../src/models/Profile.model"),
      import("../../src/models/AIProfile.model"),
      import("../../src/utils/jwt"),
    ]);

    const base = userCounter;
    userCounter += count;
    const docs = Array.from({ length: count }, (_, i) => ({
      fullName: `${opts.prefix ?? "Seed"} ${base + i + 1}`,
      email: `seed${base + i + 1}.${runId}@test.local`,
      password: "seeded-password-not-for-login",
      emailVerified: opts.verified ?? false,
    }));
    const created = await User.insertMany(docs);

    if (opts.profile) {
      const overrides = typeof opts.profile === "object" ? opts.profile : {};
      await Profile.insertMany(
        created.map((user) => ({
          userId: user._id,
          age: 28,
          gender: "other",
          city: "Testville",
          bio: "Seeded profile",
          interests: ["Travel", "Hiking"],
          relationshipGoal: "serious",
          ...overrides,
        })),
      );
    }
    if (opts.aiProfile) {
      const overrides = typeof opts.aiProfile === "object" ? opts.aiProfile : {};
      await AIProfile.insertMany(
        created.map((user) => ({
          userId: user._id,
          personalityType: "The Nurturer",
          traitScores: { openness: 60, conscientiousness: 60, extraversion: 55, agreeableness: 80, emotionalStability: 70 },
          communicationStyle: "empathetic",
          interests: ["travel", "hiking"],
          values: ["honesty", "kindness", "personal growth"],
          lifestyleTraits: ["active", "outdoorsy"],
          emotionalTraits: ["calm", "supportive"],
          relationshipGoals: ["long-term commitment"],
          strengths: ["Communicates with warmth", "Calm and grounded", "Loyal and dependable"],
          summary: "You come across as warm and attentive, with a talent for making people feel cared for.",
          confidenceScore: 60,
          analysisSource: "heuristic",
          interviewAnswerCount: 15,
          ...overrides,
        })),
      );
    }

    return created.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.fullName,
      token: signToken({ id: user.id, role: user.role }),
    }));
  }

  async function makeAdmin(user: TestUser): Promise<TestUser> {
    const { User } = await import("../../src/models/User.model");
    await User.updateOne({ _id: user.id }, { $set: { role: "admin" } });
    return user;
  }

  async function setFlag(key: string, enabled: boolean): Promise<void> {
    const { setFeatureFlag } = await import("../../src/features/feature.service");
    await setFeatureFlag(key as never, enabled, new mongoose.Types.ObjectId().toString());
  }

  const ANSWERS = [
    "I'm a curious and calm person who loves exploring new places and I'm a great listener.",
    "I love travel, photography and hiking, and I enjoy cooking on weekends.",
    "Honesty and personal growth matter most to me. I value kindness and loyalty.",
    "I'm active, I love nature, and I keep a healthy balance between work and life.",
    "I listen carefully and like to talk things through. I try to understand feelings.",
    "I work hard on my career but I always value work-life balance and my wellbeing.",
    "Family is really important to me and I'd love to have kids one day.",
    "I want a long-term committed relationship built on trust and honest communication.",
  ];

  /** Runs the AI interview to completion (15 answers) via the real API. */
  async function completeInterview(user: TestUser): Promise<void> {
    const started = await api.post("/ai/interview/start", {}, { token: user.token });
    if (started.status !== 200) throw new Error(`interview start failed: ${JSON.stringify(started.body)}`);
    for (let i = 0; i < 15; i++) {
      const answered = await api.post("/ai/interview/answer", { content: `${ANSWERS[i % ANSWERS.length]} (${i + 1})` }, { token: user.token });
      if (answered.status !== 200) throw new Error(`answer ${i + 1} failed: ${JSON.stringify(answered.body)}`);
    }
    const done = await api.post("/ai/interview/complete", {}, { token: user.token });
    if (done.status !== 200) throw new Error(`interview complete failed: ${JSON.stringify(done.body)}`);
    await settle();
  }

  /** Two users, mutually matched. Returns the match id too. */
  async function makeMatch(a: TestUser, b: TestUser): Promise<{ matchId: string }> {
    const like = await api.post(`/likes/send/${b.id}`, undefined, { token: a.token });
    if (like.status !== 201) throw new Error(`like failed: ${JSON.stringify(like.body)}`);
    const incoming = await api.get("/likes/incoming", { token: b.token });
    const accepted = await api.post(`/likes/accept/${incoming.body.data.likes[0].likeId}`, undefined, { token: b.token });
    if (accepted.status !== 200) throw new Error(`accept failed: ${JSON.stringify(accepted.body)}`);
    await settle();
    return { matchId: accepted.body.data.match.matchId };
  }

  function connectSocket(token: string, auth: Record<string, unknown> = {}): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = connectClient(baseUrl, { auth: { token, ...auth }, transports: ["websocket"], reconnection: false });
      sockets.add(socket);
      socket.on("connect", () => resolve(socket));
      socket.on("connect_error", (err) => reject(err));
    });
  }

  /** Resolves with the next occurrence of a socket event (or rejects on timeout). */
  function nextEvent<T = any>(socket: Socket, event: string, timeoutMs = 5000): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for "${event}"`)), timeoutMs);
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  async function waitFor<T>(check: () => Promise<T | false | null | undefined> | T | false | null | undefined, timeoutMs = 5000): Promise<T> {
    const started = Date.now();
    for (;;) {
      const value = await check();
      if (value) return value;
      if (Date.now() - started > timeoutMs) throw new Error("waitFor timed out");
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  async function stop(): Promise<void> {
    for (const socket of sockets) socket.disconnect();
    await settle().catch(() => undefined);
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await mongoose.disconnect();
    await mongo.stop();
  }

  return {
    baseUrl,
    port,
    outbox,
    api,
    request,
    createUser,
    seedUsers,
    makeAdmin,
    setFlag,
    completeInterview,
    makeMatch,
    connectSocket,
    nextEvent,
    waitFor,
    settle,
    stop,
    mongoose,
    /** Direct access to an application module (loaded after env is fixed). */
    load: <T = any>(path: string) => import(path) as Promise<T>, // eslint-disable-line @typescript-eslint/no-explicit-any
  };
}

export type Harness = Awaited<ReturnType<typeof startHarness>>;
