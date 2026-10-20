import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canEdit, getCurrentUserRole } from "@/lib/role";
import { isBlankText, repairAd, type RepairInput } from "@/lib/repair";

// Each call repairs one batch and says how many are left; the Themes page keeps calling until none are.
export const maxDuration = 60;

const BATCH = 100;

interface LightAd {
  id: string;
  headline: string | null;
  body: string | null;
  cta: string | null;
}

export async function POST() {
  const supabase = await createClient();
  const current = await getCurrentUserRole(supabase);
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(current.role)) return NextResponse.json({ error: "Editor access required" }, { status: 403 });

  const { data: rules, error: rulesError } = await supabase.from("theme_rules").select("name, keywords, priority, excludes, brand_ids");
  if (rulesError) return NextResponse.json({ error: rulesError.message }, { status: 500 });

  // 1. Find ads whose copy was saved as blank spaces. Only the small columns, so this stays cheap
  //    (the saved scraper data is large and is fetched below, for the ones that need it).
  const blankIds: string[] = [];
  const pageSize = 1000;
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from("ads")
      .select("id, headline, body, cta")
      .order("id")
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const ad of (data as LightAd[] | null) ?? []) {
      if (isBlankText(ad.headline) || isBlankText(ad.body) || isBlankText(ad.cta)) blankIds.push(ad.id);
    }
    if (!data || data.length < pageSize) break;
  }

  // 2. Repair one batch.
  const batch = blankIds.slice(0, BATCH);
  let repaired = 0;
  let cleared = 0;
  const chunk = 25;
  for (let i = 0; i < batch.length; i += chunk) {
    const { data: rows, error } = await supabase
      .from("ads")
      .select("id, platform, headline, body, cta, theme_tags, tags_manual, brand_id, raw")
      .in("id", batch.slice(i, i + chunk));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const results = await Promise.all(
      ((rows as (RepairInput & { id: string })[] | null) ?? []).map(async (row) => {
        const update = repairAd(row, rules ?? []);
        if (!update) return { ok: true, rebuilt: false };
        const { error: updateError } = await supabase.from("ads").update(update).eq("id", row.id);
        const rebuilt = Object.values(update).some((v) => typeof v === "string" && v.trim() !== "");
        return { ok: !updateError, error: updateError?.message, rebuilt };
      })
    );
    for (const r of results) {
      if (!r.ok) {
        return NextResponse.json({ error: `Failed to save a repaired ad: ${r.error}`, repaired, cleared }, { status: 500 });
      }
      if (r.rebuilt) repaired += 1;
      else cleared += 1;
    }
  }

  return NextResponse.json({ repaired, cleared, remaining: Math.max(0, blankIds.length - batch.length) });
}
