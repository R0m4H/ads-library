export type Platform = "meta" | "google" | "linkedin";

export interface Brand {
  id: string;
  name: string;
  is_own: boolean;
  category: string | null;
  notes: string | null;
  logo_url: string | null;
  meta_page_id: string | null;
  meta_page_url: string | null;
  google_advertiser_id: string | null;
  google_domain: string | null;
  linkedin_company_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdMedia {
  type: "image" | "video";
  url: string;
  thumbnail_url?: string;
  /** The smaller (SD) version of a video, when the source gives one — what we save. */
  sd_url?: string;
}

/** One saved picture of an ad in our own storage (Cloudflare R2). See migration 0015. */
export interface PreviewEntry {
  /** Position in the ad's media list. */
  i: number;
  /** R2 key of the saved picture; empty when only the video of an ad without a still image was saved. */
  key: string;
  w: number;
  h: number;
  /** Set when the video itself (SD version) was saved too. */
  video_key?: string;
  video_bytes?: number;
  /** Why the video was not saved (for example "too large"). */
  video_skipped?: string;
}

export interface Ad {
  id: string;
  brand_id: string;
  platform: Platform;
  external_id: string;
  ad_format: string | null;
  headline: string | null;
  body: string | null;
  cta: string | null;
  media: AdMedia[];
  landing_url: string | null;
  source_url: string | null;
  theme_tags: string[];
  /** True once an editor set the themes by hand (or accepted an AI suggestion): "Re-tag all ads" skips it. */
  tags_manual: boolean;
  /** Our own saved copies of this ad's pictures and videos (Cloudflare R2). Empty if none were saved. */
  previews: PreviewEntry[];
  spend_estimate: string | null;
  impressions_estimate: string | null;
  first_seen_at: string;
  last_seen_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdWithBrand extends Ad {
  brand: Pick<Brand, "id" | "name" | "is_own" | "logo_url" | "category">;
}

export interface ThemeRule {
  id: string;
  name: string;
  /** The pages this theme applies to; empty means a general theme that applies to every page. */
  brand_ids: string[];
  keywords: string[];
  priority: number;
  excludes: string[];
  created_at: string;
  updated_at: string;
}

/** What a sync asks Meta/Google/LinkedIn for when you don't change the "Max" box. */
export const DEFAULT_SYNC_ADS = 2000;
/** The most a single sync may ask for — a guard against a typo costing a lot, not a recommendation. */
export const MAX_SYNC_ADS = 10000;

export interface SyncPreset {
  id: string;
  label: string;
  value: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type ScrapeStatus = "running" | "succeeded" | "failed";

export interface ScrapeRun {
  id: string;
  brand_id: string;
  platform: Platform;
  apify_run_id: string | null;
  apify_dataset_id: string | null;
  status: ScrapeStatus;
  ads_found: number | null;
  ads_active: number | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  meta: "Meta (Facebook/Instagram)",
  google: "Google",
  linkedin: "LinkedIn",
};

// Sentinel value for the theme filter meaning "ads with no theme tags at
// all" — distinct from any real theme name a user could define.
export const UNTAGGED_THEME = "__untagged__";

export const AD_FORMAT_OPTIONS = [
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "carousel", label: "Carousel" },
  { value: "text", label: "Text" },
] as const;
