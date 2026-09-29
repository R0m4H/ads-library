import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { canEdit, getCurrentUserRole } from "@/lib/role";

const presetSchema = z.object({
  label: z.string().min(1),
  value: z.number().int().min(1).max(2000),
  sort_order: z.number().int().optional(),
});

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("sync_presets").select("*").order("sort_order").order("value");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ presets: data });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const current = await getCurrentUserRole(supabase);
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(current.role)) return NextResponse.json({ error: "Editor access required" }, { status: 403 });

  const parsed = presetSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data, error } = await supabase.from("sync_presets").insert(parsed.data).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ preset: data }, { status: 201 });
}
