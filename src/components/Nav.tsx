"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { canEdit, isOwner } from "@/lib/role";
import { useCurrentUser } from "./RoleProvider";
import clsx from "clsx";

const LINKS = [
  { href: "/", label: "Dashboard", minRole: "editor" as const },
  { href: "/ads", label: "Ad Library", minRole: null },
  { href: "/brands", label: "Brands", minRole: "editor" as const },
  { href: "/themes", label: "Themes", minRole: "editor" as const },
  { href: "/analysis", label: "Analysis", minRole: null },
  { href: "/team", label: "Team", minRole: "owner" as const },
];

export function Nav({ email }: { email: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const { role } = useCurrentUser();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const links = LINKS.filter((link) => {
    if (link.minRole === "owner") return isOwner(role);
    if (link.minRole === "editor") return canEdit(role);
    return true;
  });

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-8">
          <span className="text-lg font-semibold tracking-tight">Ad Intel</span>
          <nav className="flex gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  pathname === link.href
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-600 hover:bg-neutral-100"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-neutral-500">
          {email && <span>{email}</span>}
          <button onClick={signOut} className="rounded-md px-3 py-1.5 font-medium text-neutral-600 hover:bg-neutral-100">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
