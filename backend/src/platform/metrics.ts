import type { NextFunction, Request, Response } from "express";
import client from "prom-client";

/** Prometheus metrics: process/runtime defaults + HTTP + a few business counters. */
export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

const httpDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const socketConnections = new client.Gauge({
  name: "socket_connections",
  help: "Currently connected Socket.IO clients",
  registers: [registry],
});

export const notificationsCreated = new client.Counter({
  name: "notifications_created_total",
  help: "In-app notifications created",
  labelNames: ["type"] as const,
  registers: [registry],
});

export const emailsTotal = new client.Counter({
  name: "emails_total",
  help: "Emails by outcome",
  labelNames: ["template", "status", "provider"] as const,
  registers: [registry],
});

export const aiRequestsTotal = new client.Counter({
  name: "ai_requests_total",
  help: "AI provider attempts by task, provider and outcome (a fallback shows as an error on the first provider, then ok on the next)",
  labelNames: ["task", "provider", "status"] as const,
  registers: [registry],
});

export const paymentsTotal = new client.Counter({
  name: "payments_total",
  help: "Payment events by outcome",
  labelNames: ["provider", "status"] as const,
  registers: [registry],
});

export const webhooksTotal = new client.Counter({
  name: "webhooks_total",
  help: "Payment webhooks by outcome",
  labelNames: ["provider", "outcome"] as const,
  registers: [registry],
});

/** Labels by the matched route pattern (`/api/likes/send/:userId`), never the
 * raw URL, so per-user ids can't blow up metric cardinality. */
function routeLabel(req: Request): string {
  const routePath: unknown = req.route?.path;
  if (typeof routePath !== "string") return "unmatched";
  if (req.baseUrl) return `${req.baseUrl}${routePath}`;

  // Error responses unwind Express's routers, which resets `baseUrl` to "". Rebuild the
  // mount prefix from the URL: everything before the route's own trailing segments.
  const urlSegments = req.originalUrl.split("?")[0]!.split("/").filter(Boolean);
  const routeSegments = routePath.split("/").filter(Boolean);
  if (routeSegments.length === 0 || routeSegments.length > urlSegments.length) return routePath;
  const prefix = urlSegments.slice(0, urlSegments.length - routeSegments.length).join("/");
  return `/${prefix}${routePath}`.replace(/\/{2,}/g, "/");
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const stop = httpDuration.startTimer();
  res.on("finish", () => {
    stop({ method: req.method, route: routeLabel(req), status: String(res.statusCode) });
  });
  next();
}

export async function renderMetrics(): Promise<{ contentType: string; body: string }> {
  return { contentType: registry.contentType, body: await registry.metrics() };
}
