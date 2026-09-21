"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ImagePlus, Loader2, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ProfileMedia } from "@/components/shared/profile-media";
import { ApiClientError } from "@/lib/api-client";
import {
  getUploadConfig,
  removeProfilePhoto,
  uploadProfilePhoto,
  validatePhotoFile,
  type UploadConfig,
} from "@/lib/api/uploads";

interface PhotoUploaderProps {
  /** The photo currently saved on the profile ("" for none). */
  value: string;
  onChange: (url: string) => void;
  initials: string;
  /** The "paste a link" field: shown on its own when uploads are unavailable, tucked under a disclosure otherwise. */
  linkField: ReactNode;
}

/**
 * Upload / preview / replace / remove for the profile photo. When the server has no upload
 * storage it shows just the caller's "paste a link" field, exactly as before.
 */
export function PhotoUploader({ value, onChange, initials, linkField }: PhotoUploaderProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [config, setConfig] = useState<UploadConfig | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getUploadConfig()
      .then((next) => active && setConfig(next))
      .catch(() => active && setConfig({ driver: "none", maxBytes: 0, formats: [] }));
    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  if (!config) return <div className="h-24 animate-pulse rounded-2xl bg-white/5" aria-hidden="true" />;
  if (config.driver === "none") return <>{linkField}</>;

  async function handleFile(file: File | undefined) {
    if (!file || !config) return;
    setError(null);
    const problem = validatePhotoFile(file, config.maxBytes);
    if (problem) {
      setError(problem);
      return;
    }
    setPreview(URL.createObjectURL(file)); // show it instantly, while it uploads
    setBusy("upload");
    try {
      const uploaded = await uploadProfilePhoto(file, config.driver);
      onChange(uploaded.url);
      setPreview(null);
    } catch (err) {
      setPreview(null);
      setError(err instanceof ApiClientError ? err.message : "The upload failed. Please try again.");
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = ""; // lets the same file be chosen again
    }
  }

  async function handleRemove() {
    setError(null);
    setBusy("remove");
    try {
      await removeProfilePhoto();
      setPreview(null);
      onChange("");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't remove the photo. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const shown = preview ?? (value || undefined);
  const uploading = busy === "upload";

  return (
    <div className="space-y-4">
    <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
      <div className="relative shrink-0">
        <ProfileMedia src={shown} initials={initials || "?"} className="size-24 rounded-full text-2xl" />
        {busy && (
          <div
            className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45"
            role="status"
            aria-label={uploading ? "Uploading photo" : "Removing photo"}
          >
            <Loader2 className="size-6 animate-spin text-white" />
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label="Choose a profile photo"
            onChange={(event) => void handleFile(event.target.files?.[0])}
            disabled={busy !== null}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 rounded-full"
            disabled={busy !== null}
            onClick={() => inputRef.current?.click()}
          >
            {value ? <RefreshCw className="size-4" /> : <ImagePlus className="size-4" />}
            {uploading ? "Uploading…" : value ? "Replace photo" : "Upload photo"}
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-2 rounded-full text-muted-foreground hover:text-destructive"
              disabled={busy !== null}
              onClick={() => void handleRemove()}
            >
              <Trash2 className="size-4" />
              Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          JPG, PNG or WebP · up to {Math.round(config.maxBytes / 1024 / 1024)} MB
        </p>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
    <details className="text-sm">
      <summary className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground">Or paste a link to a photo instead</summary>
      <div className="mt-3">{linkField}</div>
    </details>
    </div>
  );
}
