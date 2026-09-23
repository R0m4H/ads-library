import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const brandSchema = z.object({
  name: z.string().min(1),
  is_own: z.boolean().default(false),
  category: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  logo_url: z.string().url().optional().or(z.literal("")).nullable(),
  meta_page_id: z.string().optional().nullable(),
  meta_page_url: z.string().optional().nullable(),
  google_advertiser_id: z.string().optional().nullable(),
  google_domain: z.string().optional().nullable(),
  linkedin_company_url: z.string().optional().nullable(),
});

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("brands").select("*").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ brands: data });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = brandSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("brands")
    .insert({ ...parsed.data, created_by: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ brand: data }, { status: 201 });
}
