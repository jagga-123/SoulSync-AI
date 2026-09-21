import type { Request, Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { env } from "../config/env";

/**
 * Rate limiters. Authenticated routes are keyed by user id (a shared office/NAT
 * IP can't exhaust one user's budget, and one user can't dodge a limit by
 * switching IPs); pre-auth routes fall back to the client IP — which is why
 * TRUST_PROXY must be set correctly behind Render/Railway. Rejections use the
 * app's standard response envelope. `RATE_LIMIT_DISABLED` (never allowed in
 * production — see config/env.ts) turns them all off for automated tests.
 */
function buildLimiter(options: { windowMs: number; limit: number; message: string; byIpOnly?: boolean; mutationsOnly?: boolean }) {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    // `mutationsOnly`: reads (GET/HEAD/OPTIONS) aren't counted. The global limiter still covers them.
    skip: (req: Request) => env.RATE_LIMIT_DISABLED || (options.mutationsOnly === true && ["GET", "HEAD", "OPTIONS"].includes(req.method)),
    keyGenerator: (req: Request) =>
      (!options.byIpOnly && req.user?.id) || ipKeyGenerator(req.ip ?? ""),
    handler: (_req: Request, res: Response) => {
      res.status(429).json({ success: false, message: options.message });
    },
  });
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// ---- AI (Phase 5) ---------------------------------------------------------

/** Every /api/ai route. */
export const aiGeneralLimiter = buildLimiter({
  windowMs: 15 * MINUTE,
  limit: 300,
  message: "Too many requests. Please slow down and try again in a few minutes.",
});

/** Routes that can trigger a model call or a full analysis. A complete
 * 25-answer interview plus retries fits comfortably; scripted abuse doesn't. */
export const aiGenerationLimiter = buildLimiter({
  windowMs: 15 * MINUTE,
  limit: 60,
  message: "You're going a bit fast. Please wait a few minutes before continuing the interview.",
});

// ---- Platform (Phase 6) ---------------------------------------------------

/** A broad per-IP safety net over the whole API. */
export const globalLimiter = buildLimiter({
  windowMs: 15 * MINUTE,
  limit: env.RATE_LIMIT_GLOBAL_MAX,
  byIpOnly: true,
  message: "Too many requests from this network. Please try again shortly.",
});

/** Login / register / verification email — the brute-force and spam surface.
 * Only POSTs count: `GET /auth/me` is the session check every page load makes (twice), and
 * counting it would lock ordinary browsing out after a handful of pages. */
export const authLimiter = buildLimiter({
  windowMs: 15 * MINUTE,
  limit: env.RATE_LIMIT_AUTH_MAX,
  byIpOnly: true,
  mutationsOnly: true,
  message: "Too many attempts. Please wait a few minutes and try again.",
});

export const verificationEmailLimiter = buildLimiter({
  windowMs: HOUR,
  limit: 5,
  message: "You've requested several verification emails. Please check your inbox, or try again in an hour.",
});

export const reportLimiter = buildLimiter({
  windowMs: HOUR,
  limit: 10,
  message: "You've submitted several reports recently. Our team will review them — please try again later.",
});

export const inviteLimiter = buildLimiter({
  windowMs: 24 * HOUR,
  limit: 15,
  message: "You've reached today's invite limit. Try again tomorrow.",
});

export const waitlistLimiter = buildLimiter({
  windowMs: HOUR,
  limit: 10,
  byIpOnly: true,
  message: "Too many waitlist requests from this network. Please try again later.",
});

export const billingLimiter = buildLimiter({
  windowMs: HOUR,
  limit: 30,
  message: "Too many billing requests. Please try again later.",
});

export const clientErrorLimiter = buildLimiter({
  windowMs: 15 * MINUTE,
  limit: 30,
  byIpOnly: true,
  message: "Too many error reports.",
});

export const uploadSignLimiter = buildLimiter({
  windowMs: HOUR,
  limit: 30,
  message: "Too many upload requests. Please try again later.",
});
