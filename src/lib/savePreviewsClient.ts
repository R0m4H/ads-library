export interface SaveResult {
  /** Pictures saved. */
  saved: number;
  /** Videos saved. */
  videos: number;
  failed: number;
  /** The first download problem, if any — to explain "N couldn't be saved". */
  firstError?: string;
  /** Set when saving stopped on a server problem. */
  error?: string;
  /** The Cloudflare R2 settings are missing on the server. */
  notConfigured?: boolean;
}

/**
 * Asks the server to copy ad pictures into our own storage, one batch at a time, until it reports it has gone
 * through every ad. Each batch is a separate request so none comes near the server's time limit.
 */
export async function savePreviews(onProgress?: (progress: { saved: number; failed: number }) => void): Promise<SaveResult> {
  let cursor: string | null = null;
  let saved = 0;
  let videos = 0;
  let failed = 0;
  let firstError: string | undefined;

  for (let round = 0; round < 800; round++) {
    let json: { saved?: number; videos?: number; failed?: number; firstError?: string | null; cursor?: string | null; done?: boolean; error?: string; notConfigured?: boolean };
    let ok: boolean;
    try {
      const res = await fetch("/api/ads/save-previews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cursor }),
      });
      ok = res.ok;
      json = await res.json().catch(() => ({}));
    } catch {
      return { saved, videos, failed, firstError, error: "Could not reach the server." };
    }
    if (!ok) return { saved, videos, failed, firstError, error: json.error ?? "Saving failed.", notConfigured: json.notConfigured };

    saved += json.saved ?? 0;
    videos += json.videos ?? 0;
    failed += json.failed ?? 0;
    firstError ??= json.firstError ?? undefined;
    cursor = json.cursor ?? cursor;
    onProgress?.({ saved, failed });
    if (json.done) break;
  }
  return { saved, videos, failed, firstError };
}

export function describeSaveResult(r: SaveResult): string {
  if (r.notConfigured) return "Previews were not saved: the Cloudflare R2 storage isn't set up yet.";
  if (r.error) return `Saving previews stopped${r.saved ? ` after ${r.saved}` : ""}: ${r.error}`;
  if (r.saved === 0 && r.videos === 0 && r.failed === 0) return "No new previews to save.";
  const pictures = `${r.saved} picture${r.saved === 1 ? "" : "s"}`;
  const videos = r.videos ? ` and ${r.videos} video${r.videos === 1 ? "" : "s"}` : "";
  const failed = r.failed ? `; ${r.failed} could not be downloaded${r.firstError ? ` (${r.firstError})` : ""}` : "";
  return `Saved ${pictures}${videos}${failed}.`;
}

/** How many ads have a working picture link and no saved copy yet; null if it could not be checked. */
export async function getPendingPreviews(): Promise<{ configured: boolean; pending: number } | null> {
  try {
    const res = await fetch("/api/ads/save-previews");
    if (!res.ok) return null;
    const json = await res.json();
    return { configured: Boolean(json.configured), pending: Number(json.pending) || 0 };
  } catch {
    return null;
  }
}
