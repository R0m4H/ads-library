"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { ThemeRule } from "@/lib/types";

export function ThemeTagEditor({
  adId,
  tags,
  onChange,
}: {
  adId: string;
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
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
    await fetch(`/api/ads/${adId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme_tags: next }),
    });
    setSaving(false);
  }

  function remove(tag: string) {
    save(tags.filter((t) => t !== tag));
  }

  function add(tag: string) {
    if (!tag || tags.includes(tag)) return;
    save([...tags, tag]);
  }

  const available = themes.map((t) => t.name).filter((name) => !tags.includes(name));

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
          <select
            value=""
            onChange={(e) => add(e.target.value)}
            disabled={saving}
            className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600"
          >
            <option value="">+ Add theme…</option>
            {available.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
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
    </div>
  );
}
