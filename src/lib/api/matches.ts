import { apiFetch } from "@/lib/api-client";
import type { MatchEntry } from "@/types/api";

export function getMatches() {
  return apiFetch<{ matches: MatchEntry[] }>("/matches");
}
