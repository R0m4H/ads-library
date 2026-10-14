"use client";

import { use, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Trash2 } from "lucide-react";
import type { AdWithBrand } from "@/lib/types";
import { PlatformBadge } from "@/components/PlatformBadge";
import { ThemeTagEditor } from "@/components/ThemeTagEditor";
import { daysSince, formatDate, youtubeEmbedUrl } from "@/lib/format";
import { canEdit } from "@/lib/role";
import { useCurrentUser } from "@/components/RoleProvider";
import { getListUrl } from "@/lib/adsListState";
import { PreviewImage, PreviewVideo } from "@/components/MediaPreview";

export default function AdDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { role } = useCurrentUser();
  const [ad, setAd] = useState<AdWithBrand | null>(null);
  const [loading, setLoading] = useState(true);
  // Back to the Ad Library as the user left it (filters, page), not a blank list. It comes from the
  // browser tab's storage, so the server render (and first paint) uses plain /ads.
  const backHref = useSyncExternalStore(
    () => () => {},
    getListUrl,
    () => "/ads"
  );

  useEffect(() => {
    fetch(`/api/ads/${id}`)
      .then((r) => r.json())
      .then((json) => setAd(json.ad ?? null))
      .finally(() => setLoading(false));
  }, [id]);

  async function remove() {
    if (!confirm("Delete this ad? This can't be undone (it'll come back if a future sync finds it again).")) return;
    const res = await fetch(`/api/ads/${id}`, { method: "DELETE" });
    if (res.ok) router.push(backHref);
  }

  if (loading) return <p className="text-sm text-neutral-400">Loading…</p>;
  if (!ad) return <p className="text-sm text-neutral-400">Ad not found.</p>;

  const days = daysSince(ad.first_seen_at);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <Link href={backHref} className="text-sm text-neutral-500 underline underline-offset-2">
          ← Back to Ad Library
        </Link>
        {canEdit(role) && (
          <button
            onClick={remove}
            className="flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete ad
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-2">
          {ad.media.length === 0 && (
            <div className="flex aspect-square items-center justify-center rounded-xl bg-neutral-100 text-sm text-neutral-400">
              No media
            </div>
          )}
          {ad.media.map((m, i) => {
            if (m.type !== "video") {
              return (
                <PreviewImage
                  key={i}
                  src={m.url}
                  alt={ad.headline ?? "Ad creative"}
                  className="w-full rounded-xl object-cover"
                  placeholderClassName="aspect-square rounded-xl"
                />
              );
            }
            const embedUrl = youtubeEmbedUrl(m.url);
            if (embedUrl) {
              return (
                <iframe
                  key={i}
                  src={embedUrl}
                  className="aspect-video w-full rounded-xl bg-black"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              );
            }
            return (
              <PreviewVideo
                key={i}
                src={m.url}
                poster={m.thumbnail_url}
                className="w-full rounded-xl bg-black"
                placeholderClassName="aspect-video rounded-xl"
              />
            );
          })}
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <PlatformBadge platform={ad.platform} />
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                ad.is_active ? "bg-green-50 text-green-700 ring-green-200" : "bg-neutral-100 text-neutral-500 ring-neutral-300"
              }`}
            >
              {ad.is_active ? "Currently active" : "No longer active"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {ad.brand.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ad.brand.logo_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-sm">
                {ad.brand.name.slice(0, 1)}
              </span>
            )}
            <div className="min-w-0">
              <p className="break-words font-semibold text-neutral-900">{ad.brand.name}</p>
              {ad.brand.category && <p className="text-xs text-neutral-500">{ad.brand.category}</p>}
            </div>
            {ad.brand.is_own && (
              <span className="shrink-0 rounded bg-bog px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">YOU</span>
            )}
          </div>

          {ad.headline && <h1 className="break-words text-lg font-semibold text-neutral-900">{ad.headline}</h1>}
          {ad.body && <p className="whitespace-pre-wrap break-words text-sm text-neutral-700">{ad.body}</p>}
          {ad.cta && (
            <span className="inline-block w-fit rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700">
              {ad.cta}
            </span>
          )}

          {ad.landing_url && (
            <a
              href={ad.landing_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-fit items-center gap-1 text-sm text-blue-600 hover:underline"
            >
              Landing page <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {ad.source_url && (
            <a
              href={ad.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-fit items-center gap-1 text-sm text-blue-600 hover:underline"
            >
              View on original ad library <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}

          <div className="grid grid-cols-2 gap-3 rounded-lg bg-neutral-50 p-4 text-sm">
            <div>
              <p className="text-xs text-neutral-400">First seen</p>
              <p className="font-medium">{formatDate(ad.first_seen_at)}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-400">Last seen</p>
              <p className="font-medium">{formatDate(ad.last_seen_at)}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-400">Days running</p>
              <p className="font-medium">{days ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-400">Format</p>
              <p className="font-medium capitalize">{ad.ad_format ?? "—"}</p>
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-neutral-500">Themes</p>
            <ThemeTagEditor
              adId={ad.id}
              tags={ad.theme_tags}
              onChange={(tags) => setAd((prev) => (prev ? { ...prev, theme_tags: tags } : prev))}
              manual={ad.tags_manual}
              onManualChange={(manual) => setAd((prev) => (prev ? { ...prev, tags_manual: manual } : prev))}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
