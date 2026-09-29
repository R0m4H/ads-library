import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole, isOwner } from "@/lib/role";

const bodySchema = z.object({
  role: z.enum(["viewer", "editor", "owner"]),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const supabase = await createClient();
  const current = await getCurrentUserRole(supabase);
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOwner(current.role)) return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  if (userId === current.userId) return NextResponse.json({ error: "You can't change your own role" }, { status: 400 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data, error } = await supabase
    .from("profiles")
    .update({ role: parsed.data.role })
    .eq("id", userId)
    .select("id, email, display_name, role")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ member: data });
}
