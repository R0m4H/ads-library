import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getObject, isR2Configured } from "@/lib/r2";
import type { PreviewEntry } from "@/lib/types";

// Plays one of an ad's saved videos (?i=<position in the ad's media list>) for signed-in team members. Browsers ask
// for videos in pieces (to start playing quickly and to let you skip around), so a Range request is passed on to
// storage and answered with 206, as video players expect.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const index = Number(new URL(req.url).searchParams.get("i") ?? "0");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isR2Configured()) return NextResponse.json({ error: "Preview storage is not set up" }, { status: 404 });

  const { data } = await supabase.from("ads").select("previews").eq("id", id).single();
  const entry = ((data?.previews as PreviewEntry[] | null) ?? []).find((e) => e.i === index);
  if (!entry?.video_key) return NextResponse.json({ error: "No saved video" }, { status: 404 });

  const range = req.headers.get("range") ?? undefined;
  const object = await getObject(entry.video_key, range);
  if (!object) return NextResponse.json({ error: "No saved video" }, { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=31536000, immutable",
  };
  if (object.contentLength !== undefined) headers["Content-Length"] = String(object.contentLength);
  if (object.contentRange) headers["Content-Range"] = object.contentRange;

  return new Response(object.body, { status: object.contentRange ? 206 : 200, headers });
}
