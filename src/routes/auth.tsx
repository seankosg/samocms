import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HardHat } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/password-input";
import { emailFor } from "@/lib/roster";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "로그인 | HMMME CMS 시스템" },
      { name: "description", content: "현장 직원 아이디와 비밀번호로 HMMME CMS 시스템에 로그인합니다." },
      { property: "og:title", content: "HMMME CMS 시스템 로그인" },
      { property: "og:description", content: "아이디 기반 로그인으로 공정 현황을 확인하세요." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !pw) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: emailFor(id), password: pw });
      if (error) throw new Error("아이디 또는 비밀번호가 올바르지 않습니다.");
      await qc.invalidateQueries();
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error("로그인 실패", { description: err instanceof Error ? err.message : "" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-muted/40 px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground">
            <HardHat className="size-5" />
          </span>
          <div>
            <h1 className="text-base font-bold leading-tight">HMMME 통합 공정 관리</h1>
            <p className="text-[11px] text-muted-foreground">현장 직원 전용 시스템</p>
          </div>
        </div>
        <div className="space-y-3">
          <Input
            aria-label="아이디"
            placeholder="아이디 (예: hjlee)"
            value={id}
            autoComplete="username"
            onChange={(e) => setId(e.target.value)}
          />
          <PasswordInput label="비밀번호" value={pw} onChange={setPw} autoComplete="current-password" />
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "로그인 중…" : "로그인"}
          </Button>
        </div>
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-300">
          <p className="font-semibold">최초 로그인 안내</p>
          <p>초기 비밀번호는 <code className="rounded bg-amber-100 px-1 font-mono dark:bg-amber-900/60">Samo@2026!</code> 입니다.</p>
          <p>최초 로그인 후 반드시 새 비밀번호(최소 8자)로 변경해야 합니다.</p>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          계정은 관리자가 발급합니다. 아이디는 이니셜+성 형식입니다. (예: hjlee)
        </p>
      </form>
    </main>
  );
}
