"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Brand, Platform, ScrapeRun, SyncPreset } from "@/lib/types";
import { PlatformBadge } from "@/components/PlatformBadge";
import { SyncButton } from "@/components/SyncButton";
import { LogoUploader } from "@/components/LogoUploader";
import { SyncPresetsEditor } from "@/components/SyncPresetsEditor";

const PLATFORM_FIELDS: { platform: Platform; fields: { key: keyof Brand; label: string; placeholder?: string }[] }[] = [
  { platform: "meta", fields: [{ key: "meta_page_id", label: "Facebook Page ID", placeholder: "e.g. 119630781428450" }] },
  {
    platform: "google",
    fields: [
      { key: "google_advertiser_id", label: "Advertiser ID (required for sync)", placeholder: "AR08888592736429539329" },
      { key: "google_domain", label: "Domain (reference only, not used for sync)", placeholder: "brand.com" },
    ],
  },
  { platform: "tiktok", fields: [{ key: "tiktok_handle", label: "TikTok handle", placeholder: "@brand" }] },
  {
    platform: "linkedin",
    fields: [{ key: "linkedin_company_url", label: "Company name or Ad Library URL" }],
  },
];

function isPlatformConfigured(brand: Brand, platform: Platform): boolean {
  switch (platform) {
    case "meta":
      return !!(brand.meta_page_id || brand.meta_page_url);
    case "google":
      return !!brand.google_advertiser_id; // this actor needs the advertiser ID; domain alone won't work
    case "tiktok":
      return !!brand.tiktok_handle;
    case "linkedin":
      return !!brand.linkedin_company_url;
  }
}

export default function BrandDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [runs, setRuns] = useState<ScrapeRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [adCounts, setAdCounts] = useState<{ total: number; active: number } | null>(null);
  const [presets, setPresets] = useState<SyncPreset[]>([]);
  const [editingPresets, setEditingPresets] = useState(false);
  const resuming = useRef<Set<string>>(new Set());

  function load() {
    Promise.all([
      fetch(`/api/brands/${id}`).then((r) => r.json()),
      fetch(`/api/brands/${id}/runs`).then((r) => r.json()),
      fetch(`/api/ads?brand_id=${id}&page=0`).then((r) => r.json()),
      fetch(`/api/ads?brand_id=${id}&active_only=true&page=0`).then((r) => r.json()),
      fetch(`/api/sync-presets`).then((r) => r.json()),
    ]).then(([brandJson, runsJson, allAds, activeAds, presetsJson]) => {
      setBrand(brandJson.brand ?? null);
      setRuns(runsJson.runs ?? []);
      setAdCounts({ total: allAds.total ?? 0, active: activeAds.total ?? 0 });
      setPresets(presetsJson.presets ?? []);
      setLoading(false);
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function resumeStuckRun(runId: string) {
    for (let i = 0; i < 200; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const res = await fetch(`/api/sync/${runId}`);
      const json = await res.json();
      if (json.run && json.run.status !== "running") break;
    }
    resuming.current.delete(runId);
    load();
  }

  // Ad ingestion only happens while something is actively polling
  // /api/sync/[runId]. If a tab closed or SyncButton's own polling window
  // elapsed while Apify was still finishing, the run gets stuck at
  // "running" and its ads never land — so reconcile any stuck runs here,
  // on every visit to this page.
  useEffect(() => {
    const stuck = runs.filter((r) => r.status === "running" && !resuming.current.has(r.id));
    for (const run of stuck) {
      resuming.current.add(run.id);
      resumeStuckRun(run.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs]);

  function startEditing() {
    if (!brand) return;
    setEditing({
      name: brand.name,
      category: brand.category ?? "",
      logo_url: brand.logo_url ?? "",
      meta_page_id: brand.meta_page_id ?? "",
      google_advertiser_id: brand.google_advertiser_id ?? "",
      google_domain: brand.google_domain ?? "",
      tiktok_handle: brand.tiktok_handle ?? "",
      linkedin_company_url: brand.linkedin_company_url ?? "",
    });
  }

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/brands/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    const json = await res.json();
    if (res.ok) {
      setBrand(json.brand);
      setEditing({});
    }
    setSaving(false);
  }

  if (loading) return <p className="text-sm text-neutral-400">Loading…</p>;
  if (!brand) return <p className="text-sm text-neutral-400">Brand not found.</p>;

  const isEditing = Object.keys(editing).length > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/brands" className="text-sm text-neutral-500 underline underline-offset-2">
        ← Back to Brands
      </Link>

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {brand.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logo_url} alt="" className="h-12 w-12 flex-shrink-0 rounded-full object-cover" />
          ) : (
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-neutral-200 text-lg font-medium text-neutral-500">
              {brand.name.slice(0, 1)}
            </span>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{brand.name}</h1>
              {brand.is_own && (
                <span className="rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">YOU</span>
              )}
            </div>
            {brand.category && <p className="text-sm text-neutral-500">{brand.category}</p>}
          </div>
        </div>
        <Link
          href={`/ads?brand_id=${brand.id}`}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          View ads
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-400">Active ads</p>
          <p className="text-2xl font-semibold">{adCounts?.active ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-400">Total ads ever seen</p>
          <p className="text-2xl font-semibold">{adCounts?.total ?? "—"}</p>
        </div>
      </div>

      <section className="space-y-3 rounded-xl border border-neutral-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-700">Platforms</h2>
          {!isEditing && (
            <button onClick={startEditing} className="text-xs font-medium text-neutral-500 underline underline-offset-2">
              Edit identifiers
            </button>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Name</label>
              <input
                value={editing.name}
                onChange={(e) => setEditing((s) => ({ ...s, name: e.target.value }))}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Category</label>
              <input
                value={editing.category}
                onChange={(e) => setEditing((s) => ({ ...s, category: e.target.value }))}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Logo</label>
              <LogoUploader
                value={editing.logo_url}
                onChange={(url) => setEditing((s) => ({ ...s, logo_url: url }))}
                brandId={id}
              />
            </div>
            {PLATFORM_FIELDS.map(({ platform, fields }) => (
              <div key={platform} className="grid grid-cols-2 gap-4">
                {fields.map((f) => (
                  <div key={f.key} className={fields.length === 1 ? "col-span-2" : undefined}>
                    <label className="mb-1 block text-xs font-medium text-neutral-600">{f.label}</label>
                    <input
                      value={editing[f.key as string] ?? ""}
                      onChange={(e) => setEditing((s) => ({ ...s, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    />
                  </div>
                ))}
              </div>
            ))}
            <div className="flex gap-2">
              <button
                onClick={save}
                disabled={saving}
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setEditing({})} className="rounded-md px-4 py-2 text-sm text-neutral-500 hover:bg-neutral-50">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {(["meta", "google", "tiktok", "linkedin"] as Platform[]).map((platform) => {
              const configured = isPlatformConfigured(brand, platform);
              return (
                <div key={platform} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-neutral-50 p-3">
                  <div className="flex items-center gap-2">
                    <PlatformBadge platform={platform} />
                    {!configured && <span className="text-xs text-neutral-400">Not configured — click Edit above</span>}
                  </div>
                  {configured && <SyncButton brandId={brand.id} platform={platform} presets={presets} onDone={load} />}
                </div>
              );
            })}
            <button
              onClick={() => setEditingPresets((v) => !v)}
              className="text-xs font-medium text-neutral-500 underline underline-offset-2"
            >
              {editingPresets ? "Hide preset editor" : "Edit sync presets"}
            </button>
            {editingPresets && <SyncPresetsEditor presets={presets} onChange={setPresets} />}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-neutral-700">Recent syncs</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-neutral-400">No syncs yet.</p>
        ) : (
          <ul className="space-y-2">
            {runs.map((run) => (
              <li key={run.id} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-neutral-700">
                  <PlatformBadge platform={run.platform} />
                  {new Date(run.started_at).toLocaleString()}
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
                  {run.status === "succeeded"
                    ? `${run.ads_found ?? 0} ads (${run.ads_active ?? 0} active)`
                    : run.status === "failed"
                      ? (run.error ?? "Failed")
                      : "Running…"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
