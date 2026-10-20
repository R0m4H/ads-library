import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canEdit, getCurrentUserRole } from "@/lib/role";
import { classifyAd, rulesForBrand } from "@/lib/classify";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ads")
    .select("*, brand:brands(id, name, is_own, logo_url, category)")
    .eq("id", id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ad: data });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const current = await getCurrentUserRole(supabase);
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(current.role)) return NextResponse.json({ error: "Editor access required" }, { status: 403 });

  const body = await req.json().catch(() => ({}));

  let update: { theme_tags: string[]; tags_manual: boolean };
  if (Array.isArray(body.theme_tags) && body.theme_tags.every((t: unknown) => typeof t === "string")) {
    // An editor chose these themes (or accepted an AI suggestion): mark the ad so re-tagging keeps them.
    update = { theme_tags: body.theme_tags, tags_manual: true };
  } else if (body.tags_manual === false) {
    // Hand the ad back to the automatic rules: tag it from the current rules right now.
    const [{ data: ad, error: adError }, { data: rules, error: rulesError }] = await Promise.all([
      supabase.from("ads").select("headline, body, cta, brand_id").eq("id", id).single(),
      supabase.from("theme_rules").select("name, keywords, priority, excludes, brand_ids"),
    ]);
    if (adError || !ad) return NextResponse.json({ error: adError?.message ?? "Ad not found" }, { status: 404 });
    if (rulesError) return NextResponse.json({ error: rulesError.message }, { status: 500 });
    update = { theme_tags: classifyAd(ad.headline, ad.body, ad.cta, rulesForBrand(rules ?? [], ad.brand_id)), tags_manual: false };
  } else {
    return NextResponse.json({ error: "Send theme_tags (a list of names) or tags_manual: false." }, { status: 400 });
  }

  const { data, error } = await supabase.from("ads").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ad: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const current = await getCurrentUserRole(supabase);
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(current.role)) return NextResponse.json({ error: "Editor access required" }, { status: 403 });

  const { error } = await supabase.from("ads").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
