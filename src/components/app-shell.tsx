import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  AlertTriangle, BarChart3, CalendarDays, ChevronLeft, Download, HardHat, ListChecks,
  Network, PanelLeft, Table2, UploadCloud, Wrench, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProject } from "@/lib/use-project";
import { setBaselineDate } from "@/lib/project.functions";
import { SLOT_LABEL } from "@/lib/schedule-model";

const NAV = [
  { group: "현황", items: [
    { to: "/dashboard", label: "대시보드", icon: BarChart3 },
    { to: "/network", label: "네트워크", icon: Network },
  ] },
  { group: "공정", items: [
    { to: "/delays", label: "지연 리스트", icon: AlertTriangle },
    { to: "/schedule", label: "공정리스트", icon: Table2 },
  ] },
  { group: "시운전 (T&C)", items: [
    { to: "/tc/mech", label: "MECH T&C", icon: Wrench },
    { to: "/tc/elec", label: "ELEC T&C", icon: Zap },
    { to: "/tc/list", label: "T&C List", icon: ListChecks },
  ] },
  { group: "데이터", items: [{ to: "/upload", label: "업로드", icon: UploadCloud }] },
] as const;

export function AppShell({ title, desc, actions, children }: { title: string; desc?: string; actions?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const { rows, base, batches, tcItems } = useProject();
  const qc = useQueryClient();
  const rev = Math.max(1, ...batches.map((b) => b.rev ?? 1));

  const saveBase = useMutation({
    mutationFn: (date: string) => setBaselineDate({ data: { date } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["project"] });
      toast.success("기준일이 변경되었습니다", { description: r.date });
    },
    onError: (e: Error) => toast.error("기준일 저장 실패", { description: e.message }),
  });

  const exportAll = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(rows.map((r) => ({
        "No.": r.no, 담당부서: r.dept, "Bldg.": r.bldg, Room: r.room, "Work Scope": r.scope,
        Milestone: r.ms, Subcon: r.sub, Activity: r.act, Unit: r.unit, Done: r.done, Total: r.tot,
        "계획(%)": r.pl == null ? null : r.pl * 100, "실적(%)": r.pc == null ? null : r.pc * 100,
        Predecessor: r.pred, Successor: r.succ, Start: r.s, Finish: r.e, Source: r.slot,
      }))),
      "통합공정표",
    );
    if (tcItems.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tcItems), "T&C");
    XLSX.writeFile(wb, `HMMME_통합_공정_${base.replace(/-/g, "")}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="flex h-14 items-center gap-3 px-3 lg:px-4">
          <Button size="icon" variant="ghost" aria-label="사이드바 토글" onClick={() => setOpen((v) => !v)}>
            {open ? <ChevronLeft /> : <PanelLeft />}
          </Button>
          <Link to="/dashboard" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground"><HardHat className="size-4" /></span>
            <span className="hidden sm:block">
              <strong className="block text-sm leading-tight">HMMME 통합 공정 관리</strong>
              <small className="block text-[11px] text-muted-foreground">Integrated Schedule Control</small>
            </span>
          </Link>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2 text-xs">
            <BaseSetting base={base} batches={batches} onApply={(d) => saveBase.mutate(d)} saving={saveBase.isPending} />
            <span className="rounded-md border border-border px-2 py-1.5 text-muted-foreground">
              총 <strong className="text-foreground">{rows.length.toLocaleString()}</strong>행 · Rev{rev}
            </span>
            <Button size="sm" variant="outline" onClick={exportAll}><Download className="size-3.5" />통합 엑셀</Button>
          </div>
        </div>
      </header>

      <div className="flex">
        <aside className={`${open ? "w-[212px]" : "w-0 lg:w-[62px]"} sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 overflow-y-auto border-r border-border bg-card transition-all sm:block`}>
          <nav className="p-2" aria-label="주 메뉴">
            {NAV.map((g) => (
              <div key={g.group} className="mb-3">
                {open && <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{g.group}</p>}
                {g.items.map((it) => (
                  <Link
                    key={it.to} to={it.to} title={it.label}
                    className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                    activeProps={{ className: "!bg-primary/10 !text-primary" }}
                  >
                    <it.icon className="size-4 shrink-0" />
                    {open && <span className="truncate">{it.label}</span>}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-5 lg:px-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight">{title}</h1>
              {desc && <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

export const slotLabel = (s: string) => SLOT_LABEL[s] ?? s;

type Batch = { id: number; kind: string; slot: string | null; file_name: string | null; file_date: string | null };

function BaseSetting({ base, batches, onApply, saving }: { base: string; batches: Batch[]; onApply: (d: string) => void; saving: boolean }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(base);

  const latest = new Map<string, Batch>();
  batches.forEach((b) => {
    const key = `${b.kind}:${b.slot ?? "-"}`;
    if (!latest.has(key)) latest.set(key, b);
  });
  const auto = [...latest.values()].map((b) => b.file_date).filter(Boolean).sort().pop() ?? null;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setVal(base); }}>
      <div className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5">
        <PopoverTrigger asChild>
          <button type="button" aria-label="기준일 설정" title="기준일 설정" className="grid size-5 place-items-center rounded border border-border text-muted-foreground hover:bg-accent hover:text-foreground">
            <Settings className="size-3" />
          </button>
        </PopoverTrigger>
        <CalendarDays className="size-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">기준일</span>
        <strong className="text-foreground">{base.replace(/-/g, ".")}</strong>
      </div>
      <PopoverContent align="end" className="w-[320px] p-3 text-xs">
        <p className="mb-1 text-sm font-bold">기준일 설정</p>
        <p className="mb-3 rounded bg-muted/60 p-2 text-[11px] leading-relaxed text-muted-foreground">
          <b className="text-foreground">적용</b> 마일스톤 계획·차이·D-day · T&amp;C 계획 산정 · 통합 엑셀 기준일 · 저장 파일명<br />
          <b className="text-foreground">참고</b> 「계획 대비 실적」·「지연」의 계획%·실적%는 각 부서가 엑셀에 기입한 원문값이라 기준일을 바꿔도 그대로입니다.
        </p>
        <div className="flex items-center gap-2">
          <Input type="date" aria-label="기준일 입력" value={val} onChange={(e) => setVal(e.target.value)} className="h-8 flex-1 text-xs" />
          <Button size="sm" disabled={!val || saving} onClick={() => { onApply(val); setOpen(false); }}>적용</Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          파일 기준값 <b className="text-foreground">{auto ? auto.replace(/-/g, ".") : "—"}</b>
          {auto && auto !== base && (
            <button className="ml-2 font-semibold text-primary underline" onClick={() => { onApply(auto); setOpen(false); }}>파일 기준으로 되돌리기</button>
          )}
        </p>
        {latest.size > 0 && (
          <div className="mt-3 border-t border-border pt-2">
            <p className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">업로드 파일 기준일</p>
            <ul className="space-y-1">
              {[...latest.values()].map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2">
                  <span className="truncate text-muted-foreground">{(SLOT_LABEL[b.slot ?? ""] ?? b.slot ?? "-")}{b.kind === "tc" ? " T&C" : ""}</span>
                  <b>{b.file_date ? b.file_date.replace(/-/g, ".") : "—"}</b>
                </li>
              ))}
            </ul>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
