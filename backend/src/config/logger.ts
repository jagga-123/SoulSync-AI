import pino from "pino";
import { env } from "./env";

/**
 * One structured (JSON) logger for the whole API. In production these lines
 * are what Render/Railway/Datadog/Logtail ingest, so: one event per line,
 * stable field names, and secrets redacted at the source.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: "soulsync-api", env: env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.password",
      "*.token",
      "*.secret",
      "*.apiKey",
      "headers.authorization",
    ],
    censor: "[redacted]",
  },
});

/** A logger tagged with the component that owns the line (e.g. "billing"). */
export function childLogger(component: string) {
  return logger.child({ component });
}
