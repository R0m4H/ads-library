import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { abortActorRun, getDatasetItems, getRunStatus } from "@/lib/apify/client";
import { normalizeItem } from "@/lib/apify/normalize";
import { classifyAd, rulesForBrand } from "@/lib/classify";
import type { Platform } from "@/lib/types";
import { canEdit, getCurrentUserRole } from "@/lib/role";

// Large batches (Full preset = 1000 ads) need real headroom for the Apify
// dataset fetch + bulk upserts below.
export const maxDuration = 60;

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

  const { data: allThemeRules } = await supabase.from("theme_rules").select("name, keywords, priority, excludes, brand_ids");
  // Only the themes that apply to this page: the general ones plus its own.
  const themeRules = rulesForBrand(allThemeRules ?? [], run.brand_id);

  // Fetch existing ads for this brand+platform once, instead of one query per
  // ad — doing a SELECT + upsert per ad serially was slow enough on large
  // batches (1000 ads = ~2000 sequential round-trips) to blow past the
  // function timeout and leave the run stuck at "running". Pull every field
  // a full write would touch, so we can tell which ads actually changed.
  interface ExistingAd {
    id: string;
    external_id: string;
    theme_tags: string[];
    ad_format: string | null;
    headline: string | null;
    body: string | null;
    cta: string | null;
    media: unknown;
    landing_url: string | null;
    source_url: string | null;
    spend_estimate: string | null;
    impressions_estimate: string | null;
    is_active: boolean;
  }
  const existingByExternalId = new Map<string, ExistingAd>();
  const fetchPageSize = 1000;
  for (let page = 0; ; page++) {
    const { data } = await supabase
      .from("ads")
      .select(
        "id, external_id, theme_tags, ad_format, headline, body, cta, media, landing_url, source_url, spend_estimate, impressions_estimate, is_active"
      )
      .eq("brand_id", run.brand_id)
      .eq("platform", platform)
      .range(page * fetchPageSize, page * fetchPageSize + fetchPageSize - 1);
    for (const row of (data as ExistingAd[] | null) ?? []) existingByExternalId.set(row.external_id, row);
    if (!data || data.length < fetchPageSize) break;
  }

  const now = new Date().toISOString();
  let activeCount = 0;

  // Most ads in a repeat sync haven't changed at all since last time — an
  // upsert still fully rewrites the row either way, which recomputes the
  // generated search_vector column and its GIN index on every single ad,
  // even unchanged ones. That was the real cost behind these timeouts, not
  // just row count. So split into: unchanged ads get a cheap last_seen_at
  // touch only (never rewrites headline/body/cta, so the index is left
  // alone); new or actually-different ads get the full write.
  const toUpsert: Record<string, unknown>[] = [];
  const toTouch: string[] = [];

  for (const ad of normalized) {
    if (ad.is_active) activeCount += 1;
    const existing = existingByExternalId.get(ad.external_id);
    const themeTags = classifyAd(ad.headline, ad.body, ad.cta, themeRules ?? []);

    const changed =
      !existing ||
      existing.ad_format !== ad.ad_format ||
      existing.headline !== ad.headline ||
      existing.body !== ad.body ||
      existing.cta !== ad.cta ||
      existing.landing_url !== ad.landing_url ||
      existing.source_url !== ad.source_url ||
      existing.spend_estimate !== ad.spend_estimate ||
      existing.impressions_estimate !== ad.impressions_estimate ||
      existing.is_active !== ad.is_active ||
      JSON.stringify(existing.media) !== JSON.stringify(ad.media);

    if (!changed) {
      toTouch.push(existing.id);
      continue;
    }

    toUpsert.push({
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
    });
  }

  // If any write here is rejected (e.g. by a Row Level Security policy),
  // fail the run loudly instead of silently reporting "succeeded" with
  // counts that were never actually written.
  const upsertChunkSize = 100;
  for (let i = 0; i < toUpsert.length; i += upsertChunkSize) {
    const { error: upsertError } = await supabase
      .from("ads")
      .upsert(toUpsert.slice(i, i + upsertChunkSize), { onConflict: "brand_id,platform,external_id" });
    if (upsertError) {
      const { data: failed } = await supabase
        .from("scrape_runs")
        .update({ status: "failed", error: `Failed to save ads: ${upsertError.message}`, finished_at: new Date().toISOString() })
        .eq("id", runId)
        .select()
        .single();
      return NextResponse.json({ run: failed });
    }
  }

  // Unchanged ads: just bump last_seen_at. This never touches
  // headline/body/cta, so it can't trigger search_vector/GIN maintenance —
  // it's the cheap path that makes repeat syncs fast.
  const touchChunkSize = 500;
  for (let i = 0; i < toTouch.length; i += touchChunkSize) {
    const { error: touchError } = await supabase
      .from("ads")
      .update({ last_seen_at: now })
      .in("id", toTouch.slice(i, i + touchChunkSize));
    if (touchError) {
      const { data: failed } = await supabase
        .from("scrape_runs")
        .update({ status: "failed", error: `Failed to refresh ads: ${touchError.message}`, finished_at: new Date().toISOString() })
        .eq("id", runId)
        .select()
        .single();
      return NextResponse.json({ run: failed });
    }
  }

  // Anything for this brand+platform not seen in this run is no longer
  // active — but only if this run actually captured the brand's complete
  // active-ad set. If the sync hit its limit (fewer results than requested
  // never came back), there could be real active ads beyond the cap that
  // this run simply never saw, and blindly marking everything else inactive
  // would wrongly deactivate them — a systematic undercount that gets worse
  // the more often a capped sync runs. Only known-complete runs (item count
  // came in under the limit) get to declare anything "no longer active".
  // Every ad actually seen just got last_seen_at stamped to `now` (via the
  // upsert or touch step above), so "not seen this run" is simply
  // "last_seen_at is older than now" — no need to embed the (potentially
  // ~1000-long) list of seen external_ids into the request, which was large
  // enough on a Full sync to get rejected outright.
  const captureIsComplete = run.ad_limit == null || normalized.length < run.ad_limit;
  if (captureIsComplete) {
    const { error: staleError } = await supabase
      .from("ads")
      .update({ is_active: false })
      .eq("brand_id", run.brand_id)
      .eq("platform", platform)
      .eq("is_active", true) // skip rows already correctly inactive — nothing to write
      .lt("last_seen_at", now);
    if (staleError) {
      const { data: failed } = await supabase
        .from("scrape_runs")
        .update({ status: "failed", error: `Failed to update stale ads: ${staleError.message}`, finished_at: new Date().toISOString() })
        .eq("id", runId)
        .select()
        .single();
      return NextResponse.json({ run: failed });
    }
  }

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

export async function DELETE(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const supabase = await createClient();
  const current = await getCurrentUserRole(supabase);
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(current.role)) return NextResponse.json({ error: "Editor access required" }, { status: 403 });

  const { data: run, error } = await supabase.from("scrape_runs").select("*").eq("id", runId).single();
  if (error || !run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  if (run.status !== "running") return NextResponse.json({ run });

  if (run.apify_run_id) {
    try {
      await abortActorRun(run.apify_run_id);
    } catch {
      // Best effort — still mark it cancelled locally even if Apify's abort
      // call fails (e.g. the run already finished there in the meantime).
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from("scrape_runs")
    .update({ status: "failed", error: "Cancelled by user", finished_at: new Date().toISOString() })
    .eq("id", runId)
    .select()
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ run: updated });
}
