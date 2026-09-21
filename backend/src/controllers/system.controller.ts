import { timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { parseOrThrow } from "../utils/parse";
import { env, isProduction } from "../config/env";
import { childLogger } from "../config/logger";
import { isDbConnected, pingDb } from "../config/db";
import { getEntitlements } from "../features/entitlements";
import { getAllFlags, isFeatureEnabled } from "../features/feature.service";
import { runJob } from "../platform/jobs";
import { renderMetrics } from "../platform/metrics";
import { getLikeAllowance } from "../services/premium.service";
import { MAX_PHOTO_BYTES, PHOTO_FORMATS, photoDriver, removeProfilePhoto, storeLocalPhoto } from "../services/photo.service";
import { checkEmailHealth } from "../services/email/health";
import { createUploadSignature } from "../services/upload.service";
import { clientErrorBody } from "../validators/platform.validator";

const log = childLogger("client");

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function bearerOrHeader(req: Request, headerName: string): string {
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  const header = req.headers[headerName];
  return typeof header === "string" ? header : "";
}

/** Public: the few flags that shape logged-out pages. */
export const publicFeatures = asyncHandler(async (_req: Request, res: Response) => {
  const [waitlistMode, billing, referrals] = await Promise.all([
    isFeatureEnabled("waitlist_mode"),
    isFeatureEnabled("billing"),
    isFeatureEnabled("referrals"),
  ]);
  res.status(200).json(new ApiResponse("Features fetched", { waitlistMode, billing, referrals }));
});

/** Authenticated: every flag as a plain map, plus this user's plan and perks. */
export const userFeatures = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const [flags, entitlements, likeAllowance] = await Promise.all([
    getAllFlags(),
    getEntitlements(req.user.id),
    getLikeAllowance(req.user.id),
  ]);
  res.status(200).json(
    new ApiResponse("Features fetched", {
      flags: Object.fromEntries(flags.map((flag) => [flag.key, flag.enabled])),
      plan: entitlements.plan,
      perks: entitlements.perks,
      limits: {
        dailyLikes: Number.isFinite(entitlements.limits.dailyLikes) ? entitlements.limits.dailyLikes : null,
        recommendations: entitlements.limits.recommendations,
        monthlyBoosts: entitlements.limits.monthlyBoosts,
      },
      likeAllowance,
    }),
  );
});

/** Readiness: is this instance able to serve traffic (i.e. is the database reachable)? */
export const ready = asyncHandler(async (_req: Request, res: Response) => {
  const dbOk = isDbConnected() && (await pingDb());
  res.status(dbOk ? 200 : 503).json({
    success: dbOk,
    message: dbOk ? "Ready" : "Database unavailable",
    data: { database: dbOk ? "up" : "down", uptimeSeconds: Math.round(process.uptime()), environment: env.NODE_ENV },
  });
});

/**
 * Email health: can this instance actually send mail? Only booleans, the provider name and generic advice are
 * returned — never hosts, addresses or credentials. 503 when the provider needs SMTP and the connection failed.
 */
export const emailHealth = asyncHandler(async (_req: Request, res: Response) => {
  const { health } = await checkEmailHealth();
  const smtpProblem = health.status === "smtp_unreachable" || health.status === "smtp_auth_failed" || health.status === "smtp_not_configured";
  res.status(smtpProblem ? 503 : 200).json({
    success: !smtpProblem,
    message: smtpProblem ? "Email delivery unavailable" : "Email health",
    data: health,
  });
});

/** Prometheus scrape endpoint. Token-protected; disabled in production without a token. */
export const metrics = asyncHandler(async (req: Request, res: Response) => {
  if (!env.METRICS_TOKEN) {
    if (isProduction) throw ApiError.notFound("Not found");
  } else if (!safeEqual(bearerOrHeader(req, "x-metrics-token"), env.METRICS_TOKEN)) {
    throw ApiError.unauthorized("Invalid metrics token");
  }
  const { contentType, body } = await renderMetrics();
  res.setHeader("Content-Type", contentType).status(200).send(body);
});

/** Browser error reports (from the Next.js error boundaries). Logged, never trusted. */
export const clientError = asyncHandler(async (req: Request, res: Response) => {
  const body = parseOrThrow(clientErrorBody, req.body);
  log.warn(
    {
      message: body.message.replace(/[\r\n]+/g, " "),
      digest: body.digest,
      path: body.path,
      userAgent: body.userAgent?.slice(0, 200),
      stack: body.stack?.split("\n").slice(0, 12).join("\n"),
      requestId: (req as { id?: string }).id,
    },
    "client error reported",
  );
  res.status(204).end();
});

/** Trigger a scheduled job from an external cron (Render Cron, GitHub Actions…). */
export const cronTrigger = asyncHandler(async (req: Request, res: Response) => {
  if (!env.CRON_SECRET) throw ApiError.notFound("Not found");
  if (!safeEqual(bearerOrHeader(req, "x-cron-secret"), env.CRON_SECRET)) throw ApiError.unauthorized("Invalid cron secret");

  const name = req.params.name ?? "";
  const result = await runJob(name, { force: req.query.force === "true" });
  if (result.status === "skipped" && result.reason === "unknown") throw ApiError.notFound("Unknown job");
  res.status(200).json(new ApiResponse("Job run", { result }));
});

/** Origin that stored photos are served from: the public API URL when configured, else whatever host this request used. */
function publicOrigin(req: Request): string {
  if (env.API_PUBLIC_URL) return new URL(env.API_PUBLIC_URL).origin;
  return `${req.protocol}://${req.get("host")}`;
}

export const uploadConfig = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json(new ApiResponse("Upload settings", { driver: photoDriver(), maxBytes: MAX_PHOTO_BYTES, formats: PHOTO_FORMATS }));
});

export const uploadPhoto = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  if (photoDriver() !== "local") {
    throw new ApiError(
      photoDriver() === "cloudinary" ? 409 : 501,
      photoDriver() === "cloudinary" ? "Photos upload directly to Cloudinary — request a signature from /uploads/sign." : "Photo uploads aren't set up yet.",
      { code: "LOCAL_UPLOADS_UNAVAILABLE" },
    );
  }
  const stored = await storeLocalPhoto(req.user.id, req.body, publicOrigin(req));
  res.status(201).json(new ApiResponse("Photo uploaded", stored));
});

export const deletePhoto = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  res.status(200).json(new ApiResponse("Photo removed", await removeProfilePhoto(req.user.id)));
});

export const signUpload = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  res.status(200).json(new ApiResponse("Upload signature created", createUploadSignature(req.user.id)));
});
