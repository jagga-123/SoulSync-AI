import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { isCaptchaConfigured, verifyTurnstileToken } from "../services/captcha.service";

/**
 * Verifies a Cloudflare Turnstile token on `req.body.captchaToken` before letting the request
 * through. A no-op when TURNSTILE_SECRET_KEY isn't set — register/forgot-password behave exactly
 * as they did before this feature existed, which is the realistic state for local dev and until
 * a real site is configured in production.
 */
export const requireCaptcha = asyncHandler(async (req: Request, _res: Response, next) => {
  if (!isCaptchaConfigured()) {
    next();
    return;
  }

  const token = (req.body as { captchaToken?: unknown })?.captchaToken;
  const ok = await verifyTurnstileToken(typeof token === "string" ? token : undefined, req.ip);
  if (!ok) {
    next(new ApiError(400, "Please complete the verification challenge and try again.", { code: "CAPTCHA_FAILED" }));
    return;
  }
  next();
});
