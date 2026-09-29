import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateJson } from "@/lib/gemini/client";
import type { AdMedia, Platform } from "@/lib/types";
import { canEdit, getCurrentUserRole } from "@/lib/role";

// A couple of sequential Gemini calls can take a while; give it headroom.
export const maxDuration = 60;

// Bounded per click so this stays a quick, explicit action rather than a
// long-running job — and so a couple of Gemini calls per click stays well
// within free-tier rate limits. Click again to work through more.
const MAX_ADS_PER_RUN = 40;
const BATCH_SIZE = 20;

interface AdForSuggestion {
  id: string;
  platform: Platform;
  headline: string | null;
  body: string | null;
  cta: string | null;
  media: AdMedia[];
  brand: { name: string } | { name: string }[] | null;
}

interface RawSuggestion {
  id: string;
  suggestedTheme: string;
  isNewTheme: boolean;
  reason: string;
}

function brandName(brand: AdForSuggestion["brand"]): string {
  if (!brand) return "Unknown";
  return Array.isArray(brand) ? (brand[0]?.name ?? "Unknown") : brand.name;
}

function buildPrompt(themeNames: string[], batch: AdForSuggestion[]): string {
  const items = batch.map((ad) => ({
    id: ad.id,
    brand: brandName(ad.brand),
    headline: ad.headline ?? "",
    body: (ad.body ?? "").slice(0, 300),
    cta: ad.cta ?? "",
  }));

  return `You are tagging ads into marketing themes for a competitive-intelligence tool.

Existing themes: ${themeNames.length > 0 ? themeNames.join(", ") : "(none defined yet)"}

For each ad below, suggest the single best-fit theme. If one of the existing themes clearly fits, use its EXACT name as written above. If none fit well, propose a short new theme name (2-4 words, Title Case) that could apply to this and similar ads.

Ads (JSON):
${JSON.stringify(items, null, 2)}

Respond with ONLY a JSON array, no markdown fencing, in exactly this shape:
[{"id": "<same id as input>", "suggestedTheme": "...", "isNewTheme": true or false, "reason": "under 15 words explaining the fit"}]

Return exactly one entry per ad id given above, in any order.`;
}

export async function POST() {
  const supabase = await createClient();
  const current = await getCurrentUserRole(supabase);
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(current.role)) return NextResponse.json({ error: "Editor access required" }, { status: 403 });

  const { data: themeRules } = await supabase.from("theme_rules").select("name").order("name");
  const themeNames = (themeRules ?? []).map((t) => t.name);

  const { count: totalUntagged } = await supabase
    .from("ads")
    .select("id", { count: "exact", head: true })
    .eq("theme_tags", "{}");

  const { data: ads, error } = await supabase
    .from("ads")
    .select("id, platform, headline, body, cta, media, brand:brands(name)")
    .eq("theme_tags", "{}")
    .order("last_seen_at", { ascending: false })
    .limit(MAX_ADS_PER_RUN);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const adsTyped = (ads ?? []) as unknown as AdForSuggestion[];
  if (adsTyped.length === 0) {
    return NextResponse.json({ suggestions: [], processed: 0, remainingUntagged: totalUntagged ?? 0 });
  }

  const suggestions: {
    id: string;
    platform: Platform;
    headline: string | null;
    body: string | null;
    cta: string | null;
    media: AdMedia[];
    brandName: string;
    suggestedTheme: string;
    isNewTheme: boolean;
    reason: string;
  }[] = [];

  try {
    for (let i = 0; i < adsTyped.length; i += BATCH_SIZE) {
      const batch = adsTyped.slice(i, i + BATCH_SIZE);
      const prompt = buildPrompt(themeNames, batch);
      const result = await generateJson<RawSuggestion[]>(prompt);
      for (const r of result) {
        const ad = batch.find((a) => a.id === r.id);
        if (!ad || !r.suggestedTheme) continue;
        suggestions.push({
          id: ad.id,
          platform: ad.platform,
          headline: ad.headline,
          body: ad.body,
          cta: ad.cta,
          media: ad.media ?? [],
          brandName: brandName(ad.brand),
          suggestedTheme: r.suggestedTheme,
          isNewTheme: !!r.isNewTheme,
          reason: r.reason ?? "",
        });
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to generate suggestions";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({
    suggestions,
    processed: adsTyped.length,
    remainingUntagged: Math.max(0, (totalUntagged ?? 0) - adsTyped.length),
  });
}
