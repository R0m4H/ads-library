"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import clsx from "clsx";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/ads", label: "Ad Library" },
  { href: "/brands", label: "Brands" },
  { href: "/themes", label: "Themes" },
];

export function Nav({ email }: { email: string | null }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-8">
          <span className="text-lg font-semibold tracking-tight">Ad Intel</span>
          <nav className="flex gap-1">
            {LINKS.map((link) => (
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
