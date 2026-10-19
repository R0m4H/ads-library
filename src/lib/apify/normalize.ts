import type { AdMedia, Brand, Platform } from "@/lib/types";

export interface NormalizedAd {
  external_id: string;
  ad_format: string | null;
  headline: string | null;
  body: string | null;
  cta: string | null;
  media: AdMedia[];
  landing_url: string | null;
  source_url: string | null;
  spend_estimate: string | null;
  impressions_estimate: string | null;
  first_seen_at: string | null;
  /** Whether the platform reports this specific ad as still running. Not
   * every actor exposes this — normalizers default to true when unknown,
   * and the sync route's own diffing (ad missing from a fresh pull) is the
   * fallback signal for those platforms. */
  is_active: boolean;
  raw: Record<string, unknown>;
}

function str(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  // Whitespace-only counts as empty: Meta returns " " for a carousel card's
  // body, which would otherwise win over the real top-level copy via `??`.
  // Not trimmed on purpose — changing stored values would make every ad look
  // "changed" and force a full rewrite on the next sync.
  if (typeof v === "string") return v.trim() === "" ? null : v;
  return String(v);
}

/** Meta's `snapshot.body` is sometimes a plain string, sometimes `{ text }`. */
function bodyText(v: unknown): string | null {
  if (typeof v === "string") return str(v);
  if (v && typeof v === "object" && "text" in v) return str((v as { text?: unknown }).text);
  return null;
}

function toIso(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number") {
    // Unix seconds vs ms heuristic.
    const ms = v < 10_000_000_000 ? v * 1000 : v;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Builds a Facebook Ad Library search URL from a page ID, which is what
 * most Meta ad-library actors expect as a `url` entry when you don't
 * already have the page's canonical library link. active_status=all is
 * intentional: we want ad *history* too (for browsing/analysis), not just
 * what's live right now — normalizeMeta reads each ad's own is_active flag
 * so "currently running" counts stay accurate regardless.
 */
function metaLibraryUrl(brand: Brand): string | null {
  if (brand.meta_page_url) return brand.meta_page_url;
  if (brand.meta_page_id) {
    return `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=${encodeURIComponent(
      brand.meta_page_id
    )}`;
  }
  return null;
}

/**
 * Builds a Google Ads Transparency Center advertiser URL, which is what
 * silva95gustavo/google-ads-scraper requires as a startUrl. This actor only
 * accepts advertiser-page URLs (must start with
 * https://adstransparency.google.com/advertiser/AR...) — a bare domain
 * isn't a valid input on its own, so google_domain alone won't work here;
 * you need the advertiser ID (the "AR..." string from that URL).
 */
function googleLibraryUrl(brand: Brand): string | null {
  if (!brand.google_advertiser_id) return null;
  return `https://adstransparency.google.com/advertiser/${encodeURIComponent(brand.google_advertiser_id)}`;
}

/**
 * Builds the actor-specific input payload for a given brand.
 *
 * Actor slugs live in env vars (APIFY_ACTOR_META etc, see .env.example) so
 * they can be swapped without a code change — but the input SHAPE below is
 * tied to a specific actor's schema, so swapping actors may require editing
 * this function too. Confirmed against each actor's live input schema:
 *   meta:     curious_coder/facebook-ads-library-scraper — { urls: [{url}], scrapeAdDetails, limitPerSource }
 *             (the official apify/facebook-ads-scraper instead expects `startUrls`)
 *   google:   silva95gustavo/google-ads-scraper — { startUrls: [{url}], resultsLimit, skipDetails }
 *   linkedin: memo23/linkedin-ads-scraper
 *
 * `limit` is the user-facing "max ads to fetch" control (defaults to 200)
 * from the Sync button — mapped to whichever field each actor calls it.
 *
 * Output parsing in normalizeMeta() targets the real dataset shape verified
 * against a live run of curious_coder/facebook-ads-library-scraper: snake_case
 * fields (ad_archive_id, is_active, start_date, snapshot.images/videos/cards).
 * normalizeGoogle() targets silva95gustavo's documented output shape
 * (creativeId, firstShown/lastShown as date strings, variations[] holding
 * the actual headline/description/cta/clickUrl, regionStats[] for impressions).
 */
export function buildActorInput(platform: Platform, brand: Brand, limit = 200): Record<string, unknown> {
  switch (platform) {
    case "meta": {
      const url = metaLibraryUrl(brand);
      return {
        urls: url ? [{ url }] : [],
        scrapeAdDetails: true,
        limitPerSource: limit,
      };
    }
    case "google": {
      const url = googleLibraryUrl(brand);
      return {
        startUrls: url ? [{ url }] : [],
        resultsLimit: limit,
        skipDetails: false,
      };
    }
    case "linkedin": {
      const isUrl = brand.linkedin_company_url?.startsWith("http");
      return {
        startUrls: isUrl ? [brand.linkedin_company_url] : undefined,
        companies: isUrl ? undefined : [brand.linkedin_company_url || brand.name],
        maxItems: limit,
        scrapeAdDetails: true,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Per-platform normalizers.
// ---------------------------------------------------------------------------

interface MetaCard {
  body?: string;
  cta_type?: string;
  cta_text?: string;
  title?: string;
  link_url?: string;
  video_hd_url?: string;
  video_sd_url?: string;
  video_preview_image_url?: string;
  original_image_url?: string;
  resized_image_url?: string;
}

function metaMediaFromCard(card: MetaCard): AdMedia | null {
  const videoUrl = card.video_hd_url || card.video_sd_url;
  if (videoUrl) return { type: "video", url: videoUrl, thumbnail_url: card.video_preview_image_url, sd_url: card.video_sd_url };
  const imageUrl = card.original_image_url || card.resized_image_url;
  if (imageUrl) return { type: "image", url: imageUrl };
  return null;
}

function normalizeMeta(item: Record<string, unknown>): NormalizedAd | null {
  const externalId = str(item.ad_archive_id ?? item.ad_id ?? item.id);
  if (!externalId) return null;

  const snapshot = (item.snapshot as Record<string, unknown>) ?? {};
  const cards = (snapshot.cards as MetaCard[] | undefined) ?? [];
  const images = (snapshot.images as MetaCard[] | undefined) ?? [];
  const videos = (snapshot.videos as MetaCard[] | undefined) ?? [];

  const media: AdMedia[] = [];
  for (const v of videos) {
    const m = metaMediaFromCard(v);
    if (m) media.push(m);
  }
  for (const img of images) {
    const m = metaMediaFromCard(img);
    if (m) media.push(m);
  }
  if (media.length === 0) {
    for (const card of cards) {
      const m = metaMediaFromCard(card);
      if (m) media.push(m);
    }
  }

  // snapshot.body is sometimes a plain string, sometimes { text }. Card-level
  // fields are also preferred when present: multi-card (DCO/carousel) ads
  // often leave the top-level snapshot fields as unresolved "{{product.x}}"
  // template placeholders while each card carries the real resolved copy.
  const firstCard = cards[0];
  const body = str(firstCard?.body) ?? bodyText(snapshot.body);
  const headline = str(firstCard?.title) ?? str(snapshot.title);
  const cta = str(firstCard?.cta_text) ?? str(snapshot.cta_text);
  const landingUrl = str(firstCard?.link_url) ?? str(snapshot.link_url);

  const impressions = item.impressions_with_index as { impressions_text?: string | null } | undefined;
  const spend = item.spend;
  const spendStr = spend && typeof spend === "object" ? JSON.stringify(spend) : str(spend);

  // snapshot.display_format is Meta's own authoritative label: VIDEO, IMAGE,
  // or CAROUSEL for a real multi-card swipeable ad. Multiple `cards` alone
  // does NOT mean carousel — Meta also returns several cards for DCO
  // (Dynamic Creative Optimization) ads, which are creative-testing variants
  // of ONE single ad, not a user-facing carousel. Only trust display_format
  // for that distinction; fall back to media-type guessing when absent.
  const displayFormat = str(snapshot.display_format)?.toLowerCase();
  let adFormat: string | null;
  if (displayFormat === "carousel") adFormat = "carousel";
  else if (displayFormat === "video" || media.some((m) => m.type === "video")) adFormat = "video";
  else if (displayFormat === "image" || media.length > 0) adFormat = "image";
  else adFormat = null;

  return {
    external_id: externalId,
    ad_format: adFormat,
    headline,
    body,
    cta,
    media,
    landing_url: landingUrl,
    source_url: str(item.ad_library_url) ?? `https://www.facebook.com/ads/library/?id=${externalId}`,
    spend_estimate: spendStr,
    impressions_estimate: impressions?.impressions_text ?? null,
    first_seen_at: toIso(item.start_date ?? item.start_date_formatted),
    is_active: item.is_active !== false, // default true unless explicitly false
    raw: item,
  };
}

interface GoogleVariation {
  headline?: string;
  description?: string;
  cta?: string;
  clickUrl?: string;
  imageUrl?: string;
  videoUrl?: string;
}

interface GoogleRegionStat {
  impressions?: { lowerBound?: number; upperBound?: number };
}

function normalizeGoogle(item: Record<string, unknown>): NormalizedAd | null {
  const externalId = str(item.creativeId);
  if (!externalId) return null;

  const variations = (item.variations as GoogleVariation[] | undefined) ?? [];
  const firstVariation = variations[0];

  // Video ads give a YouTube *watch page* URL (youtube.com/watch?v=...), not
  // a direct video file — that can't be dropped into an HTML5 <video src>.
  // previewUrl is a YouTube thumbnail image, used here as the video's poster.
  const previewUrl = str(item.previewUrl);
  const media: AdMedia[] = [];
  for (const v of variations) {
    if (v.videoUrl) media.push({ type: "video", url: v.videoUrl, thumbnail_url: previewUrl ?? undefined });
    else if (v.imageUrl) media.push({ type: "image", url: v.imageUrl });
  }
  if (media.length === 0 && previewUrl) media.push({ type: "image", url: previewUrl });

  // No single flat impressions field — sum the per-region ranges instead.
  const regionStats = (item.regionStats as GoogleRegionStat[] | undefined) ?? [];
  let lower = 0;
  let upper = 0;
  let hasImpressions = false;
  for (const r of regionStats) {
    if (r.impressions) {
      hasImpressions = true;
      lower += r.impressions.lowerBound ?? 0;
      upper += r.impressions.upperBound ?? 0;
    }
  }

  return {
    external_id: externalId,
    ad_format: str(item.format)?.toLowerCase() ?? null,
    headline: str(firstVariation?.headline),
    body: str(firstVariation?.description),
    cta: str(firstVariation?.cta),
    media,
    landing_url: str(firstVariation?.clickUrl),
    source_url: str(item.adLibraryUrl),
    spend_estimate: null, // Google's public library doesn't disclose spend.
    impressions_estimate: hasImpressions ? `${lower.toLocaleString()}–${upper.toLocaleString()}` : null,
    first_seen_at: toIso(item.firstShown),
    is_active: true, // no explicit flag from this actor; relies on sync-diffing instead.
    raw: item,
  };
}

function normalizeLinkedIn(item: Record<string, unknown>): NormalizedAd | null {
  const externalId = str(item.adId ?? item.ad_id ?? item.id);
  if (!externalId) return null;

  const media: AdMedia[] = [];
  const videoUrl = str(item.videoUrl);
  if (videoUrl) media.push({ type: "video", url: videoUrl });
  const imageUrls = item.imageUrls ?? (item.imageUrl ? [item.imageUrl] : undefined);
  if (Array.isArray(imageUrls)) {
    for (const url of imageUrls) if (typeof url === "string") media.push({ type: "image", url });
  }

  const ctas = item.ctas;
  const cta = Array.isArray(ctas) && ctas.length > 0 ? str(ctas[0]) : str(item.cta);

  const impMin = item.totalImpressionsMin;
  const impMax = item.totalImpressionsMax;
  const impressions = impMin || impMax ? `${impMin ?? "?"}–${impMax ?? "?"}` : null;

  const status = str(item.adStatus)?.toLowerCase();

  return {
    external_id: externalId,
    ad_format: media.some((m) => m.type === "video") ? "video" : media.length > 0 ? "image" : "text",
    headline: str(item.headline),
    body: str(item.body),
    cta,
    media,
    landing_url: str(item.clickUrl),
    source_url: str(item.adLibraryUrl),
    spend_estimate: null, // LinkedIn's public ad library doesn't expose spend.
    impressions_estimate: impressions,
    first_seen_at: toIso(item.firstShownAt),
    is_active: status ? status === "active" : true,
    raw: item,
  };
}

export function normalizeItem(platform: Platform, item: Record<string, unknown>): NormalizedAd | null {
  switch (platform) {
    case "meta":
      return normalizeMeta(item);
    case "google":
      return normalizeGoogle(item);
    case "linkedin":
      return normalizeLinkedIn(item);
  }
}
