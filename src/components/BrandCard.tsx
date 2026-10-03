"use client";

import Link from "next/link";
import type { Brand, Platform } from "@/lib/types";
import { PlatformBadge } from "./PlatformBadge";

const PLATFORM_KEYS: { platform: Platform; check: (b: Brand) => boolean }[] = [
  { platform: "meta", check: (b) => !!b.meta_page_id || !!b.meta_page_url },
  { platform: "google", check: (b) => !!b.google_advertiser_id },
  { platform: "linkedin", check: (b) => !!b.linkedin_company_url },
];

export function BrandCard({ brand, onDelete }: { brand: Brand; onDelete: (id: string) => void }) {
  const platforms = PLATFORM_KEYS.filter((p) => p.check(brand));

  async function remove() {
    if (!confirm(`Remove ${brand.name} and all its tracked ads?`)) return;
    const res = await fetch(`/api/brands/${brand.id}`, { method: "DELETE" });
    if (res.ok) onDelete(brand.id);
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-center gap-3 sm:flex-1">
          {brand.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logo_url} alt="" className="h-9 w-9 flex-shrink-0 rounded-full object-cover" />
          ) : (
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-neutral-200 text-sm font-medium text-neutral-500">
              {brand.name.slice(0, 1)}
            </span>
          )}
          <div className="min-w-0">
            {/* Badge sits inline after the last word of the name, so a long
                (wrapping) name never pushes it into the actions column. */}
            <h3 className="break-words font-semibold leading-snug text-neutral-900">
              <Link href={`/brands/${brand.id}`} className="hover:underline">
                {brand.name}
              </Link>
              {brand.is_own && (
                <span className="ml-2 inline-block rounded bg-bog px-1.5 py-0.5 align-middle text-[10px] font-semibold leading-none text-white">
                  YOU
                </span>
              )}
            </h3>
            {brand.category && <p className="mt-0.5 text-xs text-neutral-500">{brand.category}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 whitespace-nowrap pl-12 sm:pl-0 sm:pt-0.5">
          <Link href={`/ads?brand_id=${brand.id}`} className="text-xs font-medium text-neutral-600 underline underline-offset-2">
            View ads
          </Link>
          <button onClick={remove} className="text-xs text-red-500 hover:text-red-700">
            Remove
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        {platforms.length === 0 ? (
          <p className="text-xs text-neutral-400">No platform identifiers set yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {platforms.map(({ platform }) => (
              <PlatformBadge key={platform} platform={platform} />
            ))}
          </div>
        )}
        <Link
          href={`/brands/${brand.id}`}
          className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Manage & Sync →
        </Link>
      </div>
    </div>
  );
}
