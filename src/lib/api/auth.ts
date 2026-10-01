import { apiFetch } from "@/lib/api-client";
import type { AuthUser } from "@/types/api";

export interface RegisterPayload {
  fullName: string;
  email: string;
  password: string;
  /** Phase 6 (optional): a friend's referral code, or a waitlist invite code. */
  referralCode?: string;
  inviteCode?: string;
  /** Only meaningful when CAPTCHA is configured; harmless/ignored otherwise. */
  captchaToken?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export function registerUser(payload: RegisterPayload) {
  return apiFetch<{ user: AuthUser }>("/auth/register", {
    method: "POST",
    body: payload,
    auth: false,
  });
}

export function loginUser(payload: LoginPayload) {
  return apiFetch<{ user: AuthUser; token: string }>("/auth/login", {
    method: "POST",
    body: payload,
    auth: false,
  });
}

export function getCurrentUser() {
  return apiFetch<{ user: AuthUser }>("/auth/me");
}

/** Always resolves the same way, whether or not the address has an account — the server
 * deliberately never reveals which emails are registered. */
export function forgotPassword(email: string, captchaToken?: string) {
  return apiFetch<{ ok: true }>("/auth/forgot-password", {
    method: "POST",
    body: { email, captchaToken },
    auth: false,
  });
}

export function resetPassword(token: string, password: string) {
  return apiFetch<{ ok: true }>("/auth/reset-password", {
    method: "POST",
    body: { token, password },
    auth: false,
  });
}
