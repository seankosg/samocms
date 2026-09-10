import { useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AdminGate } from "@/components/manpower/admin-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { manpowerMastersQuery, useManpowerMasters, type AliasRow, type MasterRow } from "@/lib/use-manpower";
import {
  saveManpowerMaster, setManpowerMasterActive, setManpowerMasterOrder, deleteManpowerMaster,
  saveManpowerAlias, deleteManpowerAlias, renameManpowerMaster,
} from "@/lib/manpower.functions";

export const Route = createFileRoute("/_authenticated/manpower/masters")({
  head: () => ({ meta: [
    { title: "출면 업체 장소 관리 설정 | HMMME PROJECT CMS" },
    { name: "description", content: "출면 보고에 쓰이는 협력사·장소 목록과 옛 이름 별칭을 관리합니다." },
    { property: "og:title", content: "HMMME 출면 업체 장소 관리 설정" },
    { property: "og:description", content: "협력사·장소 목록과 별칭을 한곳에서 관리하세요." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  loader: async ({ context }) => {
    try {
      return await context.queryClient.ensureQueryData(manpowerMastersQuery);
    } catch {
      throw redirect({ to: "/manpower" });
    }
  },
  errorComponent: ({ error }) => <div role="alert" className="p-8 text-sm">마스터를 불러오지 못했습니다. {(error as Error).message}</div>,
  component: MastersPage,
});

type Kind = "company" | "location";

function MastersPage() {
  const { companies, locations, aliases, usage, members } = useManpowerMasters();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["manpower-masters"] });
    qc.invalidateQueries({ queryKey: ["manpower"] });
  };

  const count = useMemo(() => {
    const m = new Map<string, number>();
    usage.forEach((u) => m.set(`${u.kind}|${u.name}`, Number(u.entry_count)));
    return m;
  }, [usage]);

  return (
    <AdminGate title="출면 업체 장소 관리 설정">
      <AppShell title="출면 업체 장소 관리 설정" desc={`협력사 ${companies.length}곳 · 장소 ${locations.length}곳 · 별칭 ${aliases.length}건`}>
        <Tabs defaultValue="company">
          <TabsList className="mb-3">
            <TabsTrigger value="company">회사</TabsTrigger>
            <TabsTrigger value="location">장소</TabsTrigger>
            <TabsTrigger value="alias">별칭</TabsTrigger>
          </TabsList>

          <TabsContent value="company">
            <MasterTab kind="company" rows={companies} count={count} aliases={aliases} members={members} onDone={invalidate} />
          </TabsContent>
          <TabsContent value="location">
            <MasterTab kind="location" rows={locations} count={count} aliases={aliases} members={members} onDone={invalidate} />
          </TabsContent>
          <TabsContent value="alias">
            <AliasTab aliases={aliases} companies={companies} locations={locations} count={count} onDone={invalidate} />
          </TabsContent>
        </Tabs>
      </AppShell>
    </AdminGate>
  );
}

type Draft = MasterRow & { isNew: boolean };

function MasterTab({ kind, rows, count, aliases, members, onDone }: {
  kind: Kind; rows: MasterRow[]; count: Map<string, number>;
  aliases: AliasRow[]; members: { company: string | null }[]; onDone: () => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [rename, setRename] = useState<{ oldName: string; newName: string } | null>(null);

  const nextOrder = (rows.at(-1)?.sort_order ?? 0) + 10;
  const usedBy = (name: string) => ({
    entries: count.get(`${kind}|${name}`) ?? 0,
    alias: aliases.some((a) => a.kind === kind && a.canonical === name),
    member: kind === "company" && members.some((m) => m.company === name),
  });

  const save = useMutation({
    mutationFn: (d: Draft) => saveManpowerMaster({ data: { ...d, kind, isNew: d.isNew } }),
    onSuccess: () => { onDone(); setDraft(null); toast.success("저장되었습니다"); },
    onError: (e: Error) => toast.error("저장 실패", { description: e.message }),
  });
  const toggle = useMutation({
    mutationFn: (v: { name: string; is_active: boolean }) => setManpowerMasterActive({ data: { kind, ...v } }),
    onSuccess: onDone,
    onError: (e: Error) => toast.error("변경 실패", { description: e.message }),
  });
  const reorder = useMutation({
    mutationFn: (items: { name: string; sort_order: number }[]) => setManpowerMasterOrder({ data: { kind, items } }),
    onSuccess: onDone,
    onError: (e: Error) => toast.error("순서 변경 실패", { description: e.message }),
  });
  const remove = useMutation({
    mutationFn: (name: string) => deleteManpowerMaster({ data: { kind, name } }),
    onSuccess: () => { onDone(); toast.success("삭제되었습니다"); },
    onError: (e: Error) => toast.error("삭제 실패", { description: e.message }),
  });
  const doRename = useMutation({
    mutationFn: (v: { oldName: string; newName: string }) => renameManpowerMaster({ data: { kind, ...v } }),
    onSuccess: () => { onDone(); setRename(null); toast.success("이름이 변경되었습니다"); },
    onError: (e: Error) => toast.error("이름 변경 실패", { description: e.message }),
  });

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const a = rows[i]!, b = rows[j]!;
    reorder.mutate([{ name: a.name, sort_order: b.sort_order }, { name: b.name, sort_order: a.sort_order }]);
  };

  const emptyDraft: Draft = { name: "", sort_order: nextOrder, is_active: true, isNew: true };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {kind === "location" ? "Our Site Office 는 항상 첫 번째(순서 10)로 유지하세요. " : ""}
          비활성으로 두면 봇 드롭다운·준수율 분모·미보고 목록에서 빠지지만 과거 기록은 그대로 집계됩니다.
        </p>
        <Button size="sm" onClick={() => setDraft(emptyDraft)}><Plus className="size-3.5" />추가</Button>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[760px] text-xs">
          <caption className="sr-only">{kind === "company" ? "협력사" : "장소"} 마스터</caption>
          <thead className="bg-muted/60">
            <tr className="[&>th]:border-b [&>th]:border-border [&>th]:px-2 [&>th]:py-2 [&>th]:text-left">
              <th scope="col" className="w-16">순서</th>
              <th scope="col">이름</th>
              {kind === "company"
                ? <><th scope="col">약칭</th><th scope="col">공종</th><th scope="col">계약번호</th></>
                : <><th scope="col">건물코드</th><th scope="col">구역</th></>}
              <th scope="col" className="w-20 text-right">기록 수</th>
              <th scope="col" className="w-16">활성</th>
              <th scope="col" className="w-44" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const u = usedBy(r.name);
              const canDelete = u.entries === 0 && !u.alias && !u.member;
              return (
                <tr key={r.name} className={`[&>td]:border-b [&>td]:border-border/60 [&>td]:px-2 [&>td]:py-1.5 ${r.is_active ? "" : "bg-muted/40 text-muted-foreground"}`}>
                  <td className="tabular-nums">{r.sort_order}</td>
                  <td className="font-medium">{r.name}</td>
                  {kind === "company"
                    ? <><td>{r.short_name ?? "—"}</td><td>{r.discipline ?? "—"}</td><td>{r.contract_no ?? "—"}</td></>
                    : <><td>{r.bldg_code ?? "—"}</td><td>{r.zone ?? "—"}</td></>}
                  <td className="text-right tabular-nums">{u.entries.toLocaleString()}</td>
                  <td>
                    <Switch checked={r.is_active} aria-label={`${r.name} 활성`}
                      onCheckedChange={(v) => toggle.mutate({ name: r.name, is_active: v })} />
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <Button size="icon" variant="ghost" className="size-7" aria-label="위로" onClick={() => move(i, -1)}><ArrowUp className="size-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="size-7" aria-label="아래로" onClick={() => move(i, 1)}><ArrowDown className="size-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDraft({ ...r, isNew: false })}>
                      <Pencil className="size-3.5" />수정
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setRename({ oldName: r.name, newName: "" })}>이름 변경</Button>
                    <Button size="icon" variant="ghost" className="size-7 text-destructive" aria-label="삭제" disabled={!canDelete}
                      title={canDelete ? "삭제" : `기록 ${u.entries}건 또는 별칭·사용자가 있어 삭제할 수 없습니다`}
                      onClick={() => { if (confirm(`${r.name} 을(를) 삭제할까요?`)) remove.mutate(r.name); }}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{kind === "company" ? "협력사" : "장소"} {draft?.isNew ? "추가" : "수정"}</DialogTitle>
            <DialogDescription>
              이름은 봇 폼 표기와 글자 단위로 같아야 합니다. 이름 자체는 나중에 고칠 수 없으니, 잘못 넣었다면 새로 추가하고 옛 이름을 비활성 처리하거나 별칭으로 합치세요.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-3 text-xs">
              <Field id="nm" label="이름">
                <Input id="nm" value={draft.name} disabled={!draft.isNew} className="h-8 text-xs"
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </Field>
              <Field id="so" label="순서">
                <Input id="so" type="number" value={draft.sort_order} className="h-8 text-xs"
                  onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) || 0 })} />
              </Field>
              {kind === "company" ? (
                <>
                  <Field id="sn" label="약칭"><Input id="sn" value={draft.short_name ?? ""} className="h-8 text-xs" onChange={(e) => setDraft({ ...draft, short_name: e.target.value })} /></Field>
                  <Field id="dc" label="공종"><Input id="dc" value={draft.discipline ?? ""} className="h-8 text-xs" onChange={(e) => setDraft({ ...draft, discipline: e.target.value })} /></Field>
                  <Field id="cn" label="계약번호"><Input id="cn" value={draft.contract_no ?? ""} className="h-8 text-xs" onChange={(e) => setDraft({ ...draft, contract_no: e.target.value })} /></Field>
                </>
              ) : (
                <>
                  <Field id="bc" label="건물코드"><Input id="bc" value={draft.bldg_code ?? ""} className="h-8 text-xs" onChange={(e) => setDraft({ ...draft, bldg_code: e.target.value })} /></Field>
                  <Field id="zn" label="구역"><Input id="zn" value={draft.zone ?? ""} className="h-8 text-xs" onChange={(e) => setDraft({ ...draft, zone: e.target.value })} /></Field>
                </>
              )}
              <div className="flex items-center gap-2">
                <Switch id="ia" checked={draft.is_active} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} />
                <Label htmlFor="ia" className="text-xs">활성</Label>
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setDraft(null)}>취소</Button>
                <Button size="sm" disabled={!draft.name.trim() || save.isPending} onClick={() => save.mutate({ ...draft, name: draft.name.trim() })}>저장</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!rename} onOpenChange={(o) => !o && setRename(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>이름 변경</DialogTitle>
            <DialogDescription>
              새 이름을 추가하고, 옛 이름을 새 이름의 별칭으로 등록한 뒤 비활성 처리합니다. 과거 기록은 그대로 두고 화면에서만 새 이름으로 합쳐집니다.
            </DialogDescription>
          </DialogHeader>
          {rename && (
            <div className="space-y-3 text-xs">
              <p className="text-muted-foreground">기존 이름: <span className="font-medium text-foreground">{rename.oldName}</span></p>
              <Field id="rn" label="새 이름">
                <Input id="rn" value={rename.newName} className="h-8 text-xs" onChange={(e) => setRename({ ...rename, newName: e.target.value })} />
              </Field>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setRename(null)}>취소</Button>
                <Button size="sm" disabled={!rename.newName.trim() || doRename.isPending}
                  onClick={() => doRename.mutate({ oldName: rename.oldName, newName: rename.newName.trim() })}>변경</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function AliasTab({ aliases, companies, locations, count, onDone }: {
  aliases: AliasRow[]; companies: MasterRow[]; locations: MasterRow[]; count: Map<string, number>; onDone: () => void;
}) {
  const [draft, setDraft] = useState<{ kind: Kind; alias: string; canonical: string; note: string } | null>(null);

  const masterNames = (k: Kind) => new Set((k === "company" ? companies : locations).map((r) => r.name));
  const candidates = useMemo(() => {
    const out: { kind: Kind; name: string; n: number }[] = [];
    for (const [key, n] of count) {
      const [kind, ...rest] = key.split("|");
      const name = rest.join("|");
      const k = kind as Kind;
      if (!name) continue;
      if (masterNames(k).has(name)) continue;
      if (aliases.some((a) => a.kind === k && a.alias === name)) continue;
      out.push({ kind: k, name, n });
    }
    return out.sort((a, b) => b.n - a.n);
  }, [count, aliases, companies, locations]);

  const save = useMutation({
    mutationFn: (d: { kind: Kind; alias: string; canonical: string; note: string }) =>
      saveManpowerAlias({ data: { kind: d.kind, alias: d.alias.trim(), canonical: d.canonical, note: d.note || null } }),
    onSuccess: () => { onDone(); setDraft(null); toast.success("별칭이 등록되었습니다"); },
    onError: (e: Error) => toast.error("등록 실패", { description: e.message }),
  });
  const remove = useMutation({
    mutationFn: (v: { kind: Kind; alias: string }) => deleteManpowerAlias({ data: v }),
    onSuccess: () => { onDone(); toast.success("별칭이 삭제되었습니다"); },
    onError: (e: Error) => toast.error("삭제 실패", { description: e.message }),
  });

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">기록은 바뀌지 않습니다. 화면·집계에서만 정식 이름으로 보입니다.</p>
        <Button size="sm" onClick={() => setDraft({ kind: "company", alias: "", canonical: "", note: "" })}><Plus className="size-3.5" />별칭 추가</Button>
      </div>

      <div className="rounded-md border border-border p-2">
        <p className="mb-1 text-xs font-semibold">별칭 후보 — 마스터에 없는 이름 {candidates.length}건</p>
        {candidates.length === 0 ? (
          <p className="text-xs text-muted-foreground">모든 기록의 이름이 마스터에 있습니다.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {candidates.map((c) => (
              <li key={`${c.kind}|${c.name}`}>
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => setDraft({ kind: c.kind, alias: c.name, canonical: "", note: "" })}>
                  {c.kind === "company" ? "회사" : "장소"} · {c.name} ({c.n})
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[720px] text-xs">
          <caption className="sr-only">별칭 목록</caption>
          <thead className="bg-muted/60">
            <tr className="[&>th]:border-b [&>th]:border-border [&>th]:px-2 [&>th]:py-2 [&>th]:text-left">
              <th scope="col" className="w-20">종류</th><th scope="col">별칭</th><th scope="col">정식 이름</th>
              <th scope="col">메모</th><th scope="col" className="w-24 text-right">기록 수</th><th scope="col" className="w-16" />
            </tr>
          </thead>
          <tbody>
            {aliases.map((a) => (
              <tr key={`${a.kind}|${a.alias}`} className="[&>td]:border-b [&>td]:border-border/60 [&>td]:px-2 [&>td]:py-1.5">
                <td>{a.kind === "company" ? "회사" : "장소"}</td>
                <td className="font-medium">{a.alias}</td>
                <td>→ {a.canonical}</td>
                <td className="text-muted-foreground">{a.note ?? ""}</td>
                <td className="text-right tabular-nums">{(count.get(`${a.kind}|${a.alias}`) ?? 0).toLocaleString()}</td>
                <td className="text-right">
                  <Button size="icon" variant="ghost" className="size-7 text-destructive" aria-label="별칭 삭제"
                    onClick={() => { if (confirm(`별칭을 지우면 해당 기록은 원래 이름 '${a.alias}' 로 되돌아갑니다. 삭제할까요?`)) remove.mutate({ kind: a.kind, alias: a.alias }); }}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
            {!aliases.length && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">등록된 별칭이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>별칭 추가</DialogTitle>
            <DialogDescription>기록에 적힌 옛 이름·오타를 마스터의 정식 이름으로 합쳐 보여줍니다.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-3 text-xs">
              <Field id="ak" label="종류">
                <Select value={draft.kind} onValueChange={(v) => setDraft({ ...draft, kind: v as Kind, canonical: "" })}>
                  <SelectTrigger id="ak" className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="company">회사</SelectItem><SelectItem value="location">장소</SelectItem></SelectContent>
                </Select>
              </Field>
              <Field id="al" label="별칭 (기록의 이름)">
                <Input id="al" value={draft.alias} className="h-8 text-xs" onChange={(e) => setDraft({ ...draft, alias: e.target.value })} />
              </Field>
              <Field id="ac" label="정식 이름">
                <Select value={draft.canonical} onValueChange={(v) => setDraft({ ...draft, canonical: v })}>
                  <SelectTrigger id="ac" className="h-8 text-xs"><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    {(draft.kind === "company" ? companies : locations).filter((r) => r.is_active).map((r) => (
                      <SelectItem key={r.name} value={r.name}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id="an" label="메모"><Input id="an" value={draft.note} className="h-8 text-xs" onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></Field>
              <p className="text-muted-foreground">
                이 별칭으로 적힌 기록 {(count.get(`${draft.kind}|${draft.alias.trim()}`) ?? 0).toLocaleString()}건이 정식 이름 아래로 합쳐집니다.
              </p>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setDraft(null)}>취소</Button>
                <Button size="sm" disabled={!draft.alias.trim() || !draft.canonical || save.isPending} onClick={() => save.mutate(draft)}>저장</Button>
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
