import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/use-auth";

/** Admin에게만 노출하는 화면의 게이트 */
export function AdminGate({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) {
    return (
      <AppShell title={title}>
        <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
          <p className="text-lg font-semibold">관리자 전용 화면입니다</p>
          <p className="text-sm text-muted-foreground">{desc ?? "출면(Manpower) 기능은 현재 관리자(Admin)에게만 제공됩니다."}</p>
        </div>
      </AppShell>
    );
  }
  return <>{children}</>;
}
