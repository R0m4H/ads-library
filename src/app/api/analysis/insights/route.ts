import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateJson } from "@/lib/gemini/client";

// Bounded per brand so the prompt (and free-tier token usage) stays small —
// the top handful of repeated headlines carries the signal anyway.
const MAX_HEADLINES_PER_BRAND = 15;

const bodySchema = z.object({
  platformLabel: z.string(),
  activeOnly: z.boolean(),
  themes: z.array(z.string()),
  brands: z
    .array(
      z.object({
        name: z.string(),
        isOwn: z.boolean(),
        total: z.number(),
        active: z.number(),
        untagged: z.number(),
        themeCounts: z.record(z.string(), z.number()),
        topHeadlines: z.array(z.object({ headline: z.string(), count: z.number() })).max(MAX_HEADLINES_PER_BRAND),
      })
    )
    .min(1),
});

interface AIAnalysis {
  findings: { brand: string | null; tag: "advantage" | "contested" | "white-space" | "risk"; title: string; body: string }[];
  gaps: { gap: string; evidence: string; move: string; priority: "high" | "med" | "low" }[];
  checklist: string[];
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { platformLabel, activeOnly, themes, brands } = parsed.data;

  // Only frame the Gap/Opportunity matrix and 30-day checklist around a
  // specific brand's perspective when exactly one selected brand is marked
  // as the team's own — otherwise there's no clear "for whom" to write it.
  const ownBrands = brands.filter((b) => b.isOwn);
  const ownBrandName = ownBrands.length === 1 ? ownBrands[0].name : null;

  const brandData = brands.map(({ name, total, active, untagged, themeCounts, topHeadlines }) => ({
    name,
    total,
    active,
    untagged,
    themeCounts,
    topHeadlines,
  }));

  const prompt = `You are a paid-advertising competitive analyst. Below is ad data for ${brands.length} brand(s) on ${platformLabel}, scoped to ${activeOnly ? "active ads only" : "all ads ever seen"}. Theme counts come from keyword rules the team defined themselves — treat them as reliable.

Themes tracked: ${themes.length > 0 ? themes.join(", ") : "(none defined yet)"}

Brand data (JSON):
${JSON.stringify(brandData, null, 2)}

${ownBrandName ? `"${ownBrandName}" is the team's own brand; the rest are competitors.` : "No single brand here is marked as the team's own — treat this as a neutral market comparison."}

Return ONLY a JSON object, no markdown fencing, in exactly this shape:
{
  "findings": [
    {
      "brand": "<the brand name this finding is mainly about, or null if it's about the market as a whole (e.g. white space no one covers)>",
      "tag": "advantage" | "contested" | "white-space" | "risk",
      "title": "short punchy title, under 8 words",
      "body": "1-2 sentences citing specific numbers from the data above"
    }
  ],
  "gaps": [
    { "gap": "short name of the gap or opportunity", "evidence": "the specific numbers that show it", "move": "one concrete recommended action", "priority": "high" | "med" | "low" }
  ],
  "checklist": ["short imperative 30-day action item, citing a number where relevant"]
}

Write 4 to 6 "findings". Never invent or estimate a number that isn't in the data above — every finding must cite something real from it.
${
  ownBrandName
    ? `Write 3 to 6 "gaps" and a "checklist" of 5 to 8 concrete 30-day actions, both written from "${ownBrandName}"'s perspective versus the other brand(s) in the data.`
    : `Return an empty array for "gaps" and an empty array for "checklist" — there is no single brand here to write recommendations for.`
}`;

  try {
    const analysis = await generateJson<AIAnalysis>(prompt);
    return NextResponse.json(analysis);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to generate insights";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
