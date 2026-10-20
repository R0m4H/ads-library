"use client";

import { useEffect, useState } from "react";
import { describeSaveResult, getPendingPreviews, savePreviews } from "@/lib/savePreviewsClient";

/**
 * Copies the pictures of every ad whose Meta link still works into our own storage, so previews stay after
 * Meta's links expire. This also runs by itself after each sync; the button is for catching up by hand.
 */
export function SavePreviewsButton() {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // What is waiting to be saved, so a notice shows without pressing anything.
  const [waiting, setWaiting] = useState<string | null>(null);

  useEffect(() => {
    getPendingPreviews().then((status) => {
      if (!status) return;
      if (!status.configured) setWaiting("Preview storage isn't set up yet.");
      else if (status.pending > 0) {
        setWaiting(`${status.pending} ad${status.pending === 1 ? " has" : "s have"} a preview waiting to be saved. Meta's links run out within days.`);
      }
    });
  }, []);

  async function run() {
    setRunning(true);
    setMessage("Saving previews…");
    const result = await savePreviews(({ ads, saved }) => setMessage(`Saving previews… ${ads} ads done (${saved} pictures)`));
    setMessage(describeSaveResult(result));
    setWaiting(null);
    setRunning(false);
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <button
        onClick={run}
        disabled={running}
        title="Copies the pictures of ads whose Meta link still works into our own storage, so their previews don't expire."
        className="whitespace-nowrap rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
      >
        {running ? "Saving…" : "Save previews"}
      </button>
      {(message ?? waiting) && (
        <p className={`max-w-[260px] break-words text-xs sm:text-right ${message ? "text-neutral-500" : "text-amber-700"}`}>{message ?? waiting}</p>
      )}
    </div>
  );
}
