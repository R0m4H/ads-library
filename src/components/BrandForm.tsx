"use client";

import { useState } from "react";
import type { Brand } from "@/lib/types";
import { LogoUploader } from "./LogoUploader";

export function BrandForm({ onCreated }: { onCreated: (brand: Brand) => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    is_own: false,
    category: "",
    logo_url: "",
    meta_page_id: "",
    google_advertiser_id: "",
    google_domain: "",
    linkedin_company_url: "",
  });

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(json.error));
      onCreated(json.brand);
      setForm({
        name: "",
        is_own: false,
        category: "",
        logo_url: "",
        meta_page_id: "",
        google_advertiser_id: "",
        google_domain: "",
        linkedin_company_url: "",
      });
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create brand");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-bog px-3 py-2 text-sm font-medium text-white hover:bg-bog-dark"
      >
        + Add brand
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">New brand</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-neutral-400 hover:text-neutral-700">
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Name *</label>
          <input
            required
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Category</label>
          <input
            value={form.category}
            onChange={(e) => update("category", e.target.value)}
            placeholder="e.g. Skincare, SaaS…"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-neutral-600">Logo</label>
          <LogoUploader value={form.logo_url} onChange={(url) => update("logo_url", url)} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input
          type="checkbox"
          checked={form.is_own}
          onChange={(e) => update("is_own", e.target.checked)}
          className="h-4 w-4 rounded border-neutral-300"
        />
        This is my own brand (not a competitor)
      </label>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Meta Page ID</label>
          <input
            value={form.meta_page_id}
            onChange={(e) => update("meta_page_id", e.target.value)}
            placeholder="Facebook Page numeric ID"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Google advertiser ID</label>
          <input
            value={form.google_advertiser_id}
            onChange={(e) => update("google_advertiser_id", e.target.value)}
            placeholder="AR08888592736429539329"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-[11px] text-neutral-400">
            Required for Google sync — the &quot;AR...&quot; ID from an adstransparency.google.com/advertiser/AR... URL.
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Google domain (reference only)</label>
          <input
            value={form.google_domain}
            onChange={(e) => update("google_domain", e.target.value)}
            placeholder="brand.com"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-[11px] text-neutral-400">Not used for syncing — the current Google scraper needs the advertiser ID above.</p>
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-neutral-600">LinkedIn company name or Ad Library URL</label>
          <input
            value={form.linkedin_company_url}
            onChange={(e) => update("linkedin_company_url", e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-bog px-4 py-2 text-sm font-medium text-white hover:bg-bog-dark disabled:opacity-50"
      >
        {saving ? "Saving…" : "Create brand"}
      </button>
    </form>
  );
}
