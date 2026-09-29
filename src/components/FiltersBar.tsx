"use client";

import { Search } from "lucide-react";
import clsx from "clsx";
import { AD_FORMAT_OPTIONS, UNTAGGED_THEME, type Brand, type Platform, type ThemeRule } from "@/lib/types";
import { canEdit } from "@/lib/role";
import { useCurrentUser } from "./RoleProvider";

export interface AdFilters {
  q: string;
  platform: Platform | "";
  brand_id: string;
  theme: string;
  ad_format: string;
  active_only: boolean;
  missing_copy: boolean;
  own: "" | "own" | "competitors";
}

const PLATFORM_FILTERS: { value: Platform | ""; label: string }[] = [
  { value: "", label: "All platforms" },
  { value: "meta", label: "Meta" },
  { value: "google", label: "Google" },
  { value: "linkedin", label: "LinkedIn" },
];

export function FiltersBar({
  filters,
  onChange,
  brands,
  themes,
}: {
  filters: AdFilters;
  onChange: (f: AdFilters) => void;
  brands: Brand[];
  themes: ThemeRule[];
}) {
  const { role } = useCurrentUser();

  function set<K extends keyof AdFilters>(key: K, value: AdFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-3">
      <div className="flex flex-wrap gap-1.5">
        {PLATFORM_FILTERS.map((opt) => (
          <button
            key={opt.value || "all"}
            onClick={() => set("platform", opt.value)}
            className={clsx(
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              filters.platform === opt.value ? "bg-bog text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={filters.q}
            onChange={(e) => set("q", e.target.value)}
            placeholder="Search headline, body, CTA…"
            className="w-full rounded-md border border-neutral-300 py-2 pl-9 pr-3 text-sm focus:border-bog focus:outline-none"
          />
        </div>

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
          <option value={UNTAGGED_THEME}>No theme</option>
          {themes.map((t) => (
            <option key={t.id} value={t.name}>
              {t.name}
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

        {canEdit(role) && (
          <label className="flex items-center gap-2 text-sm text-neutral-600" title="Ads with no headline and no body text">
            <input
              type="checkbox"
              checked={filters.missing_copy}
              onChange={(e) => set("missing_copy", e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300"
            />
            Missing copy
          </label>
        )}
      </div>
    </div>
  );
}
