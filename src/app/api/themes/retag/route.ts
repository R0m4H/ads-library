import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { matchThemes } from "@/lib/classify";

// Bulk re-classification can touch a lot of rows with no external network
// calls (unlike Apify sync), so it's fast, but give it headroom anyway.
export const maxDuration = 60;

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: rules, error: rulesError } = await supabase.from("theme_rules").select("name, keywords, priority, excludes");
  if (rulesError) return NextResponse.json({ error: rulesError.message }, { status: 500 });

  // Page through all ads — Supabase caps a single select at 1000 rows.
  const ads: { id: string; headline: string | null; body: string | null; cta: string | null }[] = [];
  const pageSize = 1000;
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from("ads")
      .select("id, headline, body, cta")
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    ads.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }

  let tagged = 0;
  const chunkSize = 20;
  for (let i = 0; i < ads.length; i += chunkSize) {
    const chunk = ads.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (ad) => {
        const text = [ad.headline, ad.body, ad.cta].filter(Boolean).join(" ");
        const themeTags = matchThemes(text, rules ?? []);
        if (themeTags.length > 0) tagged += 1;
        await supabase.from("ads").update({ theme_tags: themeTags }).eq("id", ad.id);
      })
    );
  }

  return NextResponse.json({ total: ads.length, tagged });
}
