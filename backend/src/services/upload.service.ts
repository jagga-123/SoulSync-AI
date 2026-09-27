import { createHash, randomBytes } from "node:crypto";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

export const ALLOWED_IMAGE_FORMATS = "jpg,jpeg,png,webp";

const CLOUDINARY_HOST = "res.cloudinary.com";

export function isStorageConfigured(): boolean {
  return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}

/**
 * Cloudinary's signed-upload scheme: SHA-1 of the request params sorted by key
 * and joined as `k=v&k=v`, with the API secret appended. (`file`, `api_key`,
 * `resource_type` and the signature itself are excluded from the signed string.)
 */
export function signCloudinaryParams(params: Record<string, string | number>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .filter((key) => params[key] !== "" && params[key] !== undefined)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1").update(toSign + apiSecret).digest("hex");
}

/**
 * Uploads an already-validated, already-re-encoded image buffer to Cloudinary from the
 * server (a signed Admin-API call, same as `deleteCloudinaryImage`). Image bytes always pass
 * through this API first — never browser-to-Cloudinary directly — so every photo gets the same
 * magic-byte check, decode/re-encode and EXIF/GPS stripping regardless of which driver stores it.
 */
export async function uploadToCloudinary(userId: string, buffer: Buffer): Promise<string> {
  if (!isStorageConfigured()) throw new ApiError(501, "Photo uploads aren't set up yet.", { code: "STORAGE_NOT_CONFIGURED" });

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `${env.CLOUDINARY_UPLOAD_FOLDER}/${userId}`;
  const publicId = randomBytes(12).toString("hex");
  const signedParams = { folder, public_id: publicId, timestamp };
  const base = (env.CLOUDINARY_API_BASE ?? "https://api.cloudinary.com").replace(/\/$/, "");

  const form = new FormData();
  form.set("file", new Blob([buffer], { type: "image/webp" }), `${publicId}.webp`);
  form.set("api_key", env.CLOUDINARY_API_KEY as string);
  form.set("timestamp", String(timestamp));
  form.set("folder", folder);
  form.set("public_id", publicId);
  form.set("signature", signCloudinaryParams(signedParams, env.CLOUDINARY_API_SECRET as string));

  const res = await fetch(`${base}/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/upload`, { method: "POST", body: form, signal: AbortSignal.timeout(20_000) });
  const json = (await res.json().catch(() => null)) as { secure_url?: string; error?: { message?: string } } | null;
  if (!res.ok || !json?.secure_url) {
    throw new ApiError(502, json?.error?.message ?? "Couldn't upload the photo. Please try again.", { code: "UPLOAD_FAILED" });
  }
  return json.secure_url;
}

/**
 * The Cloudinary public id inside one of OUR delivery URLs
 * (`https://res.cloudinary.com/<cloud>/image/upload/[transforms/][v123/]<folder>/<userId>/<id>.<ext>`),
 * or null when the URL is anything else. Only ids inside this member's own folder qualify —
 * a member can put any URL in their profile, and must not be able to delete someone else's photo.
 */
export function cloudinaryPublicId(userId: string, url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== CLOUDINARY_HOST || !parsed.pathname.startsWith(`/${env.CLOUDINARY_CLOUD_NAME}/image/upload/`)) return null;
    const tail = parsed.pathname.slice(`/${env.CLOUDINARY_CLOUD_NAME}/image/upload/`.length).replace(/\.[a-z0-9]+$/i, "");
    const ownFolder = `${env.CLOUDINARY_UPLOAD_FOLDER}/${userId}/`;
    const at = tail.indexOf(ownFolder);
    if (at === -1) return null;
    const id = tail.slice(at);
    return id.length > ownFolder.length && !id.includes("..") ? id : null;
  } catch {
    return null;
  }
}

/** Deletes one of the member's own images from Cloudinary (signed Admin-API call). Best effort: never throws. */
export async function deleteCloudinaryImage(userId: string, url: string): Promise<void> {
  const publicId = cloudinaryPublicId(userId, url);
  if (!publicId || !isStorageConfigured()) return;

  const timestamp = Math.floor(Date.now() / 1000);
  const params = { public_id: publicId, timestamp };
  const base = (env.CLOUDINARY_API_BASE ?? "https://api.cloudinary.com").replace(/\/$/, "");
  const body = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    api_key: env.CLOUDINARY_API_KEY as string,
    signature: signCloudinaryParams(params, env.CLOUDINARY_API_SECRET as string),
  });
  await fetch(`${base}/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/destroy`, { method: "POST", body, signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
}

/** A small square version of one of our photo URLs (local `-thumb.webp`, or a Cloudinary transformation). */
export function thumbnailFor(url: string): string {
  if (/\/uploads\/profiles\/[a-f0-9]{24}\/[a-f0-9]{24}\.webp$/i.test(url)) return url.replace(/\.webp$/i, "-thumb.webp");
  if (url.includes(`${CLOUDINARY_HOST}/`) && url.includes("/image/upload/")) return url.replace("/image/upload/", "/image/upload/c_fill,g_auto,w_256,h_256,q_auto,f_auto/");
  return url;
}
