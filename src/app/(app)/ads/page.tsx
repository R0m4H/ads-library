"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { AdWithBrand, Brand, ThemeRule } from "@/lib/types";
import { AdCard } from "@/components/AdCard";
import { FiltersBar, type AdFilters } from "@/components/FiltersBar";
import { SingleSelect } from "@/components/MultiSelect";
import { listUrlFor, readListState, saveListUrl, saveScroll, takeScroll } from "@/lib/adsListState";

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
  const restoredScroll = useRef(false);

  useEffect(() => {
    fetch("/api/brands")
      .then((r) => r.json())
      .then((json) => setBrands(json.brands ?? []));
    fetch("/api/themes")
      .then((r) => r.json())
      .then((json) => setThemes(json.themes ?? []));
  }, []);

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

  function handlePageSizeChange(size: number) {
    setPage(0);
    setPageSize(size);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Ad Library</h1>
          <p className="text-sm text-neutral-500">{total} ad{total === 1 ? "" : "s"} matching your filters.</p>
        </div>
        <div className="flex items-center gap-2 whitespace-nowrap text-sm text-neutral-500">
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

      <FiltersBar filters={filters} onChange={handleFilterChange} brands={brands} themes={themes} />

      {loading ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : ads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-12 text-center text-sm text-neutral-500">
          No ads yet. Add a brand and hit Sync from the Brands page to pull in ads.
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
