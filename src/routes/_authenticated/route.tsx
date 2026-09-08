import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ChangePassword } from "@/components/change-password";
import { useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Gate,
});

function Gate() {
  const { profile, isLoading } = useAuth();

  if (isLoading) {
    return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">불러오는 중…</div>;
  }

  if (profile?.must_change_password) {
    return (
      <main className="grid min-h-screen place-items-center bg-muted/40 px-4">
        <ChangePassword forced />
      </main>
    );
  }

  return <Outlet />;
}
