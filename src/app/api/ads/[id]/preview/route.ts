import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getObject, isR2Configured } from "@/lib/r2";
import type { PreviewEntry } from "@/lib/types";

// Shows one of an ad's saved pictures (?i=<position in the ad's media list>) to signed-in team members. The storage
// bucket itself is private, so this route is the only way to see the pictures.
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
  if (!entry) return NextResponse.json({ error: "No saved preview" }, { status: 404 });

  const object = await getObject(entry.key);
  if (!object) return NextResponse.json({ error: "No saved preview" }, { status: 404 });

  return new Response(object.body, {
    headers: {
      "Content-Type": object.contentType,
      // A saved picture never changes, and only signed-in people may see it, so each browser keeps its own copy.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
