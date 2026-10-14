import { classifyAd, type ThemeRuleLike } from "./classify";

export interface RetagAd {
  id: string;
  headline: string | null;
  body: string | null;
  cta: string | null;
  theme_tags: string[] | null;
  /** Tags were set by hand — never touched by a re-tag. */
  tags_manual?: boolean | null;
}

export interface RetagPlan {
  /** Ads that have at least one matching theme under the current rules. */
  tagged: number;
  /** Ads whose tags actually differ from what is stored — the only ones that need a write. */
  changed: number;
  /** Ads left alone because their tags were set by hand. */
  skipped: number;
  /** Changed ads grouped by the exact tag list they should receive, so each group is one batched update. */
  groups: { tags: string[]; ids: string[] }[];
}

// Same set of tags, regardless of order, means nothing to write.
const sameTags = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join("\u0000") === [...b].sort().join("\u0000");

/**
 * Works out what a re-tag has to write. Pure and in-memory: it reads nothing and saves nothing,
 * so the decision can be tested without a database.
 */
export function planRetag(ads: RetagAd[], rules: ThemeRuleLike[]): RetagPlan {
  let tagged = 0;
  let changed = 0;
  let skipped = 0;
  const byKey = new Map<string, { tags: string[]; ids: string[] }>();

  for (const ad of ads) {
    if (ad.tags_manual) {
      skipped += 1;
      continue;
    }
    const next = classifyAd(ad.headline, ad.body, ad.cta, rules);
    if (next.length > 0) tagged += 1;
    if (sameTags(next, ad.theme_tags ?? [])) continue;

    changed += 1;
    const key = JSON.stringify(next);
    const group = byKey.get(key);
    if (group) group.ids.push(ad.id);
    else byKey.set(key, { tags: next, ids: [ad.id] });
  }

  return { tagged, changed, skipped, groups: [...byKey.values()] };
}
