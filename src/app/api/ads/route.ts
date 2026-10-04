import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { UNTAGGED_THEME } from "@/lib/types";
import { searchTerms, termFilter } from "@/lib/search";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);

  const platform = searchParams.get("platform");
  // These three accept several values (repeat the param: ?brand_id=a&brand_id=b). Repeated params,
  // not a comma list, because theme names are free text and may contain commas.
  const brandIds = searchParams.getAll("brand_id").filter(Boolean);
  const themes = searchParams.getAll("theme").filter(Boolean);
  const adFormats = searchParams.getAll("ad_format").filter(Boolean);
  const activeOnly = searchParams.get("active_only");
  const missingCopy = searchParams.get("missing_copy");
  const ownOnly = searchParams.get("own"); // "own" | "competitors" | null
  const q = searchParams.get("q");
  const page = Number(searchParams.get("page") ?? "0");
  const pageSize = Math.min(96, Math.max(6, Number(searchParams.get("page_size")) || 24));

  let query = supabase
    .from("ads")
    .select("*, brand:brands(id, name, is_own, logo_url, category)", { count: "exact" })
    .order("last_seen_at", { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);

  if (platform) query = query.eq("platform", platform);
  if (brandIds.length) query = query.in("brand_id", brandIds);
  if (adFormats.length) query = query.in("ad_format", adFormats);

  // Several themes mean "any of them". "No theme" can be mixed in: untagged OR any chosen theme.
  const wantUntagged = themes.includes(UNTAGGED_THEME);
  const named = themes.filter((t) => t !== UNTAGGED_THEME);
  if (wantUntagged && named.length > 0) {
    const item = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`; // quote + escape for a Postgres array literal
    query = query.or(`theme_tags.eq.{},theme_tags.ov.{${named.map(item).join(",")}}`);
  } else if (wantUntagged) {
    query = query.eq("theme_tags", "{}");
  } else if (named.length > 0) {
    query = query.overlaps("theme_tags", named);
  }
  if (activeOnly === "true") query = query.eq("is_active", true);
  if (missingCopy === "true") query = query.is("headline", null).is("body", null);
  // Each typed word must appear (as a partial match) in the headline, body or CTA.
  if (q) for (const term of searchTerms(q)) query = query.or(termFilter(term));

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let ads = data ?? [];
  if (ownOnly === "own") ads = ads.filter((a) => (a as unknown as { brand: { is_own: boolean } }).brand?.is_own);
  if (ownOnly === "competitors")
    ads = ads.filter((a) => !(a as unknown as { brand: { is_own: boolean } }).brand?.is_own);

  return NextResponse.json({ ads, total: count ?? 0, page, pageSize });
}
