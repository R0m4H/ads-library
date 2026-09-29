"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "./RoleProvider";
import { canEdit, isOwner, type Role } from "@/lib/role";

function allowed(minRole: Extract<Role, "editor" | "owner">, role: Role): boolean {
  return minRole === "owner" ? isOwner(role) : canEdit(role);
}

export function RoleGate({
  minRole,
  children,
}: {
  minRole: Extract<Role, "editor" | "owner">;
  children: React.ReactNode;
}) {
  const { role } = useCurrentUser();
  const router = useRouter();
  const ok = allowed(minRole, role);

  useEffect(() => {
    if (!ok) router.replace("/ads");
  }, [ok, router]);

  if (!ok) return null;
  return <>{children}</>;
}
