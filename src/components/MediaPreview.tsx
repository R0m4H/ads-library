"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import clsx from "clsx";
import { isExpiredSignedUrl } from "@/lib/media";

/** Shown instead of an ad's picture or video when nothing we have for it works any more. */
export function ExpiredPreview({ className }: { className?: string }) {
  return (
    <div className={clsx("flex h-full w-full flex-col items-center justify-center gap-1 bg-neutral-100 px-4 text-center text-neutral-400", className)}>
      <ImageOff className="h-6 w-6" />
      <span className="text-xs font-medium text-neutral-500">Preview expired</span>
      <span className="text-[11px] leading-snug">Meta&apos;s image link has run out. It comes back when this ad is synced again.</span>
    </div>
  );
}

/** Our saved copy first; then Meta's link, unless it is already past its expiry time; then the placeholder. */
function usableSources(savedSrc: string | undefined, src: string | undefined): string[] {
  return [savedSrc, src && !isExpiredSignedUrl(src) ? src : undefined].filter((s): s is string => Boolean(s));
}

/**
 * An ad picture. It tries our saved copy first, then Meta's link (which may have expired — one that is
 * already past its expiry time is not even requested), and shows `ExpiredPreview` if none of them load.
 */
export function PreviewImage({
  src,
  savedSrc,
  alt,
  className,
  placeholderClassName,
}: {
  src?: string;
  savedSrc?: string;
  alt: string;
  className?: string;
  placeholderClassName?: string;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const current = usableSources(savedSrc, src).find((s) => !failed.includes(s));
  if (!current) return <ExpiredPreview className={placeholderClassName} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={current} alt={alt} className={className} onError={() => setFailed((f) => [...f, current])} />;
}

/**
 * A video. While Meta's own link works it plays that (the HD version); once that expires it plays our saved SD copy,
 * and if there is none, shows the saved still image, and otherwise the placeholder.
 */
export function PreviewVideo({
  src,
  poster,
  savedVideo,
  savedStill,
  className,
  placeholderClassName,
}: {
  src: string;
  poster?: string;
  savedVideo?: string;
  savedStill?: string;
  className?: string;
  placeholderClassName?: string;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const fail = (url: string) => setFailed((f) => [...f, url]);
  const thumbnail = savedStill ?? poster;

  if (!isExpiredSignedUrl(src) && !failed.includes(src)) {
    return <video src={src} controls poster={thumbnail} className={className} onError={() => fail(src)} />;
  }
  if (savedVideo && !failed.includes(savedVideo)) {
    return <video src={savedVideo} controls poster={thumbnail} className={className} onError={() => fail(savedVideo)} />;
  }
  return thumbnail ? (
    <PreviewImage src={poster} savedSrc={savedStill} alt="Video preview" className={clsx(className, "object-cover")} placeholderClassName={placeholderClassName} />
  ) : (
    <ExpiredPreview className={placeholderClassName} />
  );
}
