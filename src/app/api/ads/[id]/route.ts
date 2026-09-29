import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canEdit, getCurrentUserRole } from "@/lib/role";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ads")
    .select("*, brand:brands(id, name, is_own, logo_url, category)")
    .eq("id", id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ad: data });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const current = await getCurrentUserRole(supabase);
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(current.role)) return NextResponse.json({ error: "Editor access required" }, { status: 403 });

  const body = await req.json();
  const allowed = { theme_tags: body.theme_tags };
  const { data, error } = await supabase.from("ads").update(allowed).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ad: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const current = await getCurrentUserRole(supabase);
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(current.role)) return NextResponse.json({ error: "Editor access required" }, { status: 403 });

  const { error } = await supabase.from("ads").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
