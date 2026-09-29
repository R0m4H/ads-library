import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole, isOwner } from "@/lib/role";

export async function GET() {
  const supabase = await createClient();
  const current = await getCurrentUserRole(supabase);
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOwner(current.role)) return NextResponse.json({ error: "Owner access required" }, { status: 403 });

  const { data, error } = await supabase.from("profiles").select("id, email, display_name, role").order("email");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ members: data });
}
