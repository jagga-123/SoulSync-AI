import { env } from "../config/env";
import { logger } from "../config/logger";

export interface ErrorContext {
  requestId?: string;
  userId?: string;
  method?: string;
  path?: string;
  extra?: Record<string, unknown>;
}

interface Tracker {
  readonly name: "log" | "sentry";
  capture(err: unknown, context?: ErrorContext): void;
  flush(timeoutMs: number): Promise<void>;
}

// Errors are always logged (by the error middleware). The default tracker
// therefore adds nothing; Sentry, when configured, adds grouping, alerting and
// release tracking on top.
const logTracker: Tracker = {
  name: "log",
  capture() {},
  async flush() {},
};

let tracker: Tracker = logTracker;

/**
 * Turns on Sentry when SENTRY_DSN is set. The SDK is imported lazily so an
 * install without a DSN never loads it, and PII is stripped before send:
 * request bodies, cookies and auth headers never leave the process.
 */
export async function initErrorTracking(): Promise<Tracker["name"]> {
  if (!env.SENTRY_DSN) return "log";

  try {
    const Sentry = await import("@sentry/node");
    Sentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
      release: process.env.RENDER_GIT_COMMIT ?? process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GIT_SHA,
      tracesSampleRate: 0,
      sendDefaultPii: false,
      // We own uncaught-exception / unhandled-rejection handling (server.ts).
      integrations: (defaults) =>
        defaults.filter((i) => i.name !== "OnUncaughtException" && i.name !== "OnUnhandledRejection"),
      beforeSend(event) {
        if (event.request) {
          delete event.request.data;
          delete event.request.cookies;
          if (event.request.headers) {
            delete event.request.headers.authorization;
            delete event.request.headers.cookie;
          }
        }
        return event;
      },
    });

    tracker = {
      name: "sentry",
      capture(err, context) {
        Sentry.withScope((scope) => {
          if (context?.requestId) scope.setTag("request_id", context.requestId);
          if (context?.userId) scope.setUser({ id: context.userId });
          if (context?.method || context?.path) scope.setContext("request", { method: context.method, path: context.path });
          if (context?.extra) scope.setContext("extra", context.extra);
          Sentry.captureException(err);
        });
      },
      async flush(timeoutMs) {
        await Sentry.flush(timeoutMs);
      },
    };
    return "sentry";
  } catch (err) {
    logger.error({ err }, "Sentry failed to initialise — continuing with log-only error tracking");
    return "log";
  }
}

export function captureError(err: unknown, context?: ErrorContext): void {
  try {
    tracker.capture(err, context);
  } catch (trackerErr) {
    logger.error({ err: trackerErr }, "error tracker failed while capturing");
  }
}

export function getErrorTrackerName(): Tracker["name"] {
  return tracker.name;
}

export async function flushErrorTracking(timeoutMs = 2000): Promise<void> {
  await tracker.flush(timeoutMs).catch(() => undefined);
}
