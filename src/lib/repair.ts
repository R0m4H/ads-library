import { classifyAd, type ThemeRuleLike } from "./classify";
import { normalizeItem } from "./apify/normalize";
import type { Platform } from "./types";

/** A stored value that is only spaces — what carousels saved before the whitespace fix. */
export const isBlankText = (v: string | null | undefined): boolean => typeof v === "string" && v.trim() === "";

export interface RepairInput {
  platform: Platform;
  headline: string | null;
  body: string | null;
  cta: string | null;
  theme_tags: string[] | null;
  tags_manual?: boolean | null;
  /** The original scraper item, saved with every ad. */
  raw: Record<string, unknown> | null;
}

const FIELDS = ["headline", "body", "cta"] as const;

/**
 * Works out what to change for an ad whose headline, body or CTA was saved as blank spaces, or null if it
 * is fine. The copy is rebuilt from the scraper data we kept (with the current, fixed normalizer), so no
 * sync is needed. A blank that cannot be rebuilt becomes a proper NULL ("no copy") instead of a space, which
 * is also what the "Missing copy" filter expects. An ad with no tags and not tagged by hand gets tagged from
 * the rebuilt text. Anything that already has real text is left alone.
 */
export function repairAd(ad: RepairInput, rules: ThemeRuleLike[]): Record<string, unknown> | null {
  const blank = FIELDS.filter((f) => isBlankText(ad[f]));
  if (blank.length === 0) return null;

  const fresh = ad.raw ? normalizeItem(ad.platform, ad.raw) : null;
  const update: Record<string, unknown> = {};
  const next = { headline: ad.headline, body: ad.body, cta: ad.cta };

  for (const f of blank) {
    const rebuilt = fresh?.[f] ?? null;
    const value = isBlankText(rebuilt) ? null : rebuilt;
    update[f] = value;
    next[f] = value;
  }

  if (!ad.tags_manual && (ad.theme_tags ?? []).length === 0) {
    const tags = classifyAd(next.headline, next.body, next.cta, rules);
    if (tags.length > 0) update.theme_tags = tags;
  }
  return update;
}
