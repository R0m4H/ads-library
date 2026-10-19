"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { MAX_SYNC_ADS, type SyncPreset } from "@/lib/types";

export function SyncPresetsEditor({
  presets,
  onChange,
}: {
  presets: SyncPreset[];
  onChange: (presets: SyncPreset[]) => void;
}) {
  const [newLabel, setNewLabel] = useState("");
  const [newValue, setNewValue] = useState("100");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function addPreset(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(newValue);
    if (!newLabel.trim() || !value || value < 1) {
      setError("Need a label and a value of at least 1");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/sync-presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newLabel.trim(), value, sort_order: presets.length }),
    });
    const json = await res.json();
    if (res.ok) {
      onChange([...presets, json.preset]);
      setNewLabel("");
      setNewValue("100");
    } else {
      setError(JSON.stringify(json.error));
    }
    setSaving(false);
  }

  async function updatePreset(id: string, patch: { label?: string; value?: number }) {
    const res = await fetch(`/api/sync-presets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const json = await res.json();
    if (res.ok) onChange(presets.map((p) => (p.id === id ? json.preset : p)));
  }

  async function removePreset(id: string) {
    const res = await fetch(`/api/sync-presets/${id}`, { method: "DELETE" });
    if (res.ok) onChange(presets.filter((p) => p.id !== id));
  }

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <p className="text-xs text-neutral-500">
        These preset buttons appear next to every Sync button. Editing them here applies everywhere for the team.
      </p>
      <div className="space-y-2">
        {presets.map((p) => (
          <div key={p.id} className="flex items-center gap-2">
            <input
              defaultValue={p.label}
              onBlur={(e) => e.target.value.trim() && e.target.value !== p.label && updatePreset(p.id, { label: e.target.value.trim() })}
              className="w-28 rounded-md border border-neutral-300 px-2 py-1 text-xs"
            />
            <input
              type="number"
              min={1}
              max={MAX_SYNC_ADS}
              defaultValue={p.value}
              onBlur={(e) => {
                const value = Number(e.target.value);
                if (value >= 1 && value !== p.value) updatePreset(p.id, { value });
              }}
              className="w-20 rounded-md border border-neutral-300 px-2 py-1 text-xs"
            />
            <button onClick={() => removePreset(p.id)} className="text-red-500 hover:text-red-700">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <form onSubmit={addPreset} className="flex items-center gap-2">
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Label, e.g. Weekly"
          className="w-28 rounded-md border border-neutral-300 px-2 py-1 text-xs"
        />
        <input
          type="number"
          min={1}
          max={MAX_SYNC_ADS}
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          className="w-20 rounded-md border border-neutral-300 px-2 py-1 text-xs"
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-bog px-2.5 py-1 text-xs font-medium text-white hover:bg-bog-dark disabled:opacity-50"
        >
          Add
        </button>
      </form>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
