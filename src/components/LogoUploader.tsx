"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const LOGO_BUCKET = "Logos";

export function LogoUploader({
  value,
  onChange,
  brandId,
}: {
  value: string;
  onChange: (url: string) => void;
  brandId?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${brandId ?? "new"}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from(LOGO_BUCKET).upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);
      onChange(data.publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3">
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" className="h-12 w-12 flex-shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[10px] text-neutral-400">
          No logo
        </span>
      )}
      <div className="flex items-center gap-2">
        <label className="cursor-pointer rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50">
          {uploading ? "Uploading…" : value ? "Change logo" : "Upload logo"}
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={uploading} />
        </label>
        {value && !uploading && (
          <button type="button" onClick={() => onChange("")} className="text-xs text-red-500 hover:text-red-700">
            Remove
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
