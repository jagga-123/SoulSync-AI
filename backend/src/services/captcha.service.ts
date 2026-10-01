import { env } from "../config/env";
import { childLogger } from "../config/logger";

const log = childLogger("captcha");

/** Unset means the feature is off — every caller must check this first and skip verification
 * entirely, the same "optional, switches off cleanly" pattern as Cloudinary/Sentry/AI providers. */
export function isCaptchaConfigured(): boolean {
  return Boolean(env.TURNSTILE_SECRET_KEY);
}

/**
 * Verifies a Cloudflare Turnstile token server-side. Never throws — a verification error
 * (network, 5xx, malformed response) fails closed (returns false), same as a wrong token.
 */
export async function verifyTurnstileToken(token: string | undefined, remoteIp?: string): Promise<boolean> {
  if (!isCaptchaConfigured()) return true; // feature is off
  if (!token) return false;

  const base = (env.TURNSTILE_VERIFY_URL ?? "https://challenges.cloudflare.com/turnstile/v0/siteverify").replace(/\/$/, "");
  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET_KEY as string,
    response: token,
    ...(remoteIp ? { remoteip: remoteIp } : {}),
  });

  try {
    const res = await fetch(base, { method: "POST", body, signal: AbortSignal.timeout(10_000) });
    const json = (await res.json().catch(() => null)) as { success?: boolean; "error-codes"?: string[] } | null;
    if (!json?.success) log.info({ errors: json?.["error-codes"] }, "turnstile verification failed");
    return json?.success === true;
  } catch (err) {
    log.warn({ err }, "couldn't reach Turnstile to verify the token");
    return false;
  }
}
