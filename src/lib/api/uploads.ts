import { API_URL } from "@/lib/env";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { getToken } from "@/lib/auth-storage";
import { thumbnailUrl } from "@/lib/image-url";
import type { ApiErrorBody, ApiSuccessBody } from "@/types/api";

export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

export interface UploadConfig {
  /** "local" = this API stores the file, "cloudinary" = direct signed upload, "none" = uploads unavailable. */
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

/** Uploads through this API (raw bytes, so no multipart parsing) — the driver used when Cloudinary isn't configured. */
async function uploadLocal(file: File): Promise<UploadedPhoto> {
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

interface CloudinarySignature {
  uploadUrl: string;
  apiKey: string;
  allowed_formats: string;
  folder: string;
  timestamp: number;
  signature: string;
}

/** Signed direct upload: the bytes go browser → Cloudinary, the API only signs the request. */
async function uploadCloudinary(file: File): Promise<UploadedPhoto> {
  const sign = await apiFetch<CloudinarySignature>("/uploads/sign", { method: "POST" });
  const form = new FormData();
  form.set("file", file);
  form.set("api_key", sign.apiKey);
  form.set("timestamp", String(sign.timestamp));
  form.set("folder", sign.folder);
  form.set("allowed_formats", sign.allowed_formats);
  form.set("signature", sign.signature);

  const response = await networkFailure(fetch(sign.uploadUrl, { method: "POST", body: form }));
  const json = (await response.json().catch(() => null)) as { secure_url?: string; error?: { message?: string } } | null;
  if (!response.ok || !json?.secure_url) {
    throw new ApiClientError(json?.error?.message ?? "Cloudinary rejected the upload.", response.status);
  }
  return { url: json.secure_url, thumbnailUrl: thumbnailUrl(json.secure_url) ?? json.secure_url };
}

export function uploadProfilePhoto(file: File, driver: UploadConfig["driver"]): Promise<UploadedPhoto> {
  if (driver === "cloudinary") return uploadCloudinary(file);
  if (driver === "local") return uploadLocal(file);
  throw new ApiClientError("Photo uploads aren't set up yet.", 501);
}

/** Removes the member's photo from storage and from their profile. */
export function removeProfilePhoto() {
  return apiFetch<{ removed: boolean }>("/uploads/profile-photo", { method: "DELETE" });
}
