import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isExpiredSignedUrl } from "./media";
import { putObject } from "./r2";
import type { AdMedia, PreviewEntry } from "./types";

/** Longest side we keep. Cards show a square about 300px wide, so this is sharp on high-density screens. */
export const PREVIEW_WIDTH = 640;
/** Most pictures kept per ad (catalog-style ads can carry 20 cards; the first ten are plenty). */
export const MAX_ITEMS_PER_AD = 10;
// Some ads ship a very large original (a handful are over 8 MB); only the small copy we make is kept.
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
/** Videos are saved in their smaller (SD) version, usually 1-2 MB; anything bigger than this is left on Meta. */
export const MAX_VIDEO_BYTES = 15 * 1024 * 1024;
/**
 * Ads seen this recently may still have a working picture link (links last about 4-5 days after a sync).
 * Older ones are skipped without even looking at them, so checking stays cheap as the library grows.
 */
export const RECENT_DAYS = 6;

export const imageKey = (adId: string, i: number) => `previews/${adId}/${i}.webp`;
export const videoKey = (adId: string, i: number) => `previews/${adId}/${i}.mp4`;

/** The picture to copy for a media item: the image itself, or a video's still image. */
export const imageSourceOf = (m: AdMedia): string | null => (m.type === "video" ? m.thumbnail_url : m.url) ?? null;

/** Downloads a file, refusing the wrong type or an unreasonable size. */
export async function downloadFile(url: string, opts: { accept: string; maxBytes: number; timeoutMs: number }): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`download failed (${res.status})`);
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith(opts.accept)) throw new Error(`not ${opts.accept.replace("/", "")} content (${type || "unknown type"})`);
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > opts.maxBytes) throw new Error("file is too large");
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > opts.maxBytes) throw new Error("file is too large");
    return bytes;
  } finally {
    clearTimeout(timer);
  }
}

export const downloadImage = (url: string) => downloadFile(url, { accept: "image/", maxBytes: MAX_IMAGE_BYTES, timeoutMs: 15_000 });

/** Shrinks a picture to a small WebP — a few tens of KB — and reports its size, so square/vertical/horizontal is known. */
export async function toThumbnail(input: Buffer): Promise<{ buffer: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(input)
    .rotate()
    .resize({ width: PREVIEW_WIDTH, withoutEnlargement: true })
    .webp({ quality: 74 })
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height };
}

/** Does this ad have anything we can still copy? (a picture without a saved copy, or a video still to be saved) */
export function needsWork(media: AdMedia[] | null | undefined, previews: PreviewEntry[] | null | undefined, nowMs: number = Date.now()): boolean {
  const saved = new Map((previews ?? []).map((e) => [e.i, e]));
  const items = (media ?? []).slice(0, MAX_ITEMS_PER_AD);
  for (let i = 0; i < items.length; i++) {
    const m = items[i];
    const entry = saved.get(i);
    const src = imageSourceOf(m);
    if (!entry && src && !isExpiredSignedUrl(src, nowMs)) return true;
    // A video with no still image still gets its video saved (its entry then has no picture).
    if (m.type === "video" && !entry && !src && !isExpiredSignedUrl(m.sd_url ?? m.url, nowMs)) return true;
    if (m.type === "video" && entry && !entry.video_key && !entry.video_skipped && !isExpiredSignedUrl(m.sd_url ?? m.url, nowMs)) return true;
  }
  return false;
}

export interface Candidate {
  id: string;
  media: AdMedia[];
  previews: PreviewEntry[];
}

/**
 * Walks recently seen ads in id order, starting after `cursor`, and returns up to `max` that still have something
 * to copy. `cursor` is the last id looked at, to continue from; `reachedEnd` says nothing is left.
 */
export async function scanCandidates(
  supabase: SupabaseClient,
  cursor: string | null,
  max: number,
  nowMs: number = Date.now()
): Promise<{ picked: Candidate[]; cursor: string | null; reachedEnd: boolean; error?: string }> {
  const since = new Date(nowMs - RECENT_DAYS * 86_400_000).toISOString();
  const pageSize = 500;
  const picked: Candidate[] = [];
  let reachedEnd = false;

  while (picked.length < max) {
    let query = supabase.from("ads").select("id, media, previews").gte("last_seen_at", since);
    if (cursor) query = query.gt("id", cursor);
    const { data, error } = await query.order("id").limit(pageSize);
    if (error) return { picked, cursor, reachedEnd, error: error.message };
    const rows = (data as { id: string; media: AdMedia[] | null; previews: PreviewEntry[] | null }[] | null) ?? [];
    for (const row of rows) {
      cursor = row.id;
      if (needsWork(row.media, row.previews, nowMs)) picked.push({ id: row.id, media: row.media ?? [], previews: row.previews ?? [] });
      if (picked.length >= max) break;
    }
    if (rows.length < pageSize && picked.length < max) {
      reachedEnd = true;
      break;
    }
  }
  return { picked, cursor, reachedEnd };
}

/** The SD link of a video from the scraper data we kept, for ads saved before we remembered it separately. */
function findSdUrl(raw: Record<string, unknown> | null, m: AdMedia): string | undefined {
  const snapshot = (raw?.snapshot ?? {}) as { videos?: Record<string, unknown>[]; cards?: Record<string, unknown>[] };
  const pool = [...(snapshot.videos ?? []), ...(snapshot.cards ?? [])];
  const hit = pool.find((v) => v.video_hd_url === m.url || v.video_sd_url === m.url);
  return typeof hit?.video_sd_url === "string" ? hit.video_sd_url : undefined;
}

export interface SaveAdResult {
  images: number;
  videos: number;
  failures: string[];
}

/**
 * Copies one ad's pictures (every variant: both sizes of a dynamic-creative ad, each carousel card, a video's
 * still image) and the SD version of each video into R2, and records what was saved on the ad. Safe to repeat:
 * anything already saved is left alone. One failing file does not stop the rest.
 */
export async function saveAd(
  supabase: SupabaseClient,
  ad: Candidate,
  opts: { nowMs?: number; put?: (key: string, body: Buffer, contentType: string) => Promise<void> } = {}
): Promise<SaveAdResult> {
  const nowMs = opts.nowMs ?? Date.now();
  const put = opts.put ?? putObject;
  const entries = new Map<number, PreviewEntry>(ad.previews.map((e) => [e.i, { ...e }]));
  const bySource = new Map<string, PreviewEntry>();
  const failures: string[] = [];
  let images = 0;
  let videos = 0;
  let changed = false;
  let raw: Record<string, unknown> | null | undefined;

  const items = ad.media.slice(0, MAX_ITEMS_PER_AD);
  for (let i = 0; i < items.length; i++) {
    const m = items[i];
    const src = imageSourceOf(m);
    let entry = entries.get(i);

    if (!entry && src && !isExpiredSignedUrl(src, nowMs)) {
      const same = bySource.get(src);
      if (same) {
        // The same picture appears twice in this ad: point at the copy we already made.
        entry = { i, key: same.key, w: same.w, h: same.h };
      } else {
        try {
          const thumb = await toThumbnail(await downloadImage(src));
          const key = imageKey(ad.id, i);
          await put(key, thumb.buffer, "image/webp");
          entry = { i, key, w: thumb.width, h: thumb.height };
          images++;
          bySource.set(src, entry);
        } catch (e) {
          failures.push(e instanceof Error ? e.message : "failed");
          continue;
        }
      }
      entries.set(i, entry);
      changed = true;
    } else if (!entry && m.type === "video" && !src && !isExpiredSignedUrl(m.sd_url ?? m.url, nowMs)) {
      // No still image to keep, but the video itself can still be saved: an entry with no picture.
      entry = { i, key: "", w: 0, h: 0 };
      entries.set(i, entry);
      changed = true;
    }

    if (entry && m.type === "video" && !entry.video_key && !entry.video_skipped) {
      let sd = m.sd_url;
      if (!sd) {
        if (raw === undefined) {
          const { data } = await supabase.from("ads").select("raw").eq("id", ad.id).single();
          raw = (data?.raw as Record<string, unknown> | null) ?? null;
        }
        sd = findSdUrl(raw, m);
      }
      const videoUrl = sd ?? m.url;
      if (!isExpiredSignedUrl(videoUrl, nowMs)) {
        try {
          const bytes = await downloadFile(videoUrl, { accept: "video/", maxBytes: MAX_VIDEO_BYTES, timeoutMs: 40_000 });
          const key = videoKey(ad.id, i);
          await put(key, bytes, "video/mp4");
          entry.video_key = key;
          entry.video_bytes = bytes.length;
          videos++;
          changed = true;
        } catch (e) {
          const message = e instanceof Error ? e.message : "failed";
          // A video that is simply too big is left on Meta for good; a network hiccup is retried next time.
          if (/too large|not video/.test(message)) {
            entry.video_skipped = message.slice(0, 80);
            changed = true;
          } else {
            failures.push(`video: ${message}`);
          }
        }
      }
    }
  }

  if (changed) {
    const { error } = await supabase
      .from("ads")
      .update({ previews: [...entries.values()].sort((a, b) => a.i - b.i) })
      .eq("id", ad.id);
    if (error) failures.push(error.message);
  }
  return { images, videos, failures };
}
