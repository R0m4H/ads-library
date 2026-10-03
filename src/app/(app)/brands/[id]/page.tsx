"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import type { Brand, Platform, ScrapeRun, SyncPreset } from "@/lib/types";
import { PlatformBadge } from "@/components/PlatformBadge";
import { SyncButton } from "@/components/SyncButton";
import { LogoUploader } from "@/components/LogoUploader";
import { SyncPresetsEditor } from "@/components/SyncPresetsEditor";
import { RoleGate } from "@/components/RoleGate";

const PLATFORM_FIELDS: { platform: Platform; fields: { key: keyof Brand; label: string; placeholder?: string }[] }[] = [
  { platform: "meta", fields: [{ key: "meta_page_id", label: "Facebook Page ID", placeholder: "e.g. 119630781428450" }] },
  {
    platform: "google",
    fields: [
      { key: "google_advertiser_id", label: "Advertiser ID (required for sync)", placeholder: "AR08888592736429539329" },
      { key: "google_domain", label: "Domain (reference only, not used for sync)", placeholder: "brand.com" },
    ],
  },
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
  const [editingIsOwn, setEditingIsOwn] = useState(false);
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

  async function cancelRun(runId: string) {
    resuming.current.delete(runId); // stop the resume-on-load loop from racing this
    await fetch(`/api/sync/${runId}`, { method: "DELETE" });
    load();
  }

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
    setEditingIsOwn(brand.is_own);
    setEditing({
      name: brand.name,
      category: brand.category ?? "",
      logo_url: brand.logo_url ?? "",
      meta_page_id: brand.meta_page_id ?? "",
      google_advertiser_id: brand.google_advertiser_id ?? "",
      google_domain: brand.google_domain ?? "",
      linkedin_company_url: brand.linkedin_company_url ?? "",
    });
  }

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/brands/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...editing, is_own: editingIsOwn }),
    });
    const json = await res.json();
    if (res.ok) {
      setBrand(json.brand);
      setEditing({});
    }
    setSaving(false);
  }

  const isEditing = Object.keys(editing).length > 0;

  return (
    <RoleGate minRole="editor">
      {loading ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : !brand ? (
        <p className="text-sm text-neutral-400">Brand not found.</p>
      ) : (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/brands" className="text-sm text-neutral-500 underline underline-offset-2">
        ← Back to Brands
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {brand.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logo_url} alt="" className="h-12 w-12 flex-shrink-0 rounded-full object-cover" />
          ) : (
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-neutral-200 text-lg font-medium text-neutral-500">
              {brand.name.slice(0, 1)}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="break-words text-xl font-semibold leading-snug">
              {brand.name}
              {brand.is_own && (
                <span className="ml-2 inline-block rounded bg-bog px-1.5 py-0.5 align-middle text-[10px] font-semibold leading-none text-white">
                  YOU
                </span>
              )}
            </h1>
            {brand.category && <p className="text-sm text-neutral-500">{brand.category}</p>}
          </div>
        </div>
        <Link
          href={`/ads?brand_id=${brand.id}`}
          className="shrink-0 whitespace-nowrap rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
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
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={editingIsOwn}
                onChange={(e) => setEditingIsOwn(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-300"
              />
              This is my own brand (not a competitor)
            </label>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Logo</label>
              <LogoUploader
                value={editing.logo_url}
                onChange={(url) => setEditing((s) => ({ ...s, logo_url: url }))}
                brandId={id}
              />
            </div>
            {PLATFORM_FIELDS.map(({ platform, fields }) => (
              <div key={platform} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {fields.map((f) => (
                  <div key={f.key} className={fields.length === 1 ? "sm:col-span-2" : undefined}>
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
                className="rounded-md bg-bog px-4 py-2 text-sm font-medium text-white hover:bg-bog-dark disabled:opacity-50"
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
            {(["meta", "google", "linkedin"] as Platform[]).map((platform) => {
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
              <li key={run.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
                <span className="flex items-center gap-2 text-neutral-700">
                  <PlatformBadge platform={run.platform} />
                  {new Date(run.started_at).toLocaleString()}
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={clsx(
                      "break-words",
                      run.status === "succeeded" ? "text-green-600" : run.status === "failed" ? "text-red-600" : "text-neutral-400"
                    )}
                  >
                    {run.status === "succeeded"
                      ? `${run.ads_found ?? 0} ads (${run.ads_active ?? 0} active)`
                      : run.status === "failed"
                        ? (run.error ?? "Failed")
                        : "Running…"}
                  </span>
                  {run.status === "running" && (
                    <button
                      onClick={() => cancelRun(run.id)}
                      className="rounded-md border border-red-300 px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      Stop
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
      )}
    </RoleGate>
  );
}
