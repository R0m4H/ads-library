"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import clsx from "clsx";
import type { Platform, ScrapeRun } from "@/lib/types";

export function SyncButton({
  brandId,
  platform,
  onDone,
}: {
  brandId: string;
  platform: Platform;
  onDone?: (run: ScrapeRun) => void;
}) {
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [limit, setLimit] = useState(200);

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

      const runId = json.run_id as string;
      await poll(runId);
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Sync failed");
    }
  }

  async function poll(runId: string) {
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const res = await fetch(`/api/sync/${runId}`);
      const json = await res.json();
      const run: ScrapeRun | undefined = json.run;
      if (!run) continue;

      if (run.status === "succeeded") {
        setStatus("idle");
        setMessage(`Found ${run.ads_found ?? 0} ads`);
        onDone?.(run);
        return;
      }
      if (run.status === "failed") {
        setStatus("error");
        setMessage(run.error ?? "Sync failed");
        return;
      }
    }
    setStatus("error");
    setMessage("Sync is taking longer than expected — check back shortly");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1 text-xs text-neutral-500" title="Max ads to fetch for this sync">
        Max
        <input
          type="number"
          min={1}
          max={2000}
          value={limit}
          disabled={status === "running"}
          onChange={(e) => setLimit(Math.max(1, Math.min(2000, Number(e.target.value) || 1)))}
          className="w-16 rounded-md border border-neutral-300 px-1.5 py-1 text-xs disabled:bg-neutral-50"
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
      {message && <span className={clsx("text-xs", status === "error" ? "text-red-600" : "text-neutral-500")}>{message}</span>}
    </div>
  );
}
