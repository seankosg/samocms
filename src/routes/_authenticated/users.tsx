import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Plus, Save, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createUser, deleteUser, listUsers, resetPassword, updateUser } from "@/lib/auth.functions";
import { INITIAL_PASSWORD, SCOPES, SCOPE_LABEL } from "@/lib/roster";
import { ROLE_LABEL, useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({
    meta: [
      { title: "CMS 사용자 관리 | HMMME PROJECT CMS" },
      { name: "description", content: "계정 생성·권한 변경·담당 공종 배정·비밀번호 초기화를 관리합니다." },
      { property: "og:title", content: "CMS 사용자 관리" },
      { property: "og:description", content: "관리자 전용 계정 및 권한 관리 화면." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: UsersPage,
});

type Row = {
  id: string;
  username: string;
  full_name: string;
  position: string | null;
  team: string | null;
  is_active: boolean;
  must_change_password: boolean;
  role: string;
  scopes: string[];
};

function UsersPage() {
  const { isAdmin, isLoading } = useAuth();
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ["users"], queryFn: () => listUsers(), enabled: isAdmin });
  const [draft, setDraft] = useState({ username: "", full_name: "", position: "", team: "", scope: "" });

  const refresh = () => qc.invalidateQueries({ queryKey: ["users"] });
  const err = (e: Error) => toast.error("실패", { description: e.message });

  const add = useMutation({
    mutationFn: () =>
      createUser({
        data: {
          username: draft.username.trim().toLowerCase(),
          full_name: draft.full_name.trim(),
          position: draft.position.trim() || null,
          team: draft.team.trim() || null,
          role: "user" as const,
          scopes: draft.scope ? [draft.scope as (typeof SCOPES)[number]] : [],
        },
      }),
    onSuccess: () => {
      toast.success("계정이 생성되었습니다", { description: `초기 비밀번호 ${INITIAL_PASSWORD}` });
      setDraft({ username: "", full_name: "", position: "", team: "", scope: "" });
      refresh();
    },
    onError: err,
  });

  const save = useMutation({
    mutationFn: (r: Row) =>
      updateUser({
        data: {
          id: r.id,
          full_name: r.full_name,
          position: r.position,
          team: r.team,
          role: r.role as "admin" | "user" | "guest",
          scopes: r.scopes as (typeof SCOPES)[number][],
          is_active: r.is_active,
        },
      }),
    onSuccess: () => { toast.success("저장되었습니다"); refresh(); },
    onError: err,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteUser({ data: { id } }),
    onSuccess: () => { toast.success("삭제되었습니다"); refresh(); },
    onError: err,
  });

  const reset = useMutation({
    mutationFn: (id: string) => resetPassword({ data: { id } }),
    onSuccess: () => { toast.success("비밀번호가 초기화되었습니다", { description: INITIAL_PASSWORD }); refresh(); },
    onError: err,
  });

  if (isLoading) return <AppShell title="CMS 사용자 관리"><p className="text-sm text-muted-foreground">불러오는 중…</p></AppShell>;
  if (!isAdmin)
    return (
      <AppShell title="CMS 사용자 관리">
        <p role="alert" className="rounded-md border border-border bg-card p-6 text-sm">관리자만 접근할 수 있는 화면입니다.</p>
      </AppShell>
    );

  const rows = (users.data ?? []) as Row[];

  return (
    <AppShell title="CMS 사용자 관리" desc={`총 ${rows.length}명 · 초기 비밀번호 ${INITIAL_PASSWORD}`}>
      <section className="mb-5 rounded-md border border-border bg-card p-3 shadow-sm">
        <p className="mb-2 text-xs font-bold">새 계정 만들기</p>
        <div className="flex flex-wrap items-center gap-2">
          <Input className="h-9 w-40 text-xs" placeholder="아이디 (hjlee)" value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value })} aria-label="아이디" />
          <Input className="h-9 w-32 text-xs" placeholder="이름" value={draft.full_name} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} aria-label="이름" />
          <Input className="h-9 w-36 text-xs" placeholder="직책" value={draft.position} onChange={(e) => setDraft({ ...draft, position: e.target.value })} aria-label="직책" />
          <Input className="h-9 w-40 text-xs" placeholder="소속팀" value={draft.team} onChange={(e) => setDraft({ ...draft, team: e.target.value })} aria-label="소속팀" />
          <Select value={draft.scope || "none"} onValueChange={(scope) => setDraft({ ...draft, scope: scope === "none" ? "" : scope })}>
            <SelectTrigger className="h-9 w-40 text-xs" aria-label="담당공종"><SelectValue placeholder="담당공종" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">담당공종 없음</SelectItem>
              {SCOPES.map((scope) => <SelectItem key={scope} value={scope}>{SCOPE_LABEL[scope]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" disabled={!draft.username.trim() || !draft.full_name.trim() || add.isPending} onClick={() => add.mutate()}>
            <Plus className="size-3.5" />생성
          </Button>
        </div>
      </section>

      <div className="overflow-auto rounded-md border border-border bg-card shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-secondary text-secondary-foreground">
            <tr>
              {["아이디", "이름", "직책", "소속팀", "권한", "담당 공종", "상태", "작업"].map((h) => (
                <th key={h} className="border-b border-border px-3 py-2 font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <UserRow key={r.id} row={r} onSave={(v) => save.mutate(v)} onDelete={() => remove.mutate(r.id)} onReset={() => reset.mutate(r.id)} />
            ))}
            {!rows.length && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">사용자가 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

function UserRow({ row, onSave, onDelete, onReset }: { row: Row; onSave: (r: Row) => void; onDelete: () => void; onReset: () => void }) {
  const [v, setV] = useState<Row>(row);
  return (
    <tr className="border-b border-border align-middle">
      <td className="px-3 py-2 font-mono">{v.username}</td>
      <td className="px-2 py-2"><Input className="h-8 w-28 text-xs" value={v.full_name} aria-label="이름" onChange={(e) => setV({ ...v, full_name: e.target.value })} /></td>
      <td className="px-2 py-2"><Input className="h-8 w-32 text-xs" value={v.position ?? ""} aria-label="직책" onChange={(e) => setV({ ...v, position: e.target.value })} /></td>
      <td className="px-2 py-2"><Input className="h-8 w-32 text-xs" value={v.team ?? ""} aria-label="소속팀" onChange={(e) => setV({ ...v, team: e.target.value })} /></td>
      <td className="px-2 py-2">
        <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" aria-label="권한" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })}>
          {Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </td>
      <td className="px-2 py-2">
        <Select value={v.scopes[0] ?? "none"} onValueChange={(scope) => setV({ ...v, scopes: scope === "none" ? [] : [scope] })}>
          <SelectTrigger className="h-8 w-36 text-xs" aria-label="담당공종"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">없음</SelectItem>
            {SCOPES.map((scope) => <SelectItem key={scope} value={scope}>{SCOPE_LABEL[scope]}</SelectItem>)}
          </SelectContent>
        </Select>
      </td>
      <td className="px-2 py-2">
        <label className="flex items-center gap-1 text-[11px]">
          <input type="checkbox" checked={v.is_active} onChange={(e) => setV({ ...v, is_active: e.target.checked })} />
          사용
        </label>
        {v.must_change_password && <span className="text-[10px] text-chart-2">비번 변경 대기</span>}
      </td>
      <td className="px-2 py-2">
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => onSave(v)} title="저장"><Save className="size-3.5" /></Button>
          <Button size="sm" variant="outline" onClick={onReset} title="비밀번호 초기화"><KeyRound className="size-3.5" /></Button>
          <Button
            size="sm"
            variant="outline"
            title="삭제"
            onClick={() => { if (confirm(`${v.username} 계정을 삭제할까요?`)) onDelete(); }}
          >
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
