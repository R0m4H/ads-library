import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Which themes the ads of the chosen pages actually carry, so the Ad Library's theme filter can hide
 * the ones those pages don't have. Takes the same `brand_id` (repeatable) and `own` parameters as /api/ads.
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const brandIds = searchParams.getAll("brand_id").filter(Boolean);
  const ownOnly = searchParams.get("own");

  let scoped = brandIds;
  if (ownOnly === "own" || ownOnly === "competitors") {
    const { data: matching, error } = await supabase.from("brands").select("id").eq("is_own", ownOnly === "own");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const allowed = (matching ?? []).map((b) => b.id as string);
    scoped = brandIds.length > 0 ? brandIds.filter((id) => allowed.includes(id)) : allowed;
  }
  if (scoped.length === 0) return NextResponse.json({ themes: [], untagged: false });

  const themes = new Set<string>();
  let untagged = false;
  // A single select is capped at 1000 rows by Supabase, so read the tags page by page.
  const pageSize = 1000;
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from("ads")
      .select("theme_tags")
      .in("brand_id", scoped)
      .order("id")
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const row of data ?? []) {
      const tags = (row.theme_tags as string[] | null) ?? [];
      if (tags.length === 0) untagged = true;
      for (const t of tags) themes.add(t);
    }
    if (!data || data.length < pageSize) break;
  }

  return NextResponse.json({ themes: [...themes], untagged });
}
