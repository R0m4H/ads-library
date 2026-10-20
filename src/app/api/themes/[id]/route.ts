import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { canEdit, getCurrentUserRole } from "@/lib/role";
import { findNameClash } from "@/lib/themeClash";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  keywords: z.array(z.string().min(1)).min(1).optional(),
  priority: z.number().int().optional(),
  excludes: z.array(z.string()).optional(),
  brand_ids: z.array(z.string().uuid()).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const current = await getCurrentUserRole(supabase);
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(current.role)) return NextResponse.json({ error: "Editor access required" }, { status: 403 });

  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Renaming or changing the pages could make two themes with one name apply to the same page: check the result.
  if (parsed.data.name !== undefined || parsed.data.brand_ids !== undefined) {
    const { data: existing, error: existingError } = await supabase.from("theme_rules").select("name, brand_ids").eq("id", id).single();
    if (existingError || !existing) return NextResponse.json({ error: "Theme not found" }, { status: 404 });
    const name = parsed.data.name ?? existing.name;
    const brandIds: string[] = [...new Set<string>(parsed.data.brand_ids ?? (existing.brand_ids as string[] | null) ?? [])];
    const clash = await findNameClash(supabase, name, brandIds, id);
    if (clash) return NextResponse.json({ error: clash }, { status: 409 });
    if (parsed.data.brand_ids !== undefined) parsed.data.brand_ids = brandIds;
  }

  const { data, error } = await supabase.from("theme_rules").update(parsed.data).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ theme: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const current = await getCurrentUserRole(supabase);
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(current.role)) return NextResponse.json({ error: "Editor access required" }, { status: 403 });

  const { error } = await supabase.from("theme_rules").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
