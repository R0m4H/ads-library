"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { UNTAGGED_THEME, type AdWithBrand, type Brand, type ThemeRule } from "@/lib/types";
import { AdCard } from "@/components/AdCard";
import { FiltersBar, type AdFilters } from "@/components/FiltersBar";
import { SingleSelect } from "@/components/MultiSelect";
import { listUrlFor, readListState, saveListUrl, saveScroll, takeScroll } from "@/lib/adsListState";

const SORT_OPTIONS = [
  { value: "", label: "Active first" },
  { value: "newest", label: "Newest first" },
  { value: "platform", label: "Platform" },
];

export default function AdsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-neutral-400">Loading…</p>}>
      <AdsPageInner />
    </Suspense>
  );
}

function AdsPageInner() {
  const searchParams = useSearchParams();
  // Filters, page and page size come from the address, so coming back from an ad restores them.
  const [initial] = useState(() => readListState(new URLSearchParams(searchParams.toString())));
  const [brands, setBrands] = useState<Brand[]>([]);
  const [themes, setThemes] = useState<ThemeRule[]>([]);
  const [ads, setAds] = useState<AdWithBrand[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initial.page);
  const [pageSize, setPageSize] = useState(initial.pageSize);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<AdFilters>(initial.filters);
  const [fetchedThemes, setFetchedThemes] = useState<{ themes: string[]; untagged: boolean } | null>(null);
  const restoredScroll = useRef(false);

  useEffect(() => {
    fetch("/api/brands")
      .then((r) => r.json())
      .then((json) => setBrands(json.brands ?? []));
    fetch("/api/themes")
      .then((r) => r.json())
      .then((json) => setThemes(json.themes ?? []));
  }, []);

  // The theme filter only lists themes the chosen pages' ads have. Which pages count depends on the brand
  // picks and on "Only yours / Only competitors"; with neither chosen, every theme is listed.
  const scopeKey = useMemo(() => {
    if (filters.brand_ids.length === 0 && !filters.own) return "";
    const params = new URLSearchParams();
    for (const id of filters.brand_ids) params.append("brand_id", id);
    if (filters.own) params.set("own", filters.own);
    return params.toString();
  }, [filters.brand_ids, filters.own]);

  useEffect(() => {
    if (!scopeKey) return;
    let stale = false;
    fetch(`/api/ads/themes?${scopeKey}`)
      .then((r) => r.json())
      .then((json) => {
        if (stale || !Array.isArray(json.themes)) return;
        const found = { themes: json.themes as string[], untagged: Boolean(json.untagged) };
        setFetchedThemes(found);
        // A theme picked earlier that these pages don't have would only leave an empty list: drop it.
        setFilters((f) => {
          const kept = f.themes.filter((t) => t === UNTAGGED_THEME ? found.untagged : found.themes.includes(t));
          return kept.length === f.themes.length ? f : { ...f, themes: kept };
        });
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [scopeKey]);

  // No page chosen: every theme is listed. Otherwise the last answer (kept while a new one loads).
  const availableThemes = scopeKey ? fetchedThemes : null;

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.platform) params.set("platform", filters.platform);
    for (const id of filters.brand_ids) params.append("brand_id", id);
    for (const theme of filters.themes) params.append("theme", theme);
    for (const format of filters.ad_formats) params.append("ad_format", format);
    if (filters.active_only) params.set("active_only", "true");
    if (filters.missing_copy) params.set("missing_copy", "true");
    if (filters.own) params.set("own", filters.own);
    if (filters.sort) params.set("sort", filters.sort);
    params.set("page", String(page));
    params.set("page_size", String(pageSize));
    return params.toString();
  }, [filters, page, pageSize]);

  // Keep the address in step with the filters (without adding history entries or re-rendering), and
  // remember it so "Back to Ad Library" on an ad returns here.
  const listUrl = useMemo(() => listUrlFor(query), [query]);
  useEffect(() => {
    window.history.replaceState(window.history.state, "", listUrl);
    saveListUrl(listUrl);
  }, [listUrl]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setLoading(true);
      fetch(`/api/ads?${query}`)
        .then((r) => r.json())
        .then((json) => {
          setAds(json.ads ?? []);
          setTotal(json.total ?? 0);
          // A page number past the end (an old link, or filters that now match fewer ads): go to the
          // last page that exists instead of showing an empty one.
          if (json.total > 0 && json.pageSize > 0 && json.page * json.pageSize >= json.total) setPage(Math.ceil(json.total / json.pageSize) - 1);
        })
        .finally(() => setLoading(false));
    }, 250); // debounce free-text search
    return () => clearTimeout(timeout);
  }, [query]);

  // Coming back from an ad: once the list is on screen again, scroll to where the user was.
  useEffect(() => {
    if (loading || ads.length === 0 || restoredScroll.current) return;
    restoredScroll.current = true;
    const y = takeScroll(listUrl);
    if (y !== null) requestAnimationFrame(() => window.scrollTo(0, y));
  }, [loading, ads.length, listUrl]);

  function handleFilterChange(f: AdFilters) {
    setPage(0);
    setFilters(f);
  }

  // Clicking a theme on a card narrows the list to that theme (other filters stay).
  function showTheme(theme: string) {
    handleFilterChange({ ...filters, themes: [theme] });
    window.scrollTo(0, 0);
  }

  function handlePageSizeChange(size: number) {
    setPage(0);
    setPageSize(size);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const filtersActive =
    Boolean(filters.q || filters.platform || filters.own || filters.active_only || filters.missing_copy) ||
    filters.brand_ids.length > 0 ||
    filters.themes.length > 0 ||
    filters.ad_formats.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Ad Library</h1>
          <p className="text-sm text-neutral-500">{total} ad{total === 1 ? "" : "s"} matching your filters.</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 whitespace-nowrap text-sm text-neutral-500">
        <div className="flex items-center gap-2">
          Sort
          <SingleSelect
            compact
            panelWidth={176}
            highlightChanged={false}
            options={SORT_OPTIONS}
            value={filters.sort}
            onChange={(v) => handleFilterChange({ ...filters, sort: v as AdFilters["sort"] })}
          />
        </div>
        <div className="flex items-center gap-2">
          Per page
          <SingleSelect
            compact
            panelWidth={96}
            highlightChanged={false}
            options={[12, 24, 48, 96].map((size) => ({ value: String(size), label: String(size) }))}
            value={String(pageSize)}
            onChange={(v) => handlePageSizeChange(Number(v))}
          />
        </div>
        </div>
      </div>

      <FiltersBar filters={filters} onChange={handleFilterChange} brands={brands} themes={themes} availableThemes={availableThemes} />

      {loading ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : ads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-12 text-center text-sm text-neutral-500">
          {filtersActive ? (
            <>
              <p>No ads match these filters.</p>
              <button
                onClick={() => handleFilterChange({ ...filters, q: "", platform: "", brand_ids: [], themes: [], ad_formats: [], active_only: false, missing_copy: false, own: "" })}
                className="mt-3 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Clear filters
              </button>
            </>
          ) : (
            "No ads yet. Add a brand and hit Sync from the Brands page to pull in ads."
          )}
        </div>
      ) : (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          // Before a click opens an ad, note where the list was scrolled to.
          onClickCapture={() => saveScroll(listUrl, window.scrollY)}
        >
          {ads.map((ad) => (
            <AdCard
              key={ad.id}
              ad={ad}
              themes={themes}
              onThemeClick={showTheme}
              onTagsChange={(id, tags) => setAds((prev) => prev.map((a) => (a.id === id ? { ...a, theme_tags: tags, tags_manual: true } : a)))}
              onDelete={(id) => {
                setAds((prev) => prev.filter((a) => a.id !== id));
                setTotal((t) => Math.max(0, t - 1));
              }}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-4">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
          >
            Previous
          </button>
          <span className="text-sm text-neutral-500">
            Page {page + 1} of {totalPages}
          </span>
          <button
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
