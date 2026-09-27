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
        total: z.number(),
        active: z.number(),
        untagged: z.number(),
        themeCounts: z.record(z.string(), z.number()),
        topHeadlines: z.array(z.object({ headline: z.string(), count: z.number() })).max(MAX_HEADLINES_PER_BRAND),
      })
    )
    .min(1),
});

interface Insight {
  title: string;
  body: string;
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

  const prompt = `You are a paid-advertising competitive analyst. Below is ad data for ${brands.length} brand(s) on ${platformLabel}, scoped to ${activeOnly ? "active ads only" : "all ads ever seen"}. Theme counts come from keyword rules the team defined themselves — treat them as reliable.

Themes tracked: ${themes.length > 0 ? themes.join(", ") : "(none defined yet)"}

Brand data (JSON):
${JSON.stringify(brands, null, 2)}

Write 4 to 6 concise strategic insights comparing these brands. Every insight must cite specific numbers from the data above — never invent or estimate a number that isn't there. Cover things like: which brand leads which theme and by how much, notable gaps or white space (a theme with low or zero counts for everyone), and any pattern worth flagging in the repeated headlines. Skip generic advice that isn't backed by a number in the data.

Respond with ONLY a JSON array, no markdown fencing, in exactly this shape:
[{"title": "short punchy title, under 8 words", "body": "1-2 sentences citing specific numbers"}]`;

  try {
    const insights = await generateJson<Insight[]>(prompt);
    return NextResponse.json({ insights });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to generate insights";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
