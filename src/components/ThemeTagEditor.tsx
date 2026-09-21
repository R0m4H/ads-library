"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { THEME_OPTIONS } from "@/lib/types";

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

  const available = THEME_OPTIONS.filter((t) => !tags.includes(t));

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
      {available.length > 0 && (
        <select
          value=""
          onChange={(e) => add(e.target.value)}
          disabled={saving}
          className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600"
        >
          <option value="">+ Add theme…</option>
          {available.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
