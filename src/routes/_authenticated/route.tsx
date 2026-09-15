import { createFileRoute, Navigate, Outlet, redirect, useRouterState } from "@tanstack/react-router";
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

/** 발주처 권한 사용자가 열람할 수 있는 경로 */
const OWNER_PATHS = ["/owner", "/upload"];

function Gate() {
  const { profile, isLoading, isOwner } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });


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

  if (isOwner && !OWNER_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return <Navigate to="/owner" replace />;
  }

  return <Outlet />;
}
