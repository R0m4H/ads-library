import Link from "next/link";
import { PlayCircle, Trash2 } from "lucide-react";
import type { AdWithBrand } from "@/lib/types";
import { daysSince, formatDate, truncate } from "@/lib/format";
import { canEdit } from "@/lib/role";
import { useCurrentUser } from "./RoleProvider";
import { PlatformBadge } from "./PlatformBadge";

export function AdCard({ ad, onDelete }: { ad: AdWithBrand; onDelete?: (id: string) => void }) {
  const { role } = useCurrentUser();
  const media = ad.media[0];
  const days = daysSince(ad.first_seen_at);

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
      className="group relative flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition-shadow hover:shadow-md"
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

      <div className="relative aspect-[4/3] w-full overflow-hidden bg-neutral-100">
        {media ? (
          media.type === "video" ? (
            <div className="flex h-full w-full items-center justify-center bg-neutral-900">
              {media.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={media.thumbnail_url} alt="" className="h-full w-full object-cover opacity-80" />
              ) : null}
              <PlayCircle className="absolute h-10 w-10 text-white drop-shadow" />
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={media.url} alt={ad.headline ?? "Ad creative"} className="h-full w-full object-cover" />
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
        <div className="flex items-center gap-2 text-sm font-medium text-neutral-800">
          {ad.brand.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ad.brand.logo_url} alt="" className="h-5 w-5 rounded-full object-cover" />
          ) : (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-200 text-[10px]">
              {ad.brand.name.slice(0, 1)}
            </span>
          )}
          <span className="truncate">{ad.brand.name}</span>
          {ad.brand.is_own && (
            <span className="rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">YOU</span>
          )}
        </div>

        {ad.headline && <h3 className="line-clamp-2 text-sm font-semibold text-neutral-900">{ad.headline}</h3>}
        {ad.body && <p className="line-clamp-2 text-sm text-neutral-600">{truncate(ad.body, 140)}</p>}

        {ad.cta && (
          <span className="w-fit rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700">
            {ad.cta}
          </span>
        )}

        <div className="mt-auto flex flex-wrap gap-1 pt-2">
          {ad.theme_tags.slice(0, 2).map((tag) => (
            <span key={tag} className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
              {tag}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-neutral-100 pt-2 text-xs text-neutral-400">
          <span>Since {formatDate(ad.first_seen_at)}</span>
          {days !== null && <span>{days === 0 ? "New today" : `${days}d running`}</span>}
        </div>
      </div>
    </Link>
  );
}
