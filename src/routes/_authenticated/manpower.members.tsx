import { useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { manpowerMembersQuery, useManpowerMembers } from "@/lib/use-manpower";
import { saveManpowerMember, setManpowerMemberActive } from "@/lib/manpower.functions";
import { MP } from "@/lib/manpower-i18n";

export const Route = createFileRoute("/_authenticated/manpower/members")({
  head: () => ({ meta: [
    { title: "출면 봇 사용자 | HMMME 통합 공정 관리" },
    { name: "description", content: "텔레그램 출면 보고 봇을 사용할 수 있는 협력사·HDEC 담당자를 등록하고 관리합니다." },
    { property: "og:title", content: "HMMME 출면 봇 사용자 관리" },
    { property: "og:description", content: "출면 보고 담당자를 등록하고 사용 여부를 관리하세요." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  loader: async ({ context }) => {
    try {
      return await context.queryClient.ensureQueryData(manpowerMembersQuery);
    } catch {
      throw redirect({ to: "/manpower" });
    }
  },
  errorComponent: ({ error }) => <div role="alert" className="p-8 text-sm">사용자 목록을 불러오지 못했습니다. {(error as Error).message}</div>,
  component: MembersPage,
});

type Draft = { telegram_id: string; name: string; company: string; role: "SUB" | "HDEC"; is_active: boolean; note: string };
const empty: Draft = { telegram_id: "", name: "", company: "", role: "SUB", is_active: true, note: "" };

function MembersPage() {
  const members = useManpowerMembers();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);

  const shown = useMemo(
    () => members.filter((m) => !q || `${m.name} ${m.company ?? ""} ${m.telegram_id}`.toLowerCase().includes(q.toLowerCase())),
    [members, q],
  );

  const save = useMutation({
    mutationFn: (d: Draft) => saveManpowerMember({ data: { ...d, company: d.company || null, note: d.note || null } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["manpower-members"] }); setDraft(null); toast.success("저장되었습니다"); },
    onError: (e: Error) => toast.error("저장 실패", { description: e.message }),
  });

  const toggle = useMutation({
    mutationFn: (v: { telegram_id: string; is_active: boolean }) => setManpowerMemberActive({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["manpower-members"] }),
    onError: (e: Error) => toast.error("변경 실패", { description: e.message }),
  });

  return (
    <AppShell
      title={MP.members}
      desc={`등록 ${members.length}명 · 사용중 ${members.filter((m) => m.is_active).length}명`}
      actions={<Button size="sm" onClick={() => setDraft(empty)}><Plus className="size-3.5" />사용자 추가</Button>}
    >
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·협력사·텔레그램 ID 검색" className="mb-3 h-8 max-w-xs text-xs" />

      <section className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[720px] text-xs">
          <caption className="sr-only">출면 보고 봇 사용자 목록</caption>
          <thead className="bg-muted/60">
            <tr className="[&>th]:border-b [&>th]:border-border [&>th]:px-2 [&>th]:py-2 [&>th]:text-left">
              <th scope="col">이름</th><th scope="col">텔레그램 ID</th><th scope="col">{MP.company}</th>
              <th scope="col">구분</th><th scope="col">사용</th><th scope="col">비고</th><th scope="col" />
            </tr>
          </thead>
          <tbody>
            {shown.map((m) => (
              <tr key={m.telegram_id} className="[&>td]:border-b [&>td]:border-border/60 [&>td]:px-2 [&>td]:py-1.5">
                <td className="font-medium">{m.name}</td>
                <td className="font-mono text-muted-foreground">{m.telegram_id}</td>
                <td>{m.company ?? "—"}</td>
                <td>{m.role === "HDEC" ? "HDEC" : "협력사"}</td>
                <td>
                  <Switch checked={m.is_active} aria-label={`${m.name} 사용 여부`}
                    onCheckedChange={(v) => toggle.mutate({ telegram_id: m.telegram_id, is_active: v })} />
                </td>
                <td className="max-w-[240px] truncate text-muted-foreground">{m.note ?? ""}</td>
                <td className="text-right">
                  <Button size="sm" variant="ghost" className="h-7 text-xs"
                    onClick={() => setDraft({ telegram_id: m.telegram_id, name: m.name, company: m.company ?? "", role: m.role, is_active: m.is_active, note: m.note ?? "" })}>
                    수정
                  </Button>
                </td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">등록된 사용자가 없습니다.</td></tr>}
          </tbody>
        </table>
      </section>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>봇 사용자 {draft?.telegram_id && members.some((m) => m.telegram_id === draft.telegram_id) ? "수정" : "추가"}</DialogTitle>
            <DialogDescription>텔레그램 ID를 등록해야 봇으로 출면 보고를 할 수 있습니다.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-3 text-xs">
              <Field id="tg" label="텔레그램 ID"><Input id="tg" value={draft.telegram_id} onChange={(e) => setDraft({ ...draft, telegram_id: e.target.value })} className="h-8 text-xs" /></Field>
              <Field id="nm" label="이름"><Input id="nm" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-8 text-xs" /></Field>
              <Field id="cp" label="협력사"><Input id="cp" value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} className="h-8 text-xs" /></Field>
              <Field id="rl" label="구분">
                <Select value={draft.role} onValueChange={(v) => setDraft({ ...draft, role: v as "SUB" | "HDEC" })}>
                  <SelectTrigger id="rl" className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="SUB">협력사</SelectItem><SelectItem value="HDEC">HDEC</SelectItem></SelectContent>
                </Select>
              </Field>
              <Field id="nt" label="비고"><Input id="nt" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} className="h-8 text-xs" /></Field>
              <div className="flex items-center gap-2">
                <Switch id="ac" checked={draft.is_active} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} />
                <Label htmlFor="ac" className="text-xs">사용</Label>
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setDraft(null)}>취소</Button>
                <Button size="sm" disabled={!draft.telegram_id || !draft.name || save.isPending} onClick={() => save.mutate(draft)}>저장</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label htmlFor={id} className="text-xs">{label}</Label>{children}</div>;
}
