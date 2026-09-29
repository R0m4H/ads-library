"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PlayCircle } from "lucide-react";
import clsx from "clsx";
import type { AdMedia, Platform, ThemeRule } from "@/lib/types";
import { ThemeRuleCard } from "@/components/ThemeRuleCard";
import { PlatformBadge } from "@/components/PlatformBadge";
import { RoleGate } from "@/components/RoleGate";

function parseKeywords(input: string): string[] {
  return input
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

interface Suggestion {
  id: string;
  platform: Platform;
  headline: string | null;
  body: string | null;
  cta: string | null;
  media: AdMedia[];
  brandName: string;
  suggestedTheme: string;
  isNewTheme: boolean;
  reason: string;
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
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [remainingUntagged, setRemainingUntagged] = useState<number | null>(null);
  const createdThemeNames = useRef<Set<string>>(new Set());

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

  async function suggestTags() {
    setSuggestLoading(true);
    setSuggestError(null);
    const res = await fetch("/api/themes/suggest", { method: "POST" });
    const json = await res.json();
    if (res.ok) {
      setSuggestions(json.suggestions ?? []);
      setRemainingUntagged(json.remainingUntagged ?? null);
    } else {
      setSuggestError(JSON.stringify(json.error));
    }
    setSuggestLoading(false);
  }

  async function acceptSuggestion(s: Suggestion) {
    const theme = s.suggestedTheme.trim();
    if (!theme) return;
    setSuggestions((prev) => prev?.filter((x) => x.id !== s.id) ?? null);

    // If this theme doesn't exist as a rule yet, create one (seeded with the
    // theme name itself as a starting keyword) so it shows up in the list
    // below to edit — add real keywords, set priority, excludes, etc.
    const key = theme.toLowerCase();
    const alreadyExists = themes.some((t) => t.name.toLowerCase() === key) || createdThemeNames.current.has(key);
    if (!alreadyExists) {
      createdThemeNames.current.add(key);
      const res = await fetch("/api/themes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: theme, keywords: [theme] }),
      });
      if (res.ok) {
        const json = await res.json();
        setThemes((prev) => [...prev, json.theme].sort((a, b) => a.name.localeCompare(b.name)));
      }
    }

    await fetch(`/api/ads/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme_tags: [theme] }),
    });
  }

  function rejectSuggestion(id: string) {
    setSuggestions((prev) => prev?.filter((x) => x.id !== id) ?? null);
  }

  function setSuggestionTheme(id: string, theme: string) {
    setSuggestions((prev) => prev?.map((s) => (s.id === id ? { ...s, suggestedTheme: theme } : s)) ?? null);
  }

  return (
    <RoleGate minRole="editor">
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

      <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">AI tag suggestions</h2>
            <p className="text-xs text-neutral-500">
              Suggests a theme for ads that didn&apos;t match any keyword rule. Nothing is applied until you accept it.
            </p>
          </div>
          <button
            onClick={suggestTags}
            disabled={suggestLoading}
            className="whitespace-nowrap rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            {suggestLoading ? "Thinking…" : "Suggest tags for untagged ads"}
          </button>
        </div>
        {suggestError && <p className="text-sm text-red-600">{suggestError}</p>}
        {suggestions && suggestions.length === 0 && !suggestLoading && (
          <p className="text-sm text-neutral-400">No untagged ads to suggest for right now.</p>
        )}
        {suggestions && suggestions.length > 0 && (
          <div className="space-y-2">
            {suggestions.map((s) => {
              const media = s.media[0];
              return (
              <div key={s.id} className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                <Link
                  href={`/ads/${s.id}`}
                  target="_blank"
                  className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-neutral-200"
                  title="Open this ad in a new tab"
                >
                  {media ? (
                    media.type === "video" ? (
                      <div className="flex h-full w-full items-center justify-center bg-neutral-900">
                        {media.thumbnail_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={media.thumbnail_url} alt="" className="h-full w-full object-cover opacity-80" />
                        ) : null}
                        <PlayCircle className="absolute h-5 w-5 text-white" />
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={media.url} alt="" className="h-full w-full object-cover" />
                    )
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-neutral-400">No media</div>
                  )}
                </Link>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <PlatformBadge platform={s.platform} />
                    <p className="text-xs font-medium text-neutral-500">{s.brandName}</p>
                  </div>
                  {s.headline && <p className="mt-1 text-sm font-medium text-neutral-900">{s.headline}</p>}
                  {s.body && <p className="mt-0.5 text-xs text-neutral-600">{s.body}</p>}
                  {s.cta && <p className="mt-0.5 text-xs italic text-neutral-400">CTA: {s.cta}</p>}
                  {!s.headline && !s.body && !s.cta && <p className="mt-1 text-sm text-neutral-400">(no ad copy)</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <input
                      value={s.suggestedTheme}
                      onChange={(e) => setSuggestionTheme(s.id, e.target.value)}
                      className="w-40 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 focus:border-violet-400 focus:outline-none"
                    />
                    {themes.some((t) => t.name.toLowerCase() === s.suggestedTheme.trim().toLowerCase()) ? (
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-neutral-500">existing</span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700">new</span>
                    )}
                    {themes.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => e.target.value && setSuggestionTheme(s.id, e.target.value)}
                        className="rounded-md border border-neutral-300 px-1.5 py-1 text-xs text-neutral-500"
                      >
                        <option value="">Swap to…</option>
                        {themes.map((t) => (
                          <option key={t.id} value={t.name}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  {s.reason && <p className="mt-1 text-xs text-neutral-400">{s.reason}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => acceptSuggestion(s)}
                    className="rounded-md bg-bog px-3 py-1.5 text-xs font-medium text-white hover:bg-bog-dark"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => rejectSuggestion(s.id)}
                    className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        )}
        {remainingUntagged !== null && remainingUntagged > 0 && (
          <p className="text-xs text-neutral-400">{remainingUntagged} more untagged ads remain — click again to process more.</p>
        )}
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
          className="rounded-md bg-bog px-4 py-2 text-sm font-medium text-white hover:bg-bog-dark disabled:opacity-50"
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
    </RoleGate>
  );
}
