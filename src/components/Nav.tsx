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
    <header className="bg-gradient-to-r from-navy to-navy-light">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-8">
          <span className="text-lg font-semibold tracking-tight text-white">
            Competitors <span className="text-bog-light">Analysis</span>
          </span>
          <nav className="flex gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  pathname === link.href
                    ? "bg-bog text-white"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-white/70">
          {email && <span>{email}</span>}
          <button onClick={signOut} className="rounded-md px-3 py-1.5 font-medium text-white/70 hover:bg-white/10 hover:text-white">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
