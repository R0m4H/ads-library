import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { startActorRun } from "@/lib/apify/client";
import { buildActorInput } from "@/lib/apify/normalize";
import type { Platform } from "@/lib/types";
import { canEdit, getCurrentUserRole } from "@/lib/role";

const bodySchema = z.object({
  brand_id: z.string().uuid(),
  platform: z.enum(["meta", "google", "linkedin"]),
  limit: z.number().int().min(1).max(2000).default(200),
});

const ACTOR_ENV: Record<Platform, string> = {
  meta: "APIFY_ACTOR_META",
  google: "APIFY_ACTOR_GOOGLE",
  linkedin: "APIFY_ACTOR_LINKEDIN",
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const current = await getCurrentUserRole(supabase);
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(current.role)) return NextResponse.json({ error: "Editor access required" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { brand_id, platform, limit } = parsed.data;

  const { data: brand, error: brandErr } = await supabase
    .from("brands")
    .select("*")
    .eq("id", brand_id)
    .single();
  if (brandErr || !brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const actorId = process.env[ACTOR_ENV[platform]];
  if (!actorId) {
    return NextResponse.json(
      { error: `No Apify actor configured for ${platform}. Set ${ACTOR_ENV[platform]} in your environment.` },
      { status: 400 }
    );
  }

  const { data: run, error: runErr } = await supabase
    .from("scrape_runs")
    .insert({ brand_id, platform, status: "running", started_by: current.userId })
    .select()
    .single();
  if (runErr || !run) return NextResponse.json({ error: runErr?.message ?? "Could not create run" }, { status: 500 });

  try {
    const input = buildActorInput(platform, brand, limit);
    const handle = await startActorRun(actorId, input);
    await supabase
      .from("scrape_runs")
      .update({ apify_run_id: handle.runId, apify_dataset_id: handle.datasetId })
      .eq("id", run.id);
    return NextResponse.json({ run_id: run.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to start Apify run";
    await supabase.from("scrape_runs").update({ status: "failed", error: message, finished_at: new Date().toISOString() }).eq("id", run.id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
