"use client";

import { useEffect, useState } from "react";
import type { Brand } from "@/lib/types";
import { BrandForm } from "@/components/BrandForm";
import { BrandCard } from "@/components/BrandCard";
import { RoleGate } from "@/components/RoleGate";
import { SavePreviewsButton } from "@/components/SavePreviewsButton";

export default function BrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/brands")
      .then((r) => r.json())
      .then((json) => setBrands(json.brands ?? []))
      .finally(() => setLoading(false));
  }, []);

  const own = brands.filter((b) => b.is_own);
  const competitors = brands.filter((b) => !b.is_own);

  return (
    <RoleGate minRole="editor">
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">Brands</h1>
            <p className="text-sm text-neutral-500">Add your own brand and every competitor you want to track.</p>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <SavePreviewsButton />
            <BrandForm onCreated={(b) => setBrands((prev) => [...prev, b])} />
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : (
          <>
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Your brands</h2>
              {own.length === 0 && <p className="text-sm text-neutral-400">No own brands added yet.</p>}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {own.map((b) => (
                  <BrandCard key={b.id} brand={b} onDelete={(id) => setBrands((prev) => prev.filter((x) => x.id !== id))} />
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Competitors</h2>
              {competitors.length === 0 && <p className="text-sm text-neutral-400">No competitors added yet.</p>}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {competitors.map((b) => (
                  <BrandCard key={b.id} brand={b} onDelete={(id) => setBrands((prev) => prev.filter((x) => x.id !== id))} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </RoleGate>
  );
}
