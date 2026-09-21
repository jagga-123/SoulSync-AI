import { childLogger } from "../config/logger";
import { JobLock } from "../models/Engagement.models";
import { captureError } from "./error-tracker";

const log = childLogger("jobs");

export interface JobDefinition {
  name: string;
  intervalMs: number;
  /** How long one run may hold the lock before another instance may take over. */
  lockTtlMs: number;
  handler: (context: { force: boolean }) => Promise<Record<string, unknown> | void>;
}

export type JobRunResult =
  | { status: "ok"; durationMs: number; result: Record<string, unknown> }
  | { status: "skipped"; reason: "locked" | "unknown" }
  | { status: "error"; error: string };

const registry = new Map<string, JobDefinition>();
const timers: NodeJS.Timeout[] = [];

export function registerJob(definition: JobDefinition): void {
  registry.set(definition.name, definition);
}

async function acquireLock(name: string, ttlMs: number): Promise<boolean> {
  const now = new Date();
  try {
    // Matches only a free or expired lock. Racing instances collide on the
    // unique `name` index during the upsert, and the loser sees a duplicate-key
    // error — which is exactly "someone else has it".
    const locked = await JobLock.findOneAndUpdate(
      { name, $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }, { lockedUntil: { $exists: false } }] },
      { $set: { lockedUntil: new Date(now.getTime() + ttlMs) } },
      { upsert: true, new: true },
    );
    return Boolean(locked);
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return false;
    throw err;
  }
}

/**
 * Runs a job under a database lock, so N server instances (or the scheduler
 * plus a manual trigger) never run the same job at once.
 */
export async function runJob(name: string, options: { force?: boolean } = {}): Promise<JobRunResult> {
  const definition = registry.get(name);
  if (!definition) return { status: "skipped", reason: "unknown" };

  if (!(await acquireLock(name, definition.lockTtlMs))) return { status: "skipped", reason: "locked" };

  const startedAt = Date.now();
  try {
    const result = (await definition.handler({ force: options.force ?? false })) ?? {};
    const durationMs = Date.now() - startedAt;
    await JobLock.updateOne(
      { name },
      { $set: { lockedUntil: null, lastRunAt: new Date(), lastStatus: "ok", lastDurationMs: durationMs, lastResult: result }, $unset: { lastError: 1 } },
    );
    log.info({ job: name, durationMs, result }, "job finished");
    return { status: "ok", durationMs, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await JobLock.updateOne(
      { name },
      { $set: { lockedUntil: null, lastRunAt: new Date(), lastStatus: "error", lastError: message.slice(0, 500), lastDurationMs: Date.now() - startedAt } },
    ).catch(() => undefined);
    log.error({ err, job: name }, "job failed");
    captureError(err, { extra: { job: name } });
    return { status: "error", error: message };
  }
}

/** Starts the in-process scheduler. Timers are unref'd so they never hold the process open. */
export function startJobs(): void {
  for (const definition of registry.values()) {
    const timer = setInterval(() => void runJob(definition.name), definition.intervalMs);
    timer.unref();
    timers.push(timer);
  }
  log.info({ jobs: [...registry.keys()] }, "job scheduler started");
}

export function stopJobs(): void {
  while (timers.length) clearInterval(timers.pop());
}

export function listRegisteredJobs(): string[] {
  return [...registry.keys()];
}

export async function getJobStatuses() {
  const locks = await JobLock.find({});
  const byName = new Map(locks.map((lock) => [lock.name, lock]));
  return [...registry.values()].map((definition) => {
    const lock = byName.get(definition.name);
    return {
      name: definition.name,
      intervalMs: definition.intervalMs,
      lastRunAt: lock?.lastRunAt ?? null,
      lastStatus: lock?.lastStatus ?? null,
      lastError: lock?.lastError ?? null,
      lastDurationMs: lock?.lastDurationMs ?? null,
      lastResult: lock?.lastResult ?? null,
    };
  });
}
