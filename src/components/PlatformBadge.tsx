import clsx from "clsx";
import type { Platform } from "@/lib/types";

const STYLES: Record<Platform, string> = {
  meta: "bg-blue-50 text-blue-700 ring-blue-200",
  google: "bg-amber-50 text-amber-700 ring-amber-200",
  tiktok: "bg-neutral-100 text-neutral-800 ring-neutral-300",
  linkedin: "bg-sky-50 text-sky-700 ring-sky-200",
};

const LABELS: Record<Platform, string> = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
};

export function PlatformBadge({ platform }: { platform: Platform }) {
  return (
    <span className={clsx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", STYLES[platform])}>
      {LABELS[platform]}
    </span>
  );
}
