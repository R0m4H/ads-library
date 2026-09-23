import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StatTile } from "@/components/StatTile";
import { PLATFORM_LABELS, type Platform } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();

  const [{ count: brandCount }, { count: activeAdCount }, { count: totalAdCount }, { data: brands }, { data: activeAds }] =
    await Promise.all([
      supabase.from("brands").select("*", { count: "exact", head: true }),
      supabase.from("ads").select("*", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("ads").select("*", { count: "exact", head: true }),
      supabase.from("brands").select("id, is_own"),
      supabase.from("ads").select("platform, brand_id").eq("is_active", true),
    ]);

  const ownBrandIds = new Set((brands ?? []).filter((b) => b.is_own).map((b) => b.id));
  const ownActiveAds = (activeAds ?? []).filter((a) => ownBrandIds.has(a.brand_id)).length;
  const competitorActiveAds = (activeAds ?? []).length - ownActiveAds;

  const byPlatform: Record<Platform, number> = { meta: 0, google: 0, linkedin: 0 };
  for (const ad of activeAds ?? []) {
    const p = ad.platform as Platform;
    if (p in byPlatform) byPlatform[p] += 1;
  }
  const maxPlatformCount = Math.max(1, ...Object.values(byPlatform));

  const { data: recentRuns } = await supabase
    .from("scrape_runs")
    .select("*, brand:brands(name)")
    .order("started_at", { ascending: false })
    .limit(8);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-neutral-500">
          Snapshot as of your last syncs — numbers reflect ads seen the last time each brand was synced, not live counts.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Brands tracked" value={brandCount ?? 0} />
        <StatTile label="Active ads" value={activeAdCount ?? 0} hint={`${totalAdCount ?? 0} total ever seen`} />
        <StatTile label="Your active ads" value={ownActiveAds} />
        <StatTile label="Competitor active ads" value={competitorActiveAds} />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-neutral-700">Active ads by platform</h2>
          <div className="space-y-3">
            {(Object.keys(byPlatform) as Platform[]).map((p) => (
              <div key={p}>
                <div className="mb-1 flex justify-between text-xs text-neutral-500">
                  <span>{PLATFORM_LABELS[p]}</span>
                  <span>{byPlatform[p]}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-neutral-100">
                  <div
                    className="h-2 rounded-full bg-neutral-800"
                    style={{ width: `${(byPlatform[p] / maxPlatformCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-neutral-700">Recent syncs</h2>
          {(!recentRuns || recentRuns.length === 0) && (
            <p className="text-sm text-neutral-400">No syncs yet. Go to Brands and hit Sync.</p>
          )}
          <ul className="space-y-2">
            {(recentRuns ?? []).map((run) => (
              <li key={run.id} className="flex items-center justify-between text-sm">
                <span className="text-neutral-700">
                  {(run as unknown as { brand: { name: string } }).brand?.name ?? "Unknown brand"} · {PLATFORM_LABELS[run.platform as Platform]}
                </span>
                <span
                  className={
                    run.status === "succeeded"
                      ? "text-green-600"
                      : run.status === "failed"
                        ? "text-red-600"
                        : "text-neutral-400"
                  }
                >
                  {run.status === "succeeded" ? `${run.ads_found ?? 0} ads` : run.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {(brandCount ?? 0) === 0 && (
        <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center">
          <p className="mb-3 text-sm text-neutral-500">Get started by adding your own brand and a few competitors.</p>
          <Link href="/brands" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800">
            Add your first brand
          </Link>
        </div>
      )}
    </div>
  );
}
