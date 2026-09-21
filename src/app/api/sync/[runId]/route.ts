import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDatasetItems, getRunStatus } from "@/lib/apify/client";
import { normalizeItem } from "@/lib/apify/normalize";
import { classifyAd } from "@/lib/classify";
import type { Platform } from "@/lib/types";

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const supabase = await createClient();

  const { data: run, error } = await supabase.from("scrape_runs").select("*").eq("id", runId).single();
  if (error || !run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  if (run.status !== "running") {
    return NextResponse.json({ run });
  }

  if (!run.apify_run_id) {
    return NextResponse.json({ run });
  }

  const apifyStatus = await getRunStatus(run.apify_run_id);

  if (apifyStatus.status === "RUNNING" || apifyStatus.status === "READY") {
    return NextResponse.json({ run });
  }

  if (apifyStatus.status !== "SUCCEEDED") {
    const { data: updated } = await supabase
      .from("scrape_runs")
      .update({ status: "failed", error: `Apify run ended with status ${apifyStatus.status}`, finished_at: new Date().toISOString() })
      .eq("id", runId)
      .select()
      .single();
    return NextResponse.json({ run: updated });
  }

  // Run succeeded: fetch dataset, normalize, and upsert.
  const platform = run.platform as Platform;
  const rawItems = await getDatasetItems(apifyStatus.datasetId);
  const normalized = rawItems.map((item) => normalizeItem(platform, item)).filter((x) => x !== null);

  const now = new Date().toISOString();
  let activeCount = 0;

  for (const ad of normalized) {
    const themeTags = classifyAd(ad.headline, ad.body, ad.cta);

    const { data: existing } = await supabase
      .from("ads")
      .select("id, theme_tags")
      .eq("brand_id", run.brand_id)
      .eq("platform", platform)
      .eq("external_id", ad.external_id)
      .maybeSingle();

    const payload = {
      brand_id: run.brand_id,
      platform,
      external_id: ad.external_id,
      ad_format: ad.ad_format,
      headline: ad.headline,
      body: ad.body,
      cta: ad.cta,
      media: ad.media,
      landing_url: ad.landing_url,
      source_url: ad.source_url,
      spend_estimate: ad.spend_estimate,
      impressions_estimate: ad.impressions_estimate,
      first_seen_at: ad.first_seen_at ?? now,
      last_seen_at: now,
      is_active: ad.is_active,
      raw: ad.raw,
      // Keep manually-adjusted tags if the ad already existed; otherwise auto-tag.
      theme_tags: existing?.theme_tags?.length ? existing.theme_tags : themeTags,
    };

    await supabase.from("ads").upsert(payload, { onConflict: "brand_id,platform,external_id" });
    if (ad.is_active) activeCount += 1;
  }

  // Anything for this brand+platform not seen in this run is no longer active.
  const seenIds = normalized.map((a) => a.external_id);
  let staleQuery = supabase
    .from("ads")
    .update({ is_active: false })
    .eq("brand_id", run.brand_id)
    .eq("platform", platform);
  staleQuery = seenIds.length > 0 ? staleQuery.not("external_id", "in", `(${seenIds.map((id) => `"${id}"`).join(",")})`) : staleQuery;
  await staleQuery;

  const { data: finished } = await supabase
    .from("scrape_runs")
    .update({
      status: "succeeded",
      ads_found: normalized.length,
      ads_active: activeCount,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .select()
    .single();

  return NextResponse.json({ run: finished });
}
