import { randomUUID } from "node:crypto";
import pinoHttp from "pino-http";
import { logger } from "../config/logger";

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * One structured access-log line per request, with a request id that is
 * echoed back in the `x-request-id` header (and attached to error reports), so
 * a user's "it broke" can be traced to exactly one log line.
 */
export const requestLogger = pinoHttp({
  logger,
  genReqId(req, res) {
    const incoming = req.headers["x-request-id"];
    const id = typeof incoming === "string" && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader("x-request-id", id);
    return id;
  },
  // Liveness/readiness probes and metric scrapes would drown real traffic.
  autoLogging: {
    ignore: (req) => {
      const url = req.url ?? "";
      return url.startsWith("/api/health") || url.startsWith("/api/metrics");
    },
  },
  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  customProps(req) {
    return { userId: (req as { user?: { id: string } }).user?.id };
  },
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
