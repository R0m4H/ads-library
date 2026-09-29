import type { createClient } from "@/lib/supabase/server";

export type Role = "viewer" | "editor" | "owner";

export function canEdit(role: Role | null | undefined): boolean {
  return role === "editor" || role === "owner";
}

export function isOwner(role: Role | null | undefined): boolean {
  return role === "owner";
}

export async function getCurrentUserRole(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ userId: string; role: Role } | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return { userId: user.id, role: (profile?.role as Role | undefined) ?? "viewer" };
}
