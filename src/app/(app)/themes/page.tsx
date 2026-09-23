"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import type { ThemeRule } from "@/lib/types";
import { ThemeRuleCard } from "@/components/ThemeRuleCard";

function parseKeywords(input: string): string[] {
  return input
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function ThemesPage() {
  const [themes, setThemes] = useState<ThemeRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newKeywords, setNewKeywords] = useState("");
  const [newPriority, setNewPriority] = useState("0");
  const [newExcludes, setNewExcludes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [retagging, setRetagging] = useState(false);
  const [retagResult, setRetagResult] = useState<string | null>(null);

  function load() {
    fetch("/api/themes")
      .then((r) => r.json())
      .then((json) => {
        setThemes(json.themes ?? []);
        setLoading(false);
      });
  }

  useEffect(load, []);

  async function addTheme(e: React.FormEvent) {
    e.preventDefault();
    const keywords = parseKeywords(newKeywords);
    if (!newName.trim() || keywords.length === 0) {
      setAddError("Need a name and at least one keyword");
      return;
    }
    setSaving(true);
    setAddError(null);
    const res = await fetch("/api/themes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        keywords,
        priority: Number(newPriority) || 0,
        excludes: newExcludes,
      }),
    });
    const json = await res.json();
    if (res.ok) {
      setThemes((prev) => [...prev, json.theme].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
      setNewKeywords("");
      setNewPriority("0");
      setNewExcludes([]);
    } else {
      setAddError(JSON.stringify(json.error));
    }
    setSaving(false);
  }

  function toggleNewExclude(name: string) {
    setNewExcludes((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  }

  async function retagAll() {
    if (
      !confirm(
        "Re-tag ALL ads using your current theme rules? This overwrites every ad's theme tags — including any you edited manually — based on what matches now."
      )
    )
      return;
    setRetagging(true);
    setRetagResult(null);
    const res = await fetch("/api/themes/retag", { method: "POST" });
    const json = await res.json();
    setRetagResult(
      res.ok ? `Re-tagged ${json.total} ads — ${json.tagged} matched at least one theme.` : (json.error?.toString() ?? "Failed")
    );
    setRetagging(false);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Themes</h1>
          <p className="text-sm text-neutral-500">
            Define your own themes and the keywords that identify them. Ads get tagged automatically on sync, or you can
            re-tag everything already synced.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={retagAll}
            disabled={retagging || themes.length === 0}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            {retagging ? "Re-tagging…" : "Re-tag all ads"}
          </button>
          {retagResult && <p className="max-w-[220px] text-right text-xs text-neutral-500">{retagResult}</p>}
        </div>
      </div>

      <form onSubmit={addTheme} className="space-y-3 rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold">Add a theme</h2>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Theme name</label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Remittance offers"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Keywords (comma or newline separated)</label>
          <textarea
            value={newKeywords}
            onChange={(e) => setNewKeywords(e.target.value)}
            rows={3}
            placeholder="e.g. remittance, transfer, გზავნილი"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">
            Priority <span className="font-normal text-neutral-400">(higher wins when themes overlap on the same ad)</span>
          </label>
          <input
            type="number"
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value)}
            className="w-24 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        {themes.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">
              Excludes <span className="font-normal text-neutral-400">(if this theme matches, don&apos;t also tag these)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {themes.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleNewExclude(t.name)}
                  className={clsx(
                    "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                    newExcludes.includes(t.name)
                      ? "bg-red-100 text-red-700"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  )}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {addError && <p className="text-sm text-red-600">{addError}</p>}
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add theme"}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : themes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          No themes yet — add one above to start tagging ads.
        </div>
      ) : (
        <div className="space-y-3">
          {themes.map((theme) => (
            <ThemeRuleCard
              key={theme.id}
              theme={theme}
              allThemes={themes}
              onUpdated={(t) => setThemes((prev) => prev.map((x) => (x.id === t.id ? t : x)).sort((a, b) => a.name.localeCompare(b.name)))}
              onDeleted={(id) => setThemes((prev) => prev.filter((t) => t.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
