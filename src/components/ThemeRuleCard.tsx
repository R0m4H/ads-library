"use client";

import { useState } from "react";
import { X } from "lucide-react";
import clsx from "clsx";
import type { Brand, ThemeRule } from "@/lib/types";
import { uniqueNames } from "@/lib/classify";
import { MultiSelect } from "./MultiSelect";

function parseKeywords(input: string): string[] {
  return input
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Every page, for choosing where a theme applies. Choosing none means all pages. */
export function pageOptions(brands: Brand[]) {
  return [
    ...brands.filter((b) => b.is_own).map((b) => ({ value: b.id, label: b.name, group: "Your pages" })),
    ...brands.filter((b) => !b.is_own).map((b) => ({ value: b.id, label: b.name, group: "Competitors" })),
  ];
}

export function ThemeRuleCard({
  theme,
  allThemes,
  brands,
  onUpdated,
  onDeleted,
}: {
  theme: ThemeRule;
  allThemes: ThemeRule[];
  brands: Brand[];
  onUpdated: (theme: ThemeRule) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(theme.name);
  const [keywordsText, setKeywordsText] = useState(theme.keywords.join(", "));
  const [priority, setPriority] = useState(String(theme.priority ?? 0));
  const [excludes, setExcludes] = useState<string[]>(theme.excludes ?? []);
  const [scope, setScope] = useState<string[]>(theme.brand_ids ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleExclude(otherName: string) {
    setExcludes((prev) => (prev.includes(otherName) ? prev.filter((n) => n !== otherName) : [...prev, otherName]));
  }

  async function save() {
    const keywords = parseKeywords(keywordsText);
    if (!name.trim() || keywords.length === 0) {
      setError("Need a name and at least one keyword");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/themes/${theme.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), keywords, priority: Number(priority) || 0, excludes, brand_ids: scope }),
    });
    const json = await res.json();
    if (res.ok) {
      onUpdated(json.theme);
      setEditing(false);
    } else {
      setError(typeof json.error === "string" ? json.error : JSON.stringify(json.error));
    }
    setSaving(false);
  }

  async function remove() {
    if (!confirm(`Delete theme "${theme.name}"? Ads already tagged with it keep the tag until you re-tag.`)) return;
    const res = await fetch(`/api/themes/${theme.id}`, { method: "DELETE" });
    if (res.ok) onDeleted(theme.id);
  }

  // Excludes can name any other theme, including ones that belong to a single page: a general theme
  // can drop, say, a SOLO-only theme on the ads where both match.
  const otherThemes = uniqueNames(allThemes.filter((t) => t.id !== theme.id && t.name !== name.trim())).map((n) => ({
    id: n,
    name: n,
  }));
  const pageNames = (theme.brand_ids ?? []).map((id) => brands.find((b) => b.id === id)?.name).filter((n): n is string => Boolean(n));

  if (editing) {
    return (
      <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Theme name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">
            Applies to <span className="font-normal text-neutral-400">(tick the pages, or leave empty for all pages)</span>
          </label>
          <MultiSelect allLabel="All pages" noun="pages" options={pageOptions(brands)} value={scope} onChange={setScope} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Keywords (comma or newline separated)</label>
          <textarea
            value={keywordsText}
            onChange={(e) => setKeywordsText(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">
            Priority <span className="font-normal text-neutral-400">(higher wins when themes overlap on the same ad)</span>
          </label>
          <input
            type="number"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="w-24 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        {otherThemes.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">
              Excludes <span className="font-normal text-neutral-400">(if this theme matches, don&apos;t also tag these)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {otherThemes.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleExclude(t.name)}
                  className={clsx(
                    "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                    excludes.includes(t.name) ? "bg-red-100 text-red-700" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  )}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-bog px-3 py-1.5 text-xs font-medium text-white hover:bg-bog-dark disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setName(theme.name);
              setKeywordsText(theme.keywords.join(", "));
              setPriority(String(theme.priority ?? 0));
              setExcludes(theme.excludes ?? []);
              setError(null);
            }}
            className="rounded-md px-3 py-1.5 text-xs text-neutral-500 hover:bg-neutral-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="break-words font-semibold text-neutral-900">{theme.name}</h3>
          {theme.priority !== 0 && (
            <span className="whitespace-nowrap rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">
              priority {theme.priority}
            </span>
          )}
        </div>
        <div className="flex shrink-0 gap-3 whitespace-nowrap pt-0.5 text-xs">
          <button onClick={() => setEditing(true)} className="font-medium text-neutral-500 underline underline-offset-2">
            Edit
          </button>
          <button onClick={remove} className="flex items-center gap-1 text-red-500 hover:text-red-700">
            <X className="h-3 w-3" /> Delete
          </button>
        </div>
      </div>
      {pageNames.length > 0 && <p className="mb-2 break-words text-xs text-neutral-500">Only for: {pageNames.join(", ")}</p>}
      <div className="flex flex-wrap gap-1.5">
        {theme.keywords.map((kw) => (
          <span key={kw} className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
            {kw}
          </span>
        ))}
      </div>
      {theme.excludes?.length > 0 && (
        <p className="mt-2 text-xs text-neutral-400">Excludes: {theme.excludes.join(", ")}</p>
      )}
    </div>
  );
}
