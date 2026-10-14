import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { planRetag, type RetagAd } from "@/lib/retag";
import { canEdit, getCurrentUserRole } from "@/lib/role";

// Bulk re-classification can touch a lot of rows with no external network
// calls (unlike Apify sync), so it's fast, but give it headroom anyway.
export const maxDuration = 60;

export async function POST() {
  const supabase = await createClient();
  const current = await getCurrentUserRole(supabase);
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(current.role)) return NextResponse.json({ error: "Editor access required" }, { status: 403 });

  const { data: rules, error: rulesError } = await supabase.from("theme_rules").select("name, keywords, priority, excludes");
  if (rulesError) return NextResponse.json({ error: rulesError.message }, { status: 500 });

  // Page through all ads — Supabase caps a single select at 1000 rows.
  const ads: RetagAd[] = [];
  const pageSize = 1000;
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from("ads")
      .select("id, headline, body, cta, theme_tags, tags_manual")
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    ads.push(...((data as RetagAd[] | null) ?? []));
    if (!data || data.length < pageSize) break;
  }

  // Decide in memory which ads actually need new tags, and group them by the tags they should
  // get. Saving ads one by one (and rewriting ones that did not change) was what made this slow:
  // now it is one update per group per chunk of ids.
  const plan = planRetag(ads, rules ?? []);

  const idsPerUpdate = 200;
  const jobs: { tags: string[]; ids: string[] }[] = [];
  for (const group of plan.groups) {
    for (let i = 0; i < group.ids.length; i += idsPerUpdate) {
      jobs.push({ tags: group.tags, ids: group.ids.slice(i, i + idsPerUpdate) });
    }
  }

  let saved = 0;
  const parallel = 4;
  for (let i = 0; i < jobs.length; i += parallel) {
    const results = await Promise.all(
      jobs.slice(i, i + parallel).map(async (job) => {
        const { error } = await supabase.from("ads").update({ theme_tags: job.tags }).in("id", job.ids);
        return { error, count: job.ids.length };
      })
    );
    for (const r of results) {
      if (r.error) {
        return NextResponse.json(
          { error: `Failed to save tags after updating ${saved} of ${plan.changed} ads: ${r.error.message}` },
          { status: 500 }
        );
      }
      saved += r.count;
    }
  }

  return NextResponse.json({ total: ads.length, tagged: plan.tagged, changed: plan.changed, skipped: plan.skipped });
}
