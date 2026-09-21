import { apiFetch } from "@/lib/api-client";
import type { LikeEntry, LikeRecord, MatchEntry } from "@/types/api";

export function sendLike(userId: string) {
  return apiFetch<{ like: LikeRecord }>(`/likes/send/${userId}`, { method: "POST" });
}

export function getIncomingLikes() {
  return apiFetch<{ likes: LikeEntry[] }>("/likes/incoming");
}

export function getOutgoingLikes() {
  return apiFetch<{ likes: LikeEntry[] }>("/likes/outgoing");
}

export function acceptLike(likeId: string) {
  return apiFetch<{ match: MatchEntry }>(`/likes/accept/${likeId}`, { method: "POST" });
}

export function rejectLike(likeId: string) {
  return apiFetch<{ like: LikeRecord }>(`/likes/reject/${likeId}`, { method: "POST" });
}
