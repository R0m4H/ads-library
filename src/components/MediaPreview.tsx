"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import clsx from "clsx";
import { isExpiredSignedUrl } from "@/lib/media";

/** Shown instead of an ad's picture or video when its (temporary) link no longer works. */
export function ExpiredPreview({ className }: { className?: string }) {
  return (
    <div className={clsx("flex h-full w-full flex-col items-center justify-center gap-1 bg-neutral-100 px-4 text-center text-neutral-400", className)}>
      <ImageOff className="h-6 w-6" />
      <span className="text-xs font-medium text-neutral-500">Preview expired</span>
      <span className="text-[11px] leading-snug">Meta&apos;s image link has run out. It comes back when this ad is synced again.</span>
    </div>
  );
}

/**
 * An image that falls back to `ExpiredPreview`. A link that is already past its expiry time is not even
 * requested; any other load failure falls back the same way.
 */
export function PreviewImage({
  src,
  alt,
  className,
  placeholderClassName,
}: {
  src: string;
  alt: string;
  className?: string;
  placeholderClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed || isExpiredSignedUrl(src)) return <ExpiredPreview className={placeholderClassName} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}

export function PreviewVideo({
  src,
  poster,
  className,
  placeholderClassName,
}: {
  src: string;
  poster?: string;
  className?: string;
  placeholderClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed || isExpiredSignedUrl(src)) return <ExpiredPreview className={placeholderClassName} />;
  return <video src={src} controls poster={poster} className={className} onError={() => setFailed(true)} />;
}
