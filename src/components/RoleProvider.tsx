"use client";

import { createContext, useContext } from "react";
import type { Role } from "@/lib/role";

interface CurrentUser {
  userId: string;
  role: Role;
}

const RoleContext = createContext<CurrentUser>({ userId: "", role: "viewer" });

export function RoleProvider({ value, children }: { value: CurrentUser; children: React.ReactNode }) {
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useCurrentUser(): CurrentUser {
  return useContext(RoleContext);
}
