import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useManpowerMembers, useManpowerMasters } from "@/lib/use-manpower";
import { saveManpowerMember, setManpowerMemberActive } from "@/lib/manpower.functions";
import { MP } from "@/lib/manpower-i18n";

type Draft = { telegram_id: string; name: string; company: string; role: "SUB" | "HDEC"; is_active: boolean; note: string };
const empty: Draft = { telegram_id: "", name: "", company: "", role: "SUB", is_active: true, note: "" };

/** 출면기록 관리자(봇 사용자) 설정 패널 — 「출면관리」 페이지의 탭 본문. */
export function MembersPanel() {
  const members = useManpowerMembers();
  const { companies } = useManpowerMasters();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const activeCompanies = useMemo(() => companies.filter((c) => c.is_active), [companies]);
  const legacyCompany =
    draft && draft.role !== "HDEC" && draft.company && !activeCompanies.some((c) => c.name === draft.company)
      ? draft.company
      : null;

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
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·협력사·텔레그램 ID 검색" className="h-8 max-w-xs text-xs" />
        <Button size="sm" onClick={() => setDraft(empty)}><Plus className="size-3.5" />사용자 추가</Button>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
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
      </div>

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
              <Field id="cp" label="협력사">
                <Select
                  value={draft.role === "HDEC" ? "HDEC" : (draft.company || "")}
                  disabled={draft.role === "HDEC"}
                  onValueChange={(v) => setDraft({ ...draft, company: v })}
                >
                  <SelectTrigger id="cp" className="h-8 text-xs"><SelectValue placeholder="협력사 선택" /></SelectTrigger>
                  <SelectContent>
                    {draft.role === "HDEC" && <SelectItem value="HDEC">HDEC</SelectItem>}
                    {activeCompanies.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                    {legacyCompany && <SelectItem value={legacyCompany}>{legacyCompany} (마스터에 없음)</SelectItem>}
                  </SelectContent>
                </Select>
                {legacyCompany && (
                  <p className="text-[11px] text-amber-600">이 협력사 이름은 출면 마스터에 없습니다. 마스터에 먼저 등록하거나 별칭으로 정리하세요.</p>
                )}
                <p className="text-[11px] text-muted-foreground">신규 업체는 먼저 「업체·장소 관리」 탭에 등록해야 목록에 나옵니다.</p>
              </Field>
              <Field id="rl" label="구분">
                <Select value={draft.role} onValueChange={(v) => setDraft({ ...draft, role: v as "SUB" | "HDEC", company: v === "HDEC" ? "HDEC" : "" })}>
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
    </section>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label htmlFor={id} className="text-xs">{label}</Label>{children}</div>;
}
