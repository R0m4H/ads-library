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
    try {
      await supabase.auth.signOut();
    } catch {
      // A thrown network error here would otherwise leave the button
      // silently doing nothing — still navigate to /login regardless,
      // since the local session is cleared before the network revoke call.
    }
    router.push("/login");
    router.refresh();
  }

  const links = LINKS.filter((link) => {
    if (link.minRole === "owner") return isOwner(role);
    if (link.minRole === "editor") return canEdit(role);
    return true;
  });

  return (
    <header className="bg-gradient-to-r from-navy to-navy-light print:hidden">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-8 gap-y-2">
          <span className="whitespace-nowrap text-lg font-semibold tracking-tight text-white">
            Competitors <span className="text-bog-light">Analysis</span>
          </span>
          <nav className="flex flex-wrap gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
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
        <div className="flex min-w-0 items-center gap-3 text-sm text-white/70">
          {email && <span data-testid="nav-email" className="hidden min-w-0 max-w-[16rem] truncate md:inline">{email}</span>}
          <button onClick={signOut} className="whitespace-nowrap rounded-md px-3 py-1.5 font-medium text-white/70 hover:bg-white/10 hover:text-white">
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
