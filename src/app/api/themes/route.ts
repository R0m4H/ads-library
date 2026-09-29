import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { canEdit, getCurrentUserRole } from "@/lib/role";

const themeSchema = z.object({
  name: z.string().min(1),
  keywords: z.array(z.string().min(1)).min(1),
  priority: z.number().int().optional(),
  excludes: z.array(z.string()).optional(),
});

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("theme_rules").select("*").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ themes: data });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const current = await getCurrentUserRole(supabase);
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(current.role)) return NextResponse.json({ error: "Editor access required" }, { status: 403 });

  const parsed = themeSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data, error } = await supabase
    .from("theme_rules")
    .insert({ ...parsed.data, created_by: current.userId })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ theme: data }, { status: 201 });
}
