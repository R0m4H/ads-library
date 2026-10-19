"use client";

import { useEffect, useState } from "react";
import { canEdit } from "@/lib/role";
import { describeSaveResult, getPendingPreviews, savePreviews } from "@/lib/savePreviewsClient";
import { useCurrentUser } from "./RoleProvider";

const THROTTLE_KEY = "previewAutoSaveAt";
const THROTTLE_MS = 10 * 60 * 1000;

/**
 * When an editor or owner opens the app, quietly saves the pictures of any recently synced ads that still have
 * a working Meta link but no saved copy — for example because the page was closed in the middle of the save
 * that runs after a sync. It checks at most once every ten minutes per browser tab and shows a small note
 * only while there is something to do.
 */
export function PreviewAutoSaver() {
  const { role } = useCurrentUser();
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!canEdit(role)) return;
    try {
      const last = Number(window.sessionStorage.getItem(THROTTLE_KEY));
      if (last && Date.now() - last < THROTTLE_MS) return;
      window.sessionStorage.setItem(THROTTLE_KEY, String(Date.now()));
    } catch {
      /* storage blocked: just check every time */
    }

    let hide: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      const status = await getPendingPreviews();
      if (!status || !status.configured || status.pending === 0) return;
      setNote(`Saving ${status.pending} ad previews in the background…`);
      const result = await savePreviews(({ saved }) => setNote(`Saving ad previews in the background… ${saved} of ${status.pending}`));
      setNote(describeSaveResult(result));
      hide = setTimeout(() => setNote(null), 6000);
    })();
    return () => clearTimeout(hide);
  }, [role]);

  if (!note) return null;
  return (
    <div role="status" className="fixed bottom-4 right-4 z-40 max-w-xs rounded-lg bg-navy px-3 py-2 text-xs text-white shadow-lg">
      {note}
    </div>
  );
}
