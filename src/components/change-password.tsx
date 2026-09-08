import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/password-input";
import { markPasswordChanged } from "@/lib/auth.functions";

export function ChangePassword({ forced, onDone }: { forced?: boolean; onDone?: () => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  const submit = async () => {
    if (pw.length < 8) return toast.error("비밀번호는 최소 8자 이상이어야 합니다.");
    if (pw !== pw2) return toast.error("두 비밀번호가 일치하지 않습니다.");
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw new Error(error.message);
      await markPasswordChanged();
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("비밀번호가 변경되었습니다.");
      setPw("");
      setPw2("");
      onDone?.();
    } catch (e) {
      toast.error("변경 실패", { description: e instanceof Error ? e.message : "다시 시도해 주세요." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-bold">비밀번호 변경</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {forced ? "초기 비밀번호를 사용 중입니다. 새 비밀번호를 설정해야 앱을 사용할 수 있습니다." : "새 비밀번호는 최소 8자 이상이어야 합니다."}
      </p>
      <div className="mt-4 space-y-3">
        <PasswordInput label="새 비밀번호" value={pw} onChange={setPw} autoComplete="new-password" />
        <PasswordInput label="새 비밀번호 확인" value={pw2} onChange={setPw2} autoComplete="new-password" />
        <Button className="w-full" disabled={busy} onClick={submit}>
          {busy ? "변경 중…" : "변경하기"}
        </Button>
      </div>
    </div>
  );
}
