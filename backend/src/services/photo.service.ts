import { randomBytes } from "node:crypto";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { env, isProduction } from "../config/env";
import { childLogger } from "../config/logger";
import { Profile } from "../models/Profile.model";
import { ApiError } from "../utils/ApiError";
import { isStorageConfigured, deleteCloudinaryImage } from "./upload.service";

const log = childLogger("photos");

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PHOTO_FORMATS = ["jpg", "jpeg", "png", "webp"];

/** A decompression-bomb guard: refuse to decode anything above ~40 megapixels. */
const MAX_INPUT_PIXELS = 40_000_000;
const MIN_SIDE_PX = 64;
const FULL_MAX_SIDE_PX = 1080;
const THUMB_SIDE_PX = 256;
/** Uploads that no profile references and that are older than this get cleaned up. */
const ORPHAN_AFTER_MS = 60 * 60 * 1000;

const PUBLIC_PREFIX = "/uploads/profiles";

export type PhotoDriver = "cloudinary" | "local" | "none";

export function isLocalUploadsEnabled(): boolean {
  if (env.LOCAL_UPLOADS === "off") return false;
  if (env.LOCAL_UPLOADS === "on") return true;
  return !isProduction;
}

/** Which storage a photo upload would use right now. Cloudinary wins whenever it is configured. */
export function photoDriver(): PhotoDriver {
  if (isStorageConfigured()) return "cloudinary";
  return isLocalUploadsEnabled() ? "local" : "none";
}

/** Directory the local driver writes to (and the static route serves). */
export function uploadRoot(): string {
  return path.resolve(env.UPLOAD_DIR ?? path.join(__dirname, "../../uploads"), "profiles");
}

/** Magic-byte sniffing: the declared Content-Type is never trusted on its own. */
export function sniffImageType(buffer: Buffer): "jpeg" | "png" | "webp" | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

const isSafeId = (value: string) => /^[a-f0-9]{24}$/i.test(value);

export interface StoredPhoto {
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  bytes: number;
  provider: "local";
}

/**
 * Validates and stores a profile photo on local disk. The upload is DECODED and
 * RE-ENCODED (never copied through): that proves it really is an image, applies
 * the EXIF rotation, and drops all metadata (GPS position included) before it
 * is served to other members. Produces a full-size and a square thumbnail.
 */
export async function storeLocalPhoto(userId: string, bytes: unknown, baseUrl: string): Promise<StoredPhoto> {
  if (!isSafeId(userId)) throw ApiError.badRequest("Invalid user.");
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    throw new ApiError(415, "Send the image as raw bytes with a Content-Type of image/jpeg, image/png or image/webp.", { code: "UNSUPPORTED_MEDIA_TYPE" });
  }
  if (bytes.length > MAX_PHOTO_BYTES) throw new ApiError(413, "Photos can be at most 5 MB.", { code: "PHOTO_TOO_LARGE" });
  if (!sniffImageType(bytes)) {
    throw new ApiError(422, "That file isn't a JPG, PNG or WebP image.", { code: "INVALID_IMAGE" });
  }

  let full: { data: Buffer; info: { width: number; height: number } };
  let thumb: Buffer;
  try {
    const source = () => sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" }).rotate();
    const meta = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    if ((meta.width ?? 0) < MIN_SIDE_PX || (meta.height ?? 0) < MIN_SIDE_PX) {
      throw new ApiError(422, `The photo is too small — use one at least ${MIN_SIDE_PX}×${MIN_SIDE_PX} pixels.`, { code: "PHOTO_TOO_SMALL" });
    }
    full = await source().resize(FULL_MAX_SIDE_PX, FULL_MAX_SIDE_PX, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    thumb = await source().resize(THUMB_SIDE_PX, THUMB_SIDE_PX, { fit: "cover", position: "attention" }).webp({ quality: 78 }).toBuffer();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    log.info({ err: err instanceof Error ? err.message : String(err) }, "rejected an undecodable upload");
    throw new ApiError(422, "That image couldn't be read — it may be corrupted or too large.", { code: "INVALID_IMAGE" });
  }

  const dir = path.join(uploadRoot(), userId);
  await mkdir(dir, { recursive: true });
  const id = randomBytes(12).toString("hex");
  await Promise.all([writeFile(path.join(dir, `${id}.webp`), full.data), writeFile(path.join(dir, `${id}-thumb.webp`), thumb)]);

  const root = baseUrl.replace(/\/$/, "");
  await pruneOrphans(userId).catch((err) => log.warn({ err }, "photo cleanup failed"));

  return {
    url: `${root}${PUBLIC_PREFIX}/${userId}/${id}.webp`,
    thumbnailUrl: `${root}${PUBLIC_PREFIX}/${userId}/${id}-thumb.webp`,
    width: full.info.width,
    height: full.info.height,
    bytes: full.data.length,
    provider: "local",
  };
}

/** The `<userId>/<file>` part of one of OUR photo URLs, or null for any other URL. */
function localRelativePath(url: string): { userId: string; file: string } | null {
  try {
    const { pathname } = new URL(url);
    const match = pathname.match(/^\/uploads\/profiles\/([a-f0-9]{24})\/([a-f0-9]{24}(?:-thumb)?\.webp)$/i);
    return match ? { userId: match[1] as string, file: match[2] as string } : null;
  } catch {
    return null;
  }
}

/** Removes a photo (and its thumbnail) — only if the URL is one of `userId`'s OWN uploads. Never throws. */
export async function deleteStoredPhoto(userId: string, url: string | undefined | null): Promise<void> {
  if (!url) return;
  try {
    const local = localRelativePath(url);
    if (local) {
      if (local.userId.toLowerCase() !== userId.toLowerCase()) return; // someone else's file: hands off
      const base = local.file.replace(/-thumb\.webp$|\.webp$/, "");
      await Promise.all([`${base}.webp`, `${base}-thumb.webp`].map((file) => rm(path.join(uploadRoot(), local.userId, file), { force: true })));
      return;
    }
    if (isStorageConfigured()) await deleteCloudinaryImage(userId, url);
  } catch (err) {
    log.warn({ err }, "couldn't delete a stored photo");
  }
}

/** Deletes a user's local uploads that their profile doesn't reference and that are older than an hour. */
async function pruneOrphans(userId: string): Promise<void> {
  const dir = path.join(uploadRoot(), userId);
  const [files, profile] = await Promise.all([readdir(dir).catch(() => [] as string[]), Profile.findOne({ userId }).select("profileImage").lean()]);
  const inUse = localRelativePath(profile?.profileImage ?? "")?.file.replace(/\.webp$/, "");
  for (const file of files) {
    const base = file.replace(/-thumb\.webp$|\.webp$/, "");
    if (base === inUse) continue;
    const { mtimeMs } = await stat(path.join(dir, file));
    if (Date.now() - mtimeMs > ORPHAN_AFTER_MS) await rm(path.join(dir, file), { force: true });
  }
}

/** Removes the member's photo everywhere: their files and the profile's reference. */
export async function removeProfilePhoto(userId: string): Promise<{ removed: boolean }> {
  const profile = await Profile.findOne({ userId }).select("profileImage");
  const current = profile?.profileImage;
  await deleteStoredPhoto(userId, current);
  // Also sweep any unreferenced uploads of this member: "remove" should leave nothing behind.
  if (isLocalUploadsEnabled() || localRelativePath(current ?? "")) {
    await rm(path.join(uploadRoot(), userId), { recursive: true, force: true }).catch(() => undefined);
  }
  if (profile) await Profile.updateOne({ userId }, { $unset: { profileImage: 1 } });
  return { removed: Boolean(current) };
}
