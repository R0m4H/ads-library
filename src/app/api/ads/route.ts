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
  const sort = searchParams.get("sort"); // "newest" | "platform" | null (active first, then most recently seen)
  const page = Math.max(0, Math.floor(Number(searchParams.get("page"))) || 0);
  const pageSize = Math.min(96, Math.max(6, Number(searchParams.get("page_size")) || 24));

  // "Only yours" / "Only competitors" has to narrow the query itself (not the page afterwards), or the
  // count, the page numbers and the page contents all disagree. Resolve it to a brand list first and
  // intersect it with any brands the user picked.
  let scopedBrandIds = brandIds;
  if (ownOnly === "own" || ownOnly === "competitors") {
    const { data: matching, error: brandsError } = await supabase.from("brands").select("id").eq("is_own", ownOnly === "own");
    if (brandsError) return NextResponse.json({ error: brandsError.message }, { status: 500 });
    const allowed = (matching ?? []).map((b) => b.id as string);
    scopedBrandIds = brandIds.length > 0 ? brandIds.filter((id) => allowed.includes(id)) : allowed;
    if (scopedBrandIds.length === 0) return NextResponse.json({ ads: [], total: 0, page, pageSize });
  }

  // The same filters for the page being asked for and for the fallback below, so build them in one place.
  const build = (from: number, to: number) => {
    let query = supabase
      .from("ads")
      .select("*, brand:brands(id, name, is_own, logo_url, category)", { count: "exact" });
    // `id` is always last, so ads with the same timestamp (a whole sync shares one) keep a fixed order
    // and never repeat or go missing between pages.
    if (sort === "newest") {
      query = query.order("first_seen_at", { ascending: false }).order("id");
    } else if (sort === "platform") {
      query = query.order("platform").order("is_active", { ascending: false }).order("last_seen_at", { ascending: false }).order("id");
    } else {
      // Default: active ads first, then the most recently seen.
      query = query.order("is_active", { ascending: false }).order("last_seen_at", { ascending: false }).order("id");
    }
    query = query.range(from, to);

    if (platform) query = query.eq("platform", platform);
    if (scopedBrandIds.length) query = query.in("brand_id", scopedBrandIds);
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
    return query;
  };

  let { data, error, count } = await build(page * pageSize, page * pageSize + pageSize - 1);
  // A page number past the end (an old link, or a typed address) is refused by the database. Answer with
  // an empty page and the real total instead, so the screen can move to the last page.
  if (error?.code === "PGRST103") {
    ({ data, error, count } = await build(0, 0));
    if (!error) return NextResponse.json({ ads: [], total: count ?? 0, page, pageSize });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ads = data ?? [];
  return NextResponse.json({ ads, total: count ?? 0, page, pageSize });
}
