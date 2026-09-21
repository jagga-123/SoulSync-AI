import { apiFetch } from "@/lib/api-client";
import type { Gender, RelationshipGoal, UserProfile } from "@/types/api";

export interface ProfilePayload {
  age: number;
  gender: Gender;
  city: string;
  bio?: string;
  interests?: string[];
  relationshipGoal: RelationshipGoal;
  profileImage?: string;
}

export function createProfile(payload: ProfilePayload) {
  return apiFetch<{ profile: UserProfile }>("/profile", {
    method: "POST",
    body: payload,
  });
}

export function updateProfile(payload: Partial<ProfilePayload>) {
  return apiFetch<{ profile: UserProfile }>("/profile", {
    method: "PUT",
    body: payload,
  });
}

export function getMyProfile() {
  return apiFetch<{ profile: UserProfile }>("/profile/me");
}
