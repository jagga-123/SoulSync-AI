import { apiFetch } from "@/lib/api-client";
import type { AuthUser } from "@/types/api";

export interface RegisterPayload {
  fullName: string;
  email: string;
  password: string;
  /** Phase 6 (optional): a friend's referral code, or a waitlist invite code. */
  referralCode?: string;
  inviteCode?: string;
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
