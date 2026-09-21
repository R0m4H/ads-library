import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);

  const platform = searchParams.get("platform");
  const brandId = searchParams.get("brand_id");
  const theme = searchParams.get("theme");
  const adFormat = searchParams.get("ad_format");
  const activeOnly = searchParams.get("active_only");
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
  if (brandId) query = query.eq("brand_id", brandId);
  if (theme) query = query.contains("theme_tags", [theme]);
  if (adFormat) query = query.eq("ad_format", adFormat);
  if (activeOnly === "true") query = query.eq("is_active", true);
  if (q) query = query.textSearch("search_vector", q, { type: "websearch" });

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let ads = data ?? [];
  if (ownOnly === "own") ads = ads.filter((a) => (a as unknown as { brand: { is_own: boolean } }).brand?.is_own);
  if (ownOnly === "competitors")
    ads = ads.filter((a) => !(a as unknown as { brand: { is_own: boolean } }).brand?.is_own);

  return NextResponse.json({ ads, total: count ?? 0, page, pageSize });
}
