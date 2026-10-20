"use client";

import { Search } from "lucide-react";
import clsx from "clsx";
import { AD_FORMAT_OPTIONS, UNTAGGED_THEME, type Brand, type Platform, type ThemeRule } from "@/lib/types";
import { canEdit } from "@/lib/role";
import { useCurrentUser } from "./RoleProvider";
import { MultiSelect, SingleSelect } from "./MultiSelect";
import { uniqueNames } from "@/lib/classify";

export interface AdFilters {
  q: string;
  platform: Platform | "";
  /** Empty = all. Several values match any of them. */
  brand_ids: string[];
  themes: string[];
  ad_formats: string[];
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

const OWN_OPTIONS = [
  { value: "", label: "Yours + competitors" },
  { value: "own", label: "Only yours" },
  { value: "competitors", label: "Only competitors" },
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
  // Your own brands first, then competitors.
  const brandOptions = [
    ...brands.filter((b) => b.is_own).map((b) => ({ value: b.id, label: b.name, group: "Your brands" })),
    ...brands.filter((b) => !b.is_own).map((b) => ({ value: b.id, label: b.name, group: "Competitors" })),
  ];
  // A theme name can exist for several pages (and as a general theme); list each name once.
  const themeOptions = [{ value: UNTAGGED_THEME, label: "No theme" }, ...uniqueNames(themes).map((name) => ({ value: name, label: name }))];

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

        <MultiSelect
          allLabel="All brands"
          noun="brands"
          options={brandOptions}
          value={filters.brand_ids}
          onChange={(v) => set("brand_ids", v)}
        />

        <MultiSelect
          allLabel="All themes"
          noun="themes"
          options={themeOptions}
          value={filters.themes}
          onChange={(v) => set("themes", v)}
        />

        <MultiSelect
          allLabel="All ad types"
          noun="ad types"
          options={AD_FORMAT_OPTIONS.map((f) => ({ value: f.value, label: f.label }))}
          value={filters.ad_formats}
          onChange={(v) => set("ad_formats", v)}
        />

        <SingleSelect
          options={OWN_OPTIONS}
          value={filters.own}
          onChange={(v) => set("own", v as AdFilters["own"])}
        />

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
