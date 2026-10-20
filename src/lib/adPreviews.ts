import type { PreviewEntry } from "./types";

/** Helpers for an ad's saved pictures. Safe to use in the browser (no server-only code). */

export type Shape = "square" | "vertical" | "horizontal";

export function shapeOf(w: number, h: number): Shape {
  const ratio = w / h;
  return ratio > 1.1 ? "horizontal" : ratio < 0.9 ? "vertical" : "square";
}

export const SHAPE_LABEL: Record<Shape, string> = { square: "Square", vertical: "Vertical", horizontal: "Horizontal" };

export const savedImageSrc = (adId: string, i: number) => `/api/ads/${adId}/preview?i=${i}`;
export const savedVideoSrc = (adId: string, i: number) => `/api/ads/${adId}/video?i=${i}`;

export function entryFor(ad: { previews?: PreviewEntry[] | null }, i: number): PreviewEntry | undefined {
  return ad.previews?.find((e) => e.i === i);
}

/**
 * Which of an ad's saved pictures the card shows: the one closest to square, so it fills the square card without
 * cropping (many ads carry a vertical and a square version of the same creative). Ties go to the earlier one.
 */
export function cardEntry(ad: { previews?: PreviewEntry[] | null }): PreviewEntry | undefined {
  const entries = (ad.previews ?? []).filter((e) => e.key); // an entry can exist for a video that has no still image
  let best: PreviewEntry | undefined;
  let bestScore = Infinity;
  for (const e of entries) {
    if (!e.w || !e.h) continue;
    const score = Math.abs(Math.log(e.w / e.h));
    if (score < bestScore - 1e-9) {
      best = e;
      bestScore = score;
    }
  }
  return best ?? entries[0];
}
