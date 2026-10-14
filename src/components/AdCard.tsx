"use client";

import { useState } from "react";
import Link from "next/link";
import { PlayCircle, Trash2 } from "lucide-react";
import type { AdWithBrand, ThemeRule } from "@/lib/types";
import { daysSince, formatDate, truncate } from "@/lib/format";
import { canEdit } from "@/lib/role";
import { useCurrentUser } from "./RoleProvider";
import { PlatformBadge } from "./PlatformBadge";
import { SingleSelect } from "./MultiSelect";
import { PreviewImage } from "./MediaPreview";

export function AdCard({
  ad,
  onDelete,
  themes = [],
  onTagsChange,
}: {
  ad: AdWithBrand;
  onDelete?: (id: string) => void;
  /** All themes, for the editor-only "+ Add theme…" menu. */
  themes?: ThemeRule[];
  /** Called with the ad's new theme list after an editor adds a theme here. */
  onTagsChange?: (id: string, tags: string[]) => void;
}) {
  const { role } = useCurrentUser();
  const media = ad.media[0];
  const days = daysSince(ad.first_seen_at);
  const [addingTheme, setAddingTheme] = useState(false);

  // Editors and owners can add a theme straight from the card. Saving it by hand also marks the ad,
  // so "Re-tag all ads" keeps it (the server does that).
  async function addTheme(name: string) {
    if (!name || ad.theme_tags.includes(name)) return;
    setAddingTheme(true);
    try {
      const res = await fetch(`/api/ads/${ad.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme_tags: [...ad.theme_tags, name] }),
      });
      const json = await res.json();
      if (res.ok && json.ad) onTagsChange?.(ad.id, json.ad.theme_tags ?? [...ad.theme_tags, name]);
    } finally {
      setAddingTheme(false);
    }
  }
  const availableThemes = themes.filter((t) => !ad.theme_tags.includes(t.name));

  async function remove(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this ad? This can't be undone (it'll come back if a future sync finds it again).")) return;
    const res = await fetch(`/api/ads/${ad.id}`, { method: "DELETE" });
    if (res.ok) onDelete?.(ad.id);
  }

  return (
    <Link
      href={`/ads/${ad.id}`}
      className="group relative flex flex-col rounded-xl border border-neutral-200 bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      {canEdit(role) && (
        <button
          onClick={remove}
          title="Delete this ad"
          className="absolute right-2 top-2 z-10 rounded-full bg-black/50 p-1.5 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}

      <div className="relative aspect-square w-full overflow-hidden rounded-t-[11px] bg-neutral-100">
        {media ? (
          media.type === "video" ? (
            <div className="flex h-full w-full items-center justify-center bg-neutral-900">
              {media.thumbnail_url ? (
                <PreviewImage src={media.thumbnail_url} alt="" className="h-full w-full object-cover opacity-80" />
              ) : null}
              <PlayCircle className="absolute h-10 w-10 text-white drop-shadow" />
            </div>
          ) : (
            <PreviewImage src={media.url} alt={ad.headline ?? "Ad creative"} className="h-full w-full object-cover" />
          )
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-neutral-400">No media</div>
        )}
        <div className="absolute left-2 top-2 flex gap-1.5">
          <PlatformBadge platform={ad.platform} />
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
              ad.is_active ? "bg-green-50 text-green-700 ring-green-200" : "bg-neutral-100 text-neutral-500 ring-neutral-300"
            }`}
          >
            {ad.is_active ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-neutral-800">
          {ad.brand.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ad.brand.logo_url} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[10px]">
              {ad.brand.name.slice(0, 1)}
            </span>
          )}
          <span className="min-w-0 truncate">{ad.brand.name}</span>
          {ad.brand.is_own && (
            <span className="shrink-0 rounded bg-bog px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">YOU</span>
          )}
        </div>

        {ad.headline && <h3 className="line-clamp-2 break-words text-sm font-semibold text-neutral-900">{ad.headline}</h3>}
        {ad.body && <p className="line-clamp-2 break-words text-sm text-neutral-600">{truncate(ad.body, 140)}</p>}

        {ad.cta && (
          <span className="w-fit rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700">
            {ad.cta}
          </span>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-1 pt-2">
          {ad.theme_tags.slice(0, 2).map((tag) => (
            <span key={tag} className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
              {tag}
            </span>
          ))}
          {ad.theme_tags.length > 2 && (
            <span
              title={ad.theme_tags.slice(2).join(", ")}
              className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700"
            >
              +{ad.theme_tags.length - 2}
            </span>
          )}
          {canEdit(role) && availableThemes.length > 0 && (
            // The whole card is a link: swallow clicks here so choosing a theme doesn't open the ad.
            <div
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <SingleSelect
                compact
                placeholder="+ Add theme…"
                panelWidth={224}
                disabled={addingTheme}
                options={availableThemes.map((t) => ({ value: t.name, label: t.name }))}
                value=""
                onChange={addTheme}
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-neutral-100 pt-2 text-xs text-neutral-400">
          <span>Since {formatDate(ad.first_seen_at)}</span>
          {days !== null && <span>{days === 0 ? "New today" : `${days}d running`}</span>}
        </div>
      </div>
    </Link>
  );
}
