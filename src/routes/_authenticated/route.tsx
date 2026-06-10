import { createFileRoute, Outlet, redirect, Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { QrCode, Users, UserCog, Database, LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const router = useRouter();
  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Attendance Manager</h1>
        <button onClick={signOut} className="text-muted-foreground hover:text-foreground">
          <LogOut className="h-5 w-5" />
        </button>
      </header>
      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>
      <nav className="fixed bottom-0 left-0 right-0 z-50 grid grid-cols-4 border-t bg-background">
        <NavItem to="/scanner" icon={<QrCode className="h-5 w-5" />} label="Scan" />
        <NavItem to="/directory" icon={<Users className="h-5 w-5" />} label="Directory" />
        <NavItem to="/manage" icon={<UserCog className="h-5 w-5" />} label="Manage" />
        <NavItem to="/master" icon={<Database className="h-5 w-5" />} label="Master" />
      </nav>
    </div>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-1 py-3 text-xs text-muted-foreground"
      activeProps={{ className: "flex flex-col items-center gap-1 py-3 text-xs text-primary" }}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
