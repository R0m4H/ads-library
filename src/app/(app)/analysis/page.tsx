"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import type { Brand } from "@/lib/types";
import { ThemeComparisonChart, BRAND_COLORS } from "@/components/ThemeComparisonChart";

type PlatformKey = "all" | "meta" | "google" | "linkedin";

const PLATFORM_TABS: { key: PlatformKey; label: string }[] = [
  { key: "all", label: "All platforms" },
  { key: "meta", label: "Meta" },
  { key: "google", label: "Google" },
  { key: "linkedin", label: "LinkedIn" },
];

interface PlatformBucket {
  total: number;
  active: number;
  themeCounts: Record<string, number>;
  untagged: number;
  headlines: { headline: string; count: number }[];
}

interface BrandResult {
  brand: Pick<Brand, "id" | "name" | "is_own" | "logo_url" | "category"> | null;
  platforms: Record<PlatformKey, PlatformBucket>;
}

interface AnalysisResult {
  themes: string[];
  brands: BrandResult[];
}

// Tailwind's JIT scanner needs literal class names, not string-interpolated
// ones, so the grid column count is looked up rather than templated.
const KPI_GRID_COLS: Record<number, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
};

export default function AnalysisPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [activeOnly, setActiveOnly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [platformTab, setPlatformTab] = useState<PlatformKey>("all");

  useEffect(() => {
    fetch("/api/brands")
      .then((r) => r.json())
      .then((json) => setBrands(json.brands ?? []));
  }, []);

  function toggleBrand(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function generate() {
    if (selected.length === 0) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("brand_ids", selected.join(","));
    if (activeOnly) params.set("active_only", "true");
    const res = await fetch(`/api/analysis?${params.toString()}`);
    const json = await res.json();
    if (!res.ok) {
      setError(JSON.stringify(json.error));
      setResult(null);
    } else {
      setResult(json);
      setPlatformTab("all");
    }
    setLoading(false);
  }

  const rows = result?.brands.map((b) => ({ brand: b.brand, ...b.platforms[platformTab] })) ?? [];
  const chartLabels = result ? [...result.themes, "Untagged"] : [];
  const chartSeries = rows.map((r, i) => ({
    name: r.brand?.name ?? "Unknown",
    color: BRAND_COLORS[i % BRAND_COLORS.length],
    data: [...(result?.themes ?? []).map((t) => r.themeCounts[t] ?? 0), r.untagged],
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Analysis</h1>
        <p className="text-sm text-neutral-500">Pick any brands to compare their ad mix by theme.</p>
      </div>

      <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5">
        <div>
          <p className="mb-2 text-xs font-medium text-neutral-600">Brands to compare</p>
          <div className="flex flex-wrap gap-1.5">
            {brands.map((b) => (
              <button
                key={b.id}
                onClick={() => toggleBrand(b.id)}
                className={clsx(
                  "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                  selected.includes(b.id) ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                )}
              >
                {b.is_own ? "★ " : ""}
                {b.name}
              </button>
            ))}
            {brands.length === 0 && <p className="text-sm text-neutral-400">No brands yet.</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-neutral-600">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300"
            />
            Active ads only
          </label>
          <button
            onClick={generate}
            disabled={selected.length === 0 || loading}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {loading ? "Generating…" : "Generate comparison"}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {result && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {PLATFORM_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setPlatformTab(tab.key)}
                className={clsx(
                  "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                  platformTab === tab.key ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className={clsx("grid grid-cols-1 gap-4", KPI_GRID_COLS[Math.min(rows.length, 4)])}>
            {rows.map((r, i) => (
              <div key={r.brand?.id ?? i} className="rounded-xl border border-neutral-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  {r.brand?.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.brand.logo_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                  ) : null}
                  <p className="text-sm font-semibold text-neutral-900">{r.brand?.name ?? "Unknown brand"}</p>
                </div>
                <div className="mt-2 flex gap-4">
                  <div>
                    <p className="text-lg font-semibold">{r.active}</p>
                    <p className="text-xs text-neutral-400">active</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{r.total}</p>
                    <p className="text-xs text-neutral-400">total seen</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{r.untagged}</p>
                    <p className="text-xs text-neutral-400">untagged</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-neutral-700">Ads by theme</h2>
            {chartLabels.length <= 1 ? (
              <p className="text-sm text-neutral-400">No themes defined yet — add some on the Themes page.</p>
            ) : (
              <ThemeComparisonChart labels={chartLabels} series={chartSeries} />
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-4 py-2">Theme</th>
                  {rows.map((r, i) => (
                    <th key={r.brand?.id ?? i} className="px-4 py-2 text-right">
                      {r.brand?.name ?? "Unknown"}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...(result.themes ?? []), "Untagged"].map((theme) => (
                  <tr key={theme} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-2 font-medium text-neutral-700">{theme}</td>
                    {rows.map((r, i) => (
                      <td key={r.brand?.id ?? i} className="px-4 py-2 text-right">
                        {theme === "Untagged" ? r.untagged : (r.themeCounts[theme] ?? 0)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-neutral-700">Headline breakdown — every distinct headline, by frequency</h2>
            <div className={clsx("grid grid-cols-1 gap-4", KPI_GRID_COLS[Math.min(rows.length, 4)])}>
              {rows.map((r, i) => (
                <div key={r.brand?.id ?? i} className="rounded-xl border border-neutral-200 bg-white p-4">
                  <p className="mb-2 text-sm font-semibold text-neutral-900">{r.brand?.name ?? "Unknown brand"}</p>
                  {r.headlines.length === 0 ? (
                    <p className="text-xs text-neutral-400">No headline text on these ads.</p>
                  ) : (
                    <ul className="max-h-80 space-y-1 overflow-y-auto pr-1">
                      {r.headlines.map(({ headline, count }) => (
                        <li key={headline} className="flex items-start justify-between gap-2 text-xs">
                          <span className="text-neutral-600">{headline}</span>
                          <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 font-medium text-neutral-600">{count}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
