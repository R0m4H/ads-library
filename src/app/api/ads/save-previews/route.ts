import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canEdit, getCurrentUserRole } from "@/lib/role";
import { isR2Configured } from "@/lib/r2";
import { saveAd, scanCandidates } from "@/lib/previews";

// Copies ad pictures and videos into our own storage while Meta's temporary links still work. One batch of ads
// per call; the caller passes back `cursor` and keeps going until `done`, so no single call nears the time limit.
export const maxDuration = 60;

const BATCH_ADS = 12;

async function requireEditor() {
  const supabase = await createClient();
  const current = await getCurrentUserRole(supabase);
  if (!current) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  if (!canEdit(current.role)) return { error: NextResponse.json({ error: "Editor access required" }, { status: 403 }) } as const;
  return { supabase } as const;
}

/** How many recently synced ads still have pictures or videos waiting to be saved. */
export async function GET() {
  const auth = await requireEditor();
  if ("error" in auth) return auth.error;
  if (!isR2Configured()) return NextResponse.json({ configured: false, pending: 0 });

  const scan = await scanCandidates(auth.supabase, null, Number.POSITIVE_INFINITY);
  if (scan.error) {
    const hint = /previews/.test(scan.error) ? " (has migration 0015 been run in Supabase?)" : "";
    return NextResponse.json({ error: `${scan.error}${hint}` }, { status: 500 });
  }
  return NextResponse.json({ configured: true, pending: scan.picked.length });
}

export async function POST(req: Request) {
  const auth = await requireEditor();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;
  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "Preview storage isn't set up yet. The Cloudflare R2 settings are missing on the server.", notConfigured: true },
      { status: 503 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { cursor?: string | null };
  const cursorIn = typeof body.cursor === "string" && body.cursor ? body.cursor : null;

  const scan = await scanCandidates(supabase, cursorIn, BATCH_ADS);
  if (scan.error) {
    const hint = /previews/.test(scan.error) ? " (has migration 0015 been run in Supabase?)" : "";
    return NextResponse.json({ error: `${scan.error}${hint}` }, { status: 500 });
  }

  // Ads are saved side by side; within one ad the files go one after another. A failure never stops the others.
  const results = await Promise.all(scan.picked.map((ad) => saveAd(supabase, ad)));
  const failures = results.flatMap((r) => r.failures);
  return NextResponse.json({
    saved: results.reduce((n, r) => n + r.images, 0),
    videos: results.reduce((n, r) => n + r.videos, 0),
    failed: failures.length,
    firstError: failures[0] ?? null,
    cursor: scan.cursor,
    done: scan.reachedEnd,
  });
}
