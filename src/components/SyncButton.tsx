"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import clsx from "clsx";
import { describeSaveResult, savePreviews } from "@/lib/savePreviewsClient";
import { DEFAULT_SYNC_ADS, MAX_SYNC_ADS, type Platform, type ScrapeRun, type SyncPreset } from "@/lib/types";

export function SyncButton({
  brandId,
  platform,
  presets,
  onDone,
}: {
  brandId: string;
  platform: Platform;
  presets: SyncPreset[];
  onDone?: (run: ScrapeRun) => void;
}) {
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [limit, setLimit] = useState(DEFAULT_SYNC_ADS);
  const [runId, setRunId] = useState<string | null>(null);

  async function saveFreshPreviews(found: number) {
    setMessage(`Found ${found} ads — saving previews…`);
    const result = await savePreviews(({ saved }) => setMessage(`Found ${found} ads — saving previews… ${saved} saved`));
    setMessage(`Found ${found} ads. ${describeSaveResult(result)}`);
  }

  // Returns true if the run reached a terminal state and the UI was updated.
  function applyTerminal(run: ScrapeRun): boolean {
    if (run.status === "succeeded") {
      setStatus("idle");
      setMessage(`Found ${run.ads_found ?? 0} ads`);
      onDone?.(run);
      // Right away, while Meta's picture links are fresh, copy the pictures into our own storage.
      void saveFreshPreviews(run.ads_found ?? 0);
      return true;
    }
    if (run.status === "failed") {
      setStatus("error");
      setMessage(run.error ?? "Sync failed");
      return true;
    }
    return false;
  }

  async function sync() {
    setStatus("running");
    setMessage(null);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: brandId, platform, limit }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.toString() ?? "Failed to start sync");

      const id = json.run_id as string;
      setRunId(id);
      await poll(id);
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Sync failed");
    }
  }

  async function poll(id: string) {
    // Apify runs can take several minutes on large batches; 200 * 3s = 10 min.
    // If it's still running after that, we stop polling from this tab, but the
    // brand page resumes polling any "running" run on load, so it isn't lost.
    for (let i = 0; i < 200; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const res = await fetch(`/api/sync/${id}`);
      const json = await res.json();
      const run: ScrapeRun | undefined = json.run;
      if (!run) continue;
      if (applyTerminal(run)) {
        setRunId(null);
        return;
      }
    }
    setStatus("idle");
    setMessage("Still running in the background — reload this page in a bit to check.");
  }

  async function stop() {
    if (!runId) return;
    setMessage("Stopping…");
    const res = await fetch(`/api/sync/${runId}`, { method: "DELETE" });
    const json = await res.json();
    if (json.run) applyTerminal(json.run);
    setRunId(null);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.length > 0 && (
        <div className="flex gap-1">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={status === "running"}
              onClick={() => setLimit(p.value)}
              title={`${p.label} — ${p.value} ads`}
              className={clsx(
                "rounded-full px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50",
                limit === p.value ? "bg-bog text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      <label className="flex items-center gap-1 text-xs text-neutral-500" title="Max ads to fetch for this sync">
        Max
        <input
          type="number"
          min={1}
          max={MAX_SYNC_ADS}
          value={limit}
          disabled={status === "running"}
          onChange={(e) => setLimit(Math.max(1, Math.min(MAX_SYNC_ADS, Number(e.target.value) || 1)))}
          className="w-20 rounded-md border border-neutral-300 px-1.5 py-1 text-xs disabled:bg-neutral-50"
        />
      </label>
      <button
        onClick={sync}
        disabled={status === "running"}
        className={clsx(
          "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
          status === "running"
            ? "border-neutral-200 bg-neutral-50 text-neutral-400"
            : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
        )}
      >
        <RefreshCw className={clsx("h-3.5 w-3.5", status === "running" && "animate-spin")} />
        {status === "running" ? "Syncing…" : "Sync"}
      </button>
      {status === "running" && runId && (
        <button
          onClick={stop}
          className="rounded-md border border-red-300 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
        >
          Stop
        </button>
      )}
      {limit > DEFAULT_SYNC_ADS && status !== "running" && (
        <span className="text-xs text-amber-700">Over {DEFAULT_SYNC_ADS.toLocaleString()} ads: costs more and takes longer.</span>
      )}
      {message && <span className={clsx("text-xs", status === "error" ? "text-red-600" : "text-neutral-500")}>{message}</span>}
    </div>
  );
}
