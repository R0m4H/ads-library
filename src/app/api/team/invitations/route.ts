import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole, isOwner } from "@/lib/role";

// Owner-only. Row Level Security on `invitations` enforces the same thing, so a missed check here
// still cannot leak or change anything.

async function requireOwner() {
  const supabase = await createClient();
  const current = await getCurrentUserRole(supabase);
  if (!current) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  if (!isOwner(current.role)) return { error: NextResponse.json({ error: "Owner access required" }, { status: 403 }) } as const;
  return { supabase, current } as const;
}

export async function GET() {
  const auth = await requireOwner();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase.from("invitations").select("email, role, created_at").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invitations: data });
}

const bodySchema = z.object({
  email: z.string(),
  role: z.enum(["viewer", "editor", "owner"]).default("viewer"),
});

export async function POST(req: Request) {
  const auth = await requireOwner();
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Enter an email address and a role." }, { status: 400 });

  // Stored lowercase, because the sign-up check compares the address case-insensitively.
  const email = parsed.data.email.trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) {
    return NextResponse.json({ error: "That doesn't look like a valid email address." }, { status: 400 });
  }

  const { data: existing } = await auth.supabase.from("profiles").select("id").ilike("email", email).limit(1);
  if (existing && existing.length > 0) {
    return NextResponse.json({ error: "That address already has an account. Change their role in the list below instead." }, { status: 409 });
  }

  const { data, error } = await auth.supabase
    .from("invitations")
    .upsert({ email, role: parsed.data.role, invited_by: auth.current.userId }, { onConflict: "email" })
    .select("email, role, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invitation: data });
}

export async function DELETE(req: Request) {
  const auth = await requireOwner();
  if ("error" in auth) return auth.error;

  const email = new URL(req.url).searchParams.get("email")?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

  const { error } = await auth.supabase.from("invitations").delete().eq("email", email);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
