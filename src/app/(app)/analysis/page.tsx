"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import type { Brand } from "@/lib/types";
import { ThemeComparisonChart, BRAND_COLORS } from "@/components/ThemeComparisonChart";
import { RadarComparisonChart } from "@/components/RadarComparisonChart";
import { downloadCsv, toCsv } from "@/lib/csv";

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

interface Finding {
  brand: string | null;
  tag: "advantage" | "contested" | "white-space" | "risk";
  title: string;
  body: string;
}

interface GapRow {
  gap: string;
  evidence: string;
  move: string;
  priority: "high" | "med" | "low";
}

interface AIAnalysis {
  findings: Finding[];
  gaps: GapRow[];
  checklist: string[];
}

const TAG_STYLES: Record<Finding["tag"], string> = {
  advantage: "bg-green-50 text-green-700",
  contested: "bg-amber-50 text-amber-700",
  "white-space": "bg-neutral-100 text-neutral-600",
  risk: "bg-red-50 text-red-700",
};

const PRIORITY_STYLES: Record<GapRow["priority"], string> = {
  high: "bg-red-50 text-red-700",
  med: "bg-amber-50 text-amber-700",
  low: "bg-green-50 text-green-700",
};

// Tailwind's JIT scanner needs literal class names, not string-interpolated
// ones, so the grid column count is looked up rather than templated.
const KPI_GRID_COLS: Record<number, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
};

/** The gap between the most and fewest ads, and who has the most (nobody when it is a tie). */
function compareCounts(counts: number[], rows: { brand: { name: string } | null }[]) {
  const most = Math.max(...counts);
  const diff = most - Math.min(...counts);
  const leaders = rows.filter((_, i) => counts[i] === most);
  const leader = diff > 0 && leaders.length === 1 ? (leaders[0].brand?.name ?? "Unknown") : null;
  return { diff, leader };
}

export default function AnalysisPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [activeOnly, setActiveOnly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [platformTab, setPlatformTab] = useState<PlatformKey>("all");
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  // Whether the comparison on screen was made with "Active ads only" (the box can change afterwards).
  const [resultActiveOnly, setResultActiveOnly] = useState(true);
  const insightsAbort = useRef<AbortController | null>(null);
  const [insightsSeconds, setInsightsSeconds] = useState(0);

  // Counts the seconds the AI request has been running, so a slow answer doesn't look like a frozen page.
  useEffect(() => {
    if (!insightsLoading) return;
    const timer = setInterval(() => setInsightsSeconds((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [insightsLoading]);

  // Leaving the page cancels a request that is still running.
  useEffect(() => () => insightsAbort.current?.abort(), []);

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
      setResultActiveOnly(activeOnly);
      setPlatformTab("all");
    }
    setAiAnalysis(null);
    setInsightsError(null);
    setLoading(false);
  }

  function selectPlatformTab(key: PlatformKey) {
    setPlatformTab(key);
    setAiAnalysis(null);
    setInsightsError(null);
  }

  async function generateInsights() {
    if (!result) return;
    const controller = new AbortController();
    insightsAbort.current = controller;
    setInsightsLoading(true);
    setInsightsSeconds(0);
    setInsightsError(null);
    const payload = {
      platformLabel: PLATFORM_TABS.find((t) => t.key === platformTab)?.label ?? platformTab,
      activeOnly: resultActiveOnly,
      themes: visibleThemes,
      brands: rows.map((r) => ({
        name: r.brand?.name ?? "Unknown",
        isOwn: r.brand?.is_own ?? false,
        total: r.total,
        active: r.active,
        untagged: r.untagged,
        themeCounts: r.themeCounts,
        topHeadlines: r.headlines.slice(0, 15),
      })),
    };
    try {
      const res = await fetch("/api/analysis/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      // A timeout at the host can answer with plain text instead of JSON.
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) setInsightsError(typeof json?.error === "string" ? json.error : "The AI request failed or took too long. Try again.");
      else setAiAnalysis(json);
    } catch (e) {
      // Cancelled on purpose: nothing to report.
      if (!(e instanceof DOMException && e.name === "AbortError")) setInsightsError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      if (insightsAbort.current === controller) insightsAbort.current = null;
      setInsightsLoading(false);
    }
  }

  function cancelInsights() {
    insightsAbort.current?.abort();
  }

  // The theme table as a spreadsheet file.
  function exportCsv() {
    if (!result) return;
    const header = ["Theme", ...rows.map((r) => r.brand?.name ?? "Unknown"), ...(rows.length > 1 ? ["Difference", "Ahead"] : [])];
    const lines = [...visibleThemes, "Untagged"].map((theme) => {
      const counts = rows.map((r) => (theme === "Untagged" ? r.untagged : (r.themeCounts[theme] ?? 0)));
      const { diff, leader } = compareCounts(counts, rows);
      return [theme, ...counts, ...(rows.length > 1 ? [diff, leader ?? ""] : [])];
    });
    const platform = PLATFORM_TABS.find((t) => t.key === platformTab)?.label ?? platformTab;
    const csv = toCsv([
      header,
      ...lines,
      [],
      ["All ads in this view", ...rows.map((r) => r.total)],
      [resultActiveOnly ? "Active ads only" : "Active ads", ...rows.map((r) => r.active)],
      [],
      ["Platform", platform],
    ]);
    downloadCsv(`theme-comparison-${platformTab}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  const ownBrands = brands.filter((b) => b.is_own);
  const competitorBrands = brands.filter((b) => !b.is_own);

  const rows = result?.brands.map((b) => ({ brand: b.brand, ...b.platforms[platformTab] })) ?? [];
  // A theme is shown if at least ONE selected brand has ads in it (in the current platform tab and
  // active-only setting). Only when every selected brand has 0 is it hidden, so a theme one brand
  // owns and another ignores still appears — with a 0 for the one that ignores it.
  const allThemes = result?.themes ?? [];
  const visibleThemes = allThemes.filter((t) => rows.some((r) => (r.themeCounts[t] ?? 0) > 0));
  const hiddenThemeCount = allThemes.length - visibleThemes.length;
  const chartLabels = result ? [...visibleThemes, "Untagged"] : [];
  const chartSeries = rows.map((r, i) => ({
    name: r.brand?.name ?? "Unknown",
    color: BRAND_COLORS[i % BRAND_COLORS.length],
    data: [...visibleThemes.map((t) => r.themeCounts[t] ?? 0), r.untagged],
  }));

  // Radar: each theme axis normalized 0-100 against the category leader
  // among the selected brands, same convention as a typical share-of-voice
  // competitive radar.
  const radarThemes = visibleThemes;
  const maxByTheme = Object.fromEntries(radarThemes.map((t) => [t, Math.max(1, ...rows.map((r) => r.themeCounts[t] ?? 0))]));
  const radarSeries = rows.map((r, i) => ({
    name: r.brand?.name ?? "Unknown",
    color: BRAND_COLORS[i % BRAND_COLORS.length],
    data: radarThemes.map((t) => Math.round(((r.themeCounts[t] ?? 0) / maxByTheme[t]) * 100)),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Analysis</h1>
        <p className="text-sm text-neutral-500">Pick any brands to compare their ad mix by theme.</p>
      </div>

      <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5 print:hidden">
        <div className="space-y-3">
          <p className="text-xs font-medium text-neutral-600">Brands to compare</p>
          {brands.length === 0 && <p className="text-sm text-neutral-400">No brands yet.</p>}
          {[
            { title: "Your pages", list: ownBrands },
            { title: "Competitors", list: competitorBrands },
          ]
            .filter((group) => group.list.length > 0)
            .map((group) => (
              <div key={group.title}>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{group.title}</p>
                <div className="flex flex-wrap gap-1.5">
                  {group.list.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => toggleBrand(b.id)}
                      className={clsx(
                        "max-w-full rounded-full px-3 py-1.5 text-left text-sm font-medium transition-colors",
                        selected.includes(b.id) ? "bg-bog text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                      )}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
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
            className="rounded-md bg-bog px-4 py-2 text-sm font-medium text-white hover:bg-bog-dark disabled:opacity-50"
          >
            {loading ? "Generating…" : "Generate comparison"}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {result && (
        <>
          <p className="hidden text-sm text-neutral-600 print:block">
            {PLATFORM_TABS.find((t) => t.key === platformTab)?.label} · {resultActiveOnly ? "active ads only" : "all ads seen"} · {new Date().toLocaleDateString()}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex flex-wrap gap-1.5">
            {PLATFORM_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => selectPlatformTab(tab.key)}
                className={clsx(
                  "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                  platformTab === tab.key ? "bg-bog text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={exportCsv}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Download CSV
            </button>
            <button
              onClick={() => window.print()}
              title="Opens the print window — choose “Save as PDF”"
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Save as PDF
            </button>
          </div>
          </div>

          <div className={clsx("grid grid-cols-1 gap-4", KPI_GRID_COLS[Math.min(rows.length, 4)])}>
            {rows.map((r, i) => (
              <div key={r.brand?.id ?? i} className="rounded-xl border border-neutral-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  {r.brand?.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.brand.logo_url} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                  ) : null}
                  <p className="min-w-0 break-words text-sm font-semibold text-neutral-900">{r.brand?.name ?? "Unknown brand"}</p>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                  <div>
                    <p className="text-lg font-semibold">{r.active}</p>
                    <p className="text-xs text-neutral-400">active</p>
                  </div>
                  {/* With "Active ads only" the total is the active count again, so don't show it twice. */}
                  {!resultActiveOnly && (
                    <div>
                      <p className="text-lg font-semibold">{r.total}</p>
                      <p className="text-xs text-neutral-400">total seen</p>
                    </div>
                  )}
                  <div>
                    <p className="text-lg font-semibold">{r.untagged}</p>
                    <p className="text-xs text-neutral-400">untagged</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-5">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-neutral-700">Ads by theme</h2>
              {hiddenThemeCount > 0 && (
                <p className="mt-0.5 text-xs text-neutral-400">
                  {hiddenThemeCount} {hiddenThemeCount === 1 ? "theme" : "themes"} with no ads for the selected brands {hiddenThemeCount === 1 ? "is" : "are"} hidden.
                </p>
              )}
            </div>
            {chartLabels.length <= 1 ? (
              <p className="text-sm text-neutral-400">
                {allThemes.length === 0
                  ? "No themes defined yet — add some on the Themes page."
                  : "None of your themes have ads for the selected brands."}
              </p>
            ) : (
              <ThemeComparisonChart labels={chartLabels} series={chartSeries} />
            )}
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-5">
            <h2 className="mb-1 text-sm font-semibold text-neutral-700">Competitive radar</h2>
            <p className="mb-4 text-xs text-neutral-400">Each theme axis normalized 0-100 against whichever brand leads it.</p>
            {radarThemes.length < 3 ? (
              <p className="text-sm text-neutral-400">
                {allThemes.length < 3
                  ? "Define at least 3 themes to get a useful radar comparison."
                  : "The radar needs at least 3 themes that have ads for the selected brands."}
              </p>
            ) : (
              <RadarComparisonChart labels={radarThemes} series={radarSeries} />
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
                  {rows.length > 1 && (
                    <th className="px-4 py-2 text-right" title="Most ads minus fewest ads among the selected brands">
                      Difference
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {[...visibleThemes, "Untagged"].map((theme) => {
                  const counts = rows.map((r) => (theme === "Untagged" ? r.untagged : (r.themeCounts[theme] ?? 0)));
                  const { diff, leader } = compareCounts(counts, rows);
                  return (
                    <tr key={theme} className="border-b border-neutral-100 last:border-0">
                      <td className="px-4 py-2 font-medium text-neutral-700">{theme}</td>
                      {counts.map((n, i) => (
                        <td key={rows[i].brand?.id ?? i} className="px-4 py-2 text-right">
                          {n}
                        </td>
                      ))}
                      {rows.length > 1 && (
                        <td className="px-4 py-2 text-right">
                          <span className="block font-medium text-neutral-900">{diff}</span>
                          {leader && (
                            <span className="ml-auto block max-w-[10rem] truncate text-xs text-neutral-400" title={`${leader} has the most`}>
                              {leader}
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-neutral-700">Key strategic findings</h2>
              <div className="flex items-center gap-2 print:hidden">
                {insightsLoading && (
                  <button
                    onClick={cancelInsights}
                    className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={generateInsights}
                  disabled={insightsLoading}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                >
                  {insightsLoading ? "Generating…" : aiAnalysis ? "Generate again" : "Generate AI insights"}
                </button>
              </div>
            </div>
            {insightsLoading && (
              <div role="status" className="mb-3 space-y-2">
                <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                  <div className="h-full w-1/3 animate-pulse rounded-full bg-bog" />
                </div>
                <p className="text-xs text-neutral-500">
                  Asking Gemini… {insightsSeconds}s
                  {insightsSeconds >= 15 && " — taking longer than usual. The AI service may be busy; it retries on its own, or you can cancel."}
                </p>
              </div>
            )}
            {insightsError && (
              <div className="flex flex-wrap items-center gap-3 rounded-md bg-red-50 px-3 py-2 print:hidden">
                <p className="min-w-0 flex-1 break-words text-sm text-red-700">{insightsError}</p>
                <button
                  onClick={generateInsights}
                  className="shrink-0 rounded-md border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                >
                  Try again
                </button>
              </div>
            )}
            {aiAnalysis && aiAnalysis.findings.length > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {aiAnalysis.findings.map((f, i) => (
                  <div key={i} className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                    <span className={clsx("mb-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", TAG_STYLES[f.tag])}>
                      {f.brand ? `${f.brand} · ${f.tag}` : f.tag}
                    </span>
                    <p className="mb-1 text-sm font-semibold text-neutral-900">{f.title}</p>
                    <p className="text-xs leading-relaxed text-neutral-600">{f.body}</p>
                  </div>
                ))}
              </div>
            )}
            {!aiAnalysis && !insightsError && !insightsLoading && (
              <p className="text-sm text-neutral-400">
                Uses Gemini to summarize the numbers above into strategic takeaways — nothing is sent until you click.
              </p>
            )}
          </div>

          {aiAnalysis && aiAnalysis.gaps.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
              <h2 className="border-b border-neutral-200 px-5 py-3 text-sm font-semibold text-neutral-700">
                Gap &amp; opportunity priority matrix
              </h2>
              <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                    <th className="px-4 py-2">Gap / opportunity</th>
                    <th className="px-4 py-2">Evidence</th>
                    <th className="px-4 py-2">Recommended move</th>
                    <th className="px-4 py-2">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {aiAnalysis.gaps.map((g, i) => (
                    <tr key={i} className="border-b border-neutral-100 align-top last:border-0">
                      <td className="px-4 py-2.5 font-medium text-neutral-800">{g.gap}</td>
                      <td className="px-4 py-2.5 text-neutral-600">{g.evidence}</td>
                      <td className="px-4 py-2.5 text-neutral-600">{g.move}</td>
                      <td className="px-4 py-2.5">
                        <span className={clsx("whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", PRIORITY_STYLES[g.priority])}>
                          {g.priority}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {aiAnalysis && aiAnalysis.checklist.length > 0 && (
            <div className="rounded-xl border border-neutral-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold text-neutral-700">30-day action checklist</h2>
              <ul className="space-y-2">
                {aiAnalysis.checklist.map((item, i) => (
                  <li key={i} className="flex items-start gap-3 border-b border-neutral-100 pb-2 text-sm last:border-0 last:pb-0">
                    <span className="min-w-[20px] shrink-0 text-xs font-semibold text-neutral-400">{String(i + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 break-words text-neutral-700">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h2 className="mb-3 text-sm font-semibold text-neutral-700">Headline breakdown — every distinct headline, by frequency</h2>
            <div className={clsx("grid grid-cols-1 gap-4", KPI_GRID_COLS[Math.min(rows.length, 4)])}>
              {rows.map((r, i) => (
                <div key={r.brand?.id ?? i} className="rounded-xl border border-neutral-200 bg-white p-4">
                  <p className="mb-2 break-words text-sm font-semibold text-neutral-900">{r.brand?.name ?? "Unknown brand"}</p>
                  {r.headlines.length === 0 ? (
                    <p className="text-xs text-neutral-400">No headline text on these ads.</p>
                  ) : (
                    <ul className="max-h-80 space-y-1 overflow-y-auto pr-1">
                      {r.headlines.map(({ headline, count }) => (
                        <li key={headline} className="flex items-start justify-between gap-2 text-xs">
                          <span className="min-w-0 break-words text-neutral-600">{headline}</span>
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
