import { apiFetch } from "@/lib/api-client";
import type { DiscoverResult, RelationshipGoal } from "@/types/api";

export interface DiscoverFilters {
  page?: number;
  limit?: number;
  city?: string;
  relationshipGoal?: RelationshipGoal;
  /** Phase 6 premium perk: advanced filters (403/402 unless the flag is on and the plan includes it). */
  ageMin?: number;
  ageMax?: number;
  gender?: string;
  interests?: string;
}

export function getDiscoverUsers(filters: DiscoverFilters = {}) {
  const params = new URLSearchParams();
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.city) params.set("city", filters.city);
  if (filters.relationshipGoal) params.set("relationshipGoal", filters.relationshipGoal);
  if (filters.ageMin) params.set("ageMin", String(filters.ageMin));
  if (filters.ageMax) params.set("ageMax", String(filters.ageMax));
  if (filters.gender) params.set("gender", filters.gender);
  if (filters.interests) params.set("interests", filters.interests);

  const query = params.toString();
  return apiFetch<DiscoverResult>(`/discover${query ? `?${query}` : ""}`);
}
