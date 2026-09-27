import { API_URL } from "@/lib/env";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { getToken } from "@/lib/auth-storage";
import type { ApiErrorBody, ApiSuccessBody } from "@/types/api";

export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

export interface UploadConfig {
  /** Either way the bytes go through this API first — it decides where they end up. "none" = uploads unavailable. */
  driver: "cloudinary" | "local" | "none";
  maxBytes: number;
  formats: string[];
}

export interface UploadedPhoto {
  url: string;
  thumbnailUrl: string;
}

export function getUploadConfig() {
  return apiFetch<UploadConfig>("/uploads/config");
}

/** Client-side pre-check (the server validates again). Returns a message, or null when the file is fine. */
export function validatePhotoFile(file: File, maxBytes = PHOTO_MAX_BYTES): string | null {
  if (!PHOTO_TYPES.includes(file.type)) return "Please choose a JPG, PNG or WebP image.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > maxBytes) {
    return `That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${Math.round(maxBytes / 1024 / 1024)} MB.`;
  }
  return null;
}

async function readJson<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => null)) as ApiSuccessBody<T> | ApiErrorBody | null;
  if (!response.ok || !json || json.success === false) {
    throw new ApiClientError(json?.message ?? `Upload failed with status ${response.status}`, response.status);
  }
  return json.data;
}

async function networkFailure<T>(request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (err) {
    if (err instanceof ApiClientError) throw err;
    throw new ApiClientError("Couldn't reach the server to upload the photo. Please try again.", 0);
  }
}

/** Uploads through this API (raw bytes, so no multipart parsing) — it validates, re-encodes and
 * strips metadata before storing the photo locally or on Cloudinary, whichever is configured. */
async function uploadViaApi(file: File): Promise<UploadedPhoto> {
  const token = getToken();
  const data = await networkFailure(
    fetch(`${API_URL}/uploads/profile-photo`, {
      method: "POST",
      headers: { "Content-Type": file.type, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: file,
    }).then((response) => readJson<{ url: string; thumbnailUrl: string }>(response)),
  );
  return { url: data.url, thumbnailUrl: data.thumbnailUrl };
}

export function uploadProfilePhoto(file: File, driver: UploadConfig["driver"]): Promise<UploadedPhoto> {
  if (driver === "none") throw new ApiClientError("Photo uploads aren't set up yet.", 501);
  return uploadViaApi(file);
}

/** Removes the member's photo from storage and from their profile. */
export function removeProfilePhoto() {
  return apiFetch<{ removed: boolean }>("/uploads/profile-photo", { method: "DELETE" });
}
