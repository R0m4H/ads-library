"use client";

import { Search } from "lucide-react";
import { AD_FORMAT_OPTIONS, PLATFORM_LABELS, THEME_OPTIONS, type Brand, type Platform } from "@/lib/types";

export interface AdFilters {
  q: string;
  platform: Platform | "";
  brand_id: string;
  theme: string;
  ad_format: string;
  active_only: boolean;
  own: "" | "own" | "competitors";
}

export function FiltersBar({
  filters,
  onChange,
  brands,
}: {
  filters: AdFilters;
  onChange: (f: AdFilters) => void;
  brands: Brand[];
}) {
  function set<K extends keyof AdFilters>(key: K, value: AdFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          value={filters.q}
          onChange={(e) => set("q", e.target.value)}
          placeholder="Search headline, body, CTA…"
          className="w-full rounded-md border border-neutral-300 py-2 pl-9 pr-3 text-sm focus:border-neutral-500 focus:outline-none"
        />
      </div>

      <select
        value={filters.platform}
        onChange={(e) => set("platform", e.target.value as Platform | "")}
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
      >
        <option value="">All platforms</option>
        {Object.entries(PLATFORM_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      <select
        value={filters.brand_id}
        onChange={(e) => set("brand_id", e.target.value)}
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
      >
        <option value="">All brands</option>
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.is_own ? "★ " : ""}
            {b.name}
          </option>
        ))}
      </select>

      <select
        value={filters.theme}
        onChange={(e) => set("theme", e.target.value)}
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
      >
        <option value="">All themes</option>
        {THEME_OPTIONS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      <select
        value={filters.ad_format}
        onChange={(e) => set("ad_format", e.target.value)}
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
      >
        <option value="">All ad types</option>
        {AD_FORMAT_OPTIONS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      <select
        value={filters.own}
        onChange={(e) => set("own", e.target.value as AdFilters["own"])}
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
      >
        <option value="">Yours + competitors</option>
        <option value="own">Only yours</option>
        <option value="competitors">Only competitors</option>
      </select>

      <label className="flex items-center gap-2 text-sm text-neutral-600">
        <input
          type="checkbox"
          checked={filters.active_only}
          onChange={(e) => set("active_only", e.target.checked)}
          className="h-4 w-4 rounded border-neutral-300"
        />
        Active only
      </label>
    </div>
  );
}
