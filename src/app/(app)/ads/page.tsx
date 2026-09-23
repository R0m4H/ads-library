"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { AdWithBrand, Brand, ThemeRule } from "@/lib/types";
import { AdCard } from "@/components/AdCard";
import { FiltersBar, type AdFilters } from "@/components/FiltersBar";

export default function AdsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-neutral-400">Loading…</p>}>
      <AdsPageInner />
    </Suspense>
  );
}

function AdsPageInner() {
  const searchParams = useSearchParams();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [themes, setThemes] = useState<ThemeRule[]>([]);
  const [ads, setAds] = useState<AdWithBrand[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(24);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<AdFilters>({
    q: "",
    platform: "",
    brand_id: searchParams.get("brand_id") ?? "",
    theme: "",
    ad_format: "",
    active_only: false,
    own: "",
  });

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
    if (filters.brand_id) params.set("brand_id", filters.brand_id);
    if (filters.theme) params.set("theme", filters.theme);
    if (filters.ad_format) params.set("ad_format", filters.ad_format);
    if (filters.active_only) params.set("active_only", "true");
    if (filters.own) params.set("own", filters.own);
    params.set("page", String(page));
    params.set("page_size", String(pageSize));
    return params.toString();
  }, [filters, page, pageSize]);

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
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Ad Library</h1>
          <p className="text-sm text-neutral-500">{total} ad{total === 1 ? "" : "s"} matching your filters.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-neutral-500">
          Per page
          <select
            value={pageSize}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
            {[12, 24, 48, 96].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>

      <FiltersBar filters={filters} onChange={handleFilterChange} brands={brands} themes={themes} />

      {loading ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : ads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-12 text-center text-sm text-neutral-500">
          No ads yet. Add a brand and hit Sync from the Brands page to pull in ads.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-neutral-500">
            Page {page + 1} of {totalPages}
          </span>
          <button
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
