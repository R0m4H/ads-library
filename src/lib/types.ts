export type Platform = "meta" | "google" | "tiktok" | "linkedin";

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
  tiktok_handle: string | null;
  linkedin_company_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdMedia {
  type: "image" | "video";
  url: string;
  thumbnail_url?: string;
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
  tiktok: "TikTok",
  linkedin: "LinkedIn",
};

export const AD_FORMAT_OPTIONS = [
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "carousel", label: "Carousel" },
  { value: "text", label: "Text" },
] as const;

export const THEME_OPTIONS = [
  "Discount / Sale",
  "New Product Launch",
  "Brand Awareness",
  "Lead Gen / Signup",
  "Retargeting / Social Proof",
  "Seasonal / Holiday",
  "Testimonial / UGC",
  "Educational / How-to",
  "Limited Time / Urgency",
  "Free Trial / Demo",
] as const;
