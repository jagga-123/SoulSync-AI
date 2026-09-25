"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { thumbnailUrl } from "@/lib/image-url";

interface ProfileMediaProps {
  src?: string;
  initials: string;
  gradient?: string;
  className?: string;
  /** Small avatar use: load the photo's square thumbnail instead of the full image. */
  thumb?: boolean;
}

/**
 * Shows a user's profileImage when present, falling back to a gradient
 * initials panel when it's missing or fails to load. Shape (circle, rounded
 * panel, etc.) is entirely up to the caller's className — this just fills it.
 * `unoptimized` lets it accept arbitrary user-submitted URLs without a
 * next.config domain allowlist.
 */
export function ProfileMedia({
  src,
  initials,
  gradient = "from-primary to-secondary",
  className,
  thumb = false,
}: ProfileMediaProps) {
  const [failed, setFailed] = useState(false);
  const [useFull, setUseFull] = useState(false);
  // A new photo (e.g. after an upload) deserves a fresh attempt, even if the previous one failed to load.
  useEffect(() => {
    setFailed(false);
    setUseFull(false);
  }, [src]);
  const shownSrc = thumb && !useFull ? thumbnailUrl(src) : src;
  const showImage = Boolean(shownSrc) && !failed;

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br font-display font-semibold text-primary-foreground",
        !showImage && gradient,
        className,
      )}
    >
      {showImage ? (
        <Image
          src={shownSrc as string}
          alt=""
          fill
          unoptimized
          sizes="240px"
          className="object-cover"
          onError={() => {
            // No thumbnail (e.g. a pasted link)? Try the full image before giving up.
            if (thumb && !useFull && shownSrc !== src) setUseFull(true);
            else setFailed(true);
          }}
        />
      ) : (
        <>
          <span className="drop-shadow-sm">{initials}</span>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_55%)]" />
        </>
      )}
    </div>
  );
}
