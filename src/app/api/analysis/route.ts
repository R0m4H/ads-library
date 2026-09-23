import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const querySchema = z.object({
  brand_ids: z
    .string()
    .transform((s) => s.split(",").filter(Boolean))
    .pipe(z.array(z.string().uuid()).min(1)),
  active_only: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

const PLATFORM_KEYS = ["all", "meta", "google", "linkedin"] as const;
type PlatformKey = (typeof PLATFORM_KEYS)[number];

interface Bucket {
  total: number;
  active: number;
  themeCounts: Record<string, number>;
  untagged: number;
  headlineCounts: Record<string, number>;
}

function emptyBucket(themeNames: string[]): Bucket {
  const themeCounts: Record<string, number> = {};
  for (const name of themeNames) themeCounts[name] = 0;
  return { total: 0, active: 0, themeCounts, untagged: 0, headlineCounts: {} };
}

function finalize(bucket: Bucket) {
  const headlines = Object.entries(bucket.headlineCounts)
    .map(([headline, count]) => ({ headline, count }))
    .sort((a, b) => b.count - a.count || a.headline.localeCompare(b.headline));
  return {
    total: bucket.total,
    active: bucket.active,
    themeCounts: bucket.themeCounts,
    untagged: bucket.untagged,
    headlines,
  };
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    brand_ids: searchParams.get("brand_ids") ?? "",
    active_only: searchParams.get("active_only") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { brand_ids, active_only } = parsed.data;

  const [{ data: brands, error: brandsError }, { data: themeRules, error: themesError }] = await Promise.all([
    supabase.from("brands").select("id, name, is_own, logo_url, category").in("id", brand_ids),
    supabase.from("theme_rules").select("name").order("name"),
  ]);
  if (brandsError) return NextResponse.json({ error: brandsError.message }, { status: 500 });
  if (themesError) return NextResponse.json({ error: themesError.message }, { status: 500 });

  const themeNames = (themeRules ?? []).map((t) => t.name);

  try {
    const results = await Promise.all(
      brand_ids.map(async (brandId) => {
        const brand = (brands ?? []).find((b) => b.id === brandId) ?? null;

        // Paginate — a single select is capped at 1000 rows by Supabase.
        const ads: { platform: string; theme_tags: string[]; is_active: boolean; headline: string | null }[] = [];
        const pageSize = 1000;
        for (let page = 0; ; page++) {
          let query = supabase
            .from("ads")
            .select("platform, theme_tags, is_active, headline")
            .eq("brand_id", brandId)
            .range(page * pageSize, page * pageSize + pageSize - 1);
          if (active_only) query = query.eq("is_active", true);
          const { data, error } = await query;
          if (error) throw new Error(error.message);
          ads.push(...(data ?? []));
          if (!data || data.length < pageSize) break;
        }

        const buckets: Record<PlatformKey, Bucket> = {
          all: emptyBucket(themeNames),
          meta: emptyBucket(themeNames),
          google: emptyBucket(themeNames),
          linkedin: emptyBucket(themeNames),
        };

        for (const ad of ads) {
          const targets = [buckets.all, buckets[ad.platform as PlatformKey]].filter(Boolean) as Bucket[];
          for (const bucket of targets) {
            bucket.total += 1;
            if (ad.is_active) bucket.active += 1;
            const tags = ad.theme_tags ?? [];
            if (tags.length === 0) {
              bucket.untagged += 1;
            } else {
              for (const tag of tags) bucket.themeCounts[tag] = (bucket.themeCounts[tag] ?? 0) + 1;
            }
            const headline = ad.headline?.trim();
            if (headline) bucket.headlineCounts[headline] = (bucket.headlineCounts[headline] ?? 0) + 1;
          }
        }

        const platforms = Object.fromEntries(PLATFORM_KEYS.map((k) => [k, finalize(buckets[k])])) as Record<
          PlatformKey,
          ReturnType<typeof finalize>
        >;

        return { brand, platforms };
      })
    );

    return NextResponse.json({ themes: themeNames, brands: results });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to compute analysis";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
