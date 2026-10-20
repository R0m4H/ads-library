"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { ThemeRule } from "@/lib/types";
import { canEdit } from "@/lib/role";
import { rulesForBrand, uniqueNames } from "@/lib/classify";
import { useCurrentUser } from "./RoleProvider";
import { SingleSelect } from "./MultiSelect";

export function ThemeTagEditor({
  adId,
  tags,
  onChange,
  manual = false,
  onManualChange,
  brandId,
}: {
  /** The page the ad belongs to: only the themes that apply to that page are offered. */
  brandId?: string | null;
  adId: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  /** Themes were set by hand, so "Re-tag all ads" skips this ad. Only editors are shown this. */
  manual?: boolean;
  onManualChange?: (manual: boolean) => void;
}) {
  const { role } = useCurrentUser();
  const readOnly = !canEdit(role);
  const [saving, setSaving] = useState(false);
  const [themes, setThemes] = useState<ThemeRule[]>([]);
  const [customTag, setCustomTag] = useState("");

  useEffect(() => {
    fetch("/api/themes")
      .then((r) => r.json())
      .then((json) => setThemes(json.themes ?? []));
  }, []);

  async function save(next: string[]) {
    setSaving(true);
    onChange(next);
    onManualChange?.(true); // saving themes by hand marks the ad (the server does the same)
    await fetch(`/api/ads/${adId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme_tags: next }),
    });
    setSaving(false);
  }

  // Hand the ad back to the automatic rules: the server re-tags it from the current rules right away.
  async function useAutomatic() {
    setSaving(true);
    try {
      const res = await fetch(`/api/ads/${adId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags_manual: false }),
      });
      const json = await res.json();
      if (res.ok && json.ad) {
        onChange(json.ad.theme_tags ?? []);
        onManualChange?.(false);
      }
    } finally {
      setSaving(false);
    }
  }

  function remove(tag: string) {
    save(tags.filter((t) => t !== tag));
  }

  function add(tag: string) {
    if (!tag || tags.includes(tag)) return;
    save([...tags, tag]);
  }

  const available = uniqueNames(rulesForBrand(themes, brandId)).filter((name) => !tags.includes(name));

  if (readOnly) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {tags.length === 0 ? (
          <span className="text-xs text-neutral-400">No themes</span>
        ) : (
          tags.map((tag) => (
            <span key={tag} className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">
              {tag}
            </span>
          ))
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700"
          >
            {tag}
            <button onClick={() => remove(tag)} disabled={saving}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {available.length > 0 && (
          <SingleSelect
            compact
            placeholder="+ Add theme…"
            panelWidth={224}
            disabled={saving}
            options={available.map((name) => ({ value: name, label: name }))}
            value=""
            onChange={(v) => v && add(v)}
          />
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add(customTag.trim());
            setCustomTag("");
          }}
          className="flex items-center gap-1"
        >
          <input
            value={customTag}
            onChange={(e) => setCustomTag(e.target.value)}
            placeholder="Custom tag…"
            disabled={saving}
            className="w-28 rounded-md border border-neutral-300 px-2 py-1 text-xs"
          />
        </form>
      </div>
      {manual && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700">Set by hand</span>
          <span>Re-tagging skips this ad.</span>
          <button
            type="button"
            onClick={useAutomatic}
            disabled={saving}
            className="font-medium text-neutral-600 underline underline-offset-2 hover:text-neutral-900 disabled:opacity-50"
          >
            Use automatic tags again
          </button>
        </p>
      )}
    </div>
  );
}
