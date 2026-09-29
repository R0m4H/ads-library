import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/role";
import { Nav } from "@/components/Nav";
import { RoleProvider } from "@/components/RoleProvider";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const current = await getCurrentUserRole(supabase);

  return (
    <RoleProvider value={{ userId: current?.userId ?? "", role: current?.role ?? "viewer" }}>
      <div className="flex min-h-screen flex-col">
        <Nav email={user?.email ?? null} />
        <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">{children}</main>
      </div>
    </RoleProvider>
  );
}
