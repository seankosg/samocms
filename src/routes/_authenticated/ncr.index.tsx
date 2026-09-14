import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Download, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AdminGate } from "@/components/manpower/admin-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NcrRawTable, cellValue } from "@/components/ncr/ncr-raw-table";
import { NCR_COLUMNS } from "@/lib/ncr-columns";
import { useNcrItems, ncrQuery } from "@/lib/use-ncr";
import { updateNcrItem, type NcrItem } from "@/lib/ncr.functions";
import {
  PS_NUMS, SLOT_ORDER, psOfSlot, planField, actualField,
  currentStage, isStartDelayed, type SlotKey, type NcrDates,
} from "@/lib/ncr-model";
import { useAuth } from "@/lib/use-auth";

const searchSchema = z.object({
  docType: z.string().optional(),
  team: z.string().optional(),
  sub: z.string().optional(),
  stage: z.string().optional(),
  status: z.string().optional(),
  q: z.string().optional(),
  slot: z.string().optional(),
  metric: z.string().optional(),
  asOf: z.string().optional(),
  within: z.string().optional(),
});

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** 임계치(일) 안에 계획일이 도래하지만 아직 실적이 없는 슬롯 = Early Alert */
export const isUpcoming = (d: NcrDates, slot: SlotKey, asOf: string, withinDays: number) => {
  const planned = d[planField(slot)];
  if (!planned || d[actualField(slot)]) return false;
  return planned > asOf && planned <= addDays(asOf, withinDays);
};

export const Route = createFileRoute("/_authenticated/ncr/")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({ meta: [
    { title: "NCR 리스트 | HMMME PROJECT CMS" },
    { name: "description", content: "NCR·OR·SOR 문서의 PS1~PS8 단계별 계획·실적을 관리합니다." },
    { property: "og:title", content: "HMMME NCR 리스트" },
    { property: "og:description", content: "부적합·관찰·안전 문서의 단계별 진행 현황 리스트." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(ncrQuery),
  errorComponent: ({ error }) => <div role="alert" className="p-8 text-sm">NCR 리스트를 불러오지 못했습니다. {(error as Error).message}</div>,
  component: NcrListPage,
});

const dates = (r: NcrItem) => r as unknown as NcrDates;

function NcrListPage() {
  const items = useNcrItems();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { isAdmin, profile } = useAuth();
  const qc = useQueryClient();
  

  const setSearch = (patch: Partial<z.infer<typeof searchSchema>>) =>
    navigate({ search: { ...search, ...patch }, replace: true });

  const save = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Record<string, string | null> }) => updateNcrItem({ data: { id, patch } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ncr-items"] }),
    onError: (e: Error) => toast.error("저장 실패", { description: e.message }),
  });

  const facets = useMemo(() => {
    const uniq = (f: (r: NcrItem) => string | null) => [...new Set(items.map(f).filter((v): v is string => !!v))].sort();
    return { docTypes: uniq((r) => r.doc_type), teams: uniq((r) => r.team), subs: uniq((r) => r.subcontractor), statuses: uniq((r) => r.status) };
  }, [items]);

  const filtered = useMemo(() => {
    const q = (search.q ?? "").toLowerCase();
    return items.filter((r) => {
      if (search.docType && r.doc_type !== search.docType) return false;
      if (search.team && r.team !== search.team) return false;
      if (search.sub && r.subcontractor !== search.sub) return false;
      if (search.status && r.status !== search.status) return false;
      const cur = currentStage(dates(r));
      if (search.stage) {
        if (search.stage === "Closed") { if (cur !== "Closed") return false; }
        else if (!cur.startsWith(search.stage)) return false;
      }
      if (search.slot && search.metric) {
        const slot = search.slot.toLowerCase() as SlotKey;
        if (!SLOT_ORDER.includes(slot)) return false;
        const d = dates(r);
        if (search.metric === "noplanAll" && !SLOT_ORDER.every((s) => !d[planField(s)])) return false;
        if (search.metric === "noplan") {
          const n = psOfSlot(slot);
          if (d[planField(`ps${n}s` as SlotKey)] || d[planField(`ps${n}f` as SlotKey)]) return false;
        }
        const planned = d[planField(slot)];
        const actual = d[actualField(slot)];
        const due = !!planned && !!search.asOf && planned <= search.asOf;
        if (search.metric === "plan" && !due) return false;
        if (search.metric === "actual" && !actual) return false;
        if (search.metric === "short" && !(due && !actual)) return false;
        if (search.metric === "over" && !(!due && !!actual)) return false;
        if (search.metric === "delay" && !isStartDelayed(d, slot, search.asOf ?? new Date().toISOString().slice(0, 10))) return false;
        if (search.metric === "delayBoth") {
          const n = psOfSlot(slot);
          const start = `ps${n}s` as SlotKey;
          const finish = `ps${n}f` as SlotKey;
          const cutoff = search.asOf ?? new Date().toISOString().slice(0, 10);
          if (!isStartDelayed(d, start, cutoff) && !isStartDelayed(d, finish, cutoff)) return false;
        }
        if (search.metric === "upcoming" || search.metric === "upcomingBoth") {
          const cutoff = search.asOf ?? new Date().toISOString().slice(0, 10);
          const win = Math.max(1, Number(search.within) || 7);
          if (search.metric === "upcoming") {
            if (!isUpcoming(d, slot, cutoff, win)) return false;
          } else {
            const n = psOfSlot(slot);
            if (!isUpcoming(d, `ps${n}s` as SlotKey, cutoff, win) && !isUpcoming(d, `ps${n}f` as SlotKey, cutoff, win)) return false;
          }
        }
        if (search.metric === "ongoing" || search.metric === "ongoingDelay") {
          const n = psOfSlot(slot);
          const start = `ps${n}s` as SlotKey;
          const finish = `ps${n}f` as SlotKey;
          const ongoing = !!d[actualField(start)] && !d[actualField(finish)];
          if (!ongoing) return false;
          if (search.metric === "ongoingDelay") {
            const cutoff = search.asOf ?? new Date().toISOString().slice(0, 10);
            const fPlan = d[planField(finish)];
            if (!fPlan || fPlan >= cutoff) return false;
          }
        }
      }
      if (q && ![r.doc_no, r.description, r.location, r.mic, r.pic, r.subcontractor, r.response_status].some((v) => (v ?? "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [items, search]);

  const drillLabel = useMemo(() => {
    if (!search.slot || !search.metric) return null;
    const labels: Record<string, string> = { plan: "계획 도래", actual: "실적 입력", short: "계획 미달", over: "계획 초과", delay: "지연", delayBoth: "Start/Finish 지연", ongoing: "진행 중", ongoingDelay: "진행 중(완료계획 경과)", noplan: "계획 미수립", noplanAll: "전 단계 계획 미수립", upcoming: "임박(Upcoming)", upcomingBoth: "임박(Start/Finish)" };
    const scope = search.metric === "noplanAll" ? "전체" : `PS${psOfSlot(search.slot.toLowerCase() as SlotKey)}`;
    const up = search.metric?.startsWith("upcoming") ? ` · ${Math.max(1, Number(search.within) || 7)}일 이내` : "";
    return `${scope} · ${labels[search.metric] ?? search.metric}${up}${search.asOf && search.metric !== "noplan" && search.metric !== "noplanAll" ? ` · 기준일 ${search.asOf}` : ""}`;
  }, [search.slot, search.metric, search.asOf, search.within]);

  const canEditRow = (r: NcrItem) => {
    if (isAdmin) return true;
    const me = (profile?.full_name ?? "").trim();
    return !!me && [r.mic, r.pic].some((v) => (v ?? "").trim() === me);
  };

  const exportXlsx = () => {
    // 임포트 엑셀과 동일한 컬럼 순서로 내보냅니다.
    const rows = filtered.map((r) => {
      const out: Record<string, unknown> = {};
      for (const c of NCR_COLUMNS) out[c.groupId ? `${c.groupId} ${c.label}` : c.label] = cellValue(r, c.key);
      return out;
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "NCR");
    XLSX.writeFile(wb, `HMMME_NCR_List_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.xlsx`);
  };

  const chip = (label: string, active: boolean, onClick: () => void) => (
    <button
      key={label}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-accent"}`}
    >
      {label}
    </button>
  );

  return (
    <AdminGate title="NCR 리스트" desc="준공 준비 기능은 현재 관리자(Admin)에게만 제공됩니다.">
      <AppShell
        title="NCR 리스트"
        desc={`NCR · OR · SOR ${filtered.length.toLocaleString()}건 (전체 ${items.length.toLocaleString()}건) · 행을 펼치면 PS1~PS8 단계별 계획/실적을 수정할 수 있습니다`}
        actions={<Button size="sm" variant="outline" onClick={exportXlsx}><Download className="size-3.5" />엑셀</Button>}
      >
        {/* 필터 */}
        {drillLabel && (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
            <span><strong>대시보드 상세조건</strong> · {drillLabel} · {filtered.length.toLocaleString()}건</span>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setSearch({ slot: undefined, metric: undefined, asOf: undefined })}>조건 해제</Button>
          </div>
        )}
        <div className="mb-3 space-y-2 rounded-md border border-border bg-card p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-14 text-[11px] font-bold text-muted-foreground">문서종류</span>
            {chip("전체", !search.docType, () => setSearch({ docType: undefined }))}
            {facets.docTypes.map((t) => chip(t, search.docType === t, () => setSearch({ docType: search.docType === t ? undefined : t })))}
            <span className="ml-3 w-10 text-[11px] font-bold text-muted-foreground">상태</span>
            {chip("전체", !search.status, () => setSearch({ status: undefined }))}
            {facets.statuses.map((t) => chip(t, search.status === t, () => setSearch({ status: search.status === t ? undefined : t })))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-14 text-[11px] font-bold text-muted-foreground">현재단계</span>
            {chip("전체", !search.stage, () => setSearch({ stage: undefined }))}
            {PS_NUMS.map((n) => chip(`PS${n}`, search.stage === `PS${n}`, () => setSearch({ stage: search.stage === `PS${n}` ? undefined : `PS${n}` })))}
            {chip("Closed", search.stage === "Closed", () => setSearch({ stage: search.stage === "Closed" ? undefined : "Closed" }))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-14 text-[11px] font-bold text-muted-foreground">협력사</span>
            {chip("전체", !search.sub, () => setSearch({ sub: undefined }))}
            {facets.subs.map((t) => chip(t, search.sub === t, () => setSearch({ sub: search.sub === t ? undefined : t })))}
            {facets.teams.length > 1 && (
              <>
                <span className="ml-3 w-10 text-[11px] font-bold text-muted-foreground">팀</span>
                {chip("전체", !search.team, () => setSearch({ team: undefined }))}
                {facets.teams.map((t) => chip(t, search.team === t, () => setSearch({ team: search.team === t ? undefined : t })))}
              </>
            )}
            <div className="relative ml-auto">
              <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 w-52 pl-7 text-xs"
                placeholder="문서번호 · 내용 · 담당 검색"
                value={search.q ?? ""}
                onChange={(e) => setSearch({ q: e.target.value || undefined })}
              />
            </div>
          </div>
        </div>

        {/* 리스트 — 임포트 엑셀과 동일한 컬럼 순서 */}
        <NcrRawTable
          rows={filtered}
          canEditRow={canEditRow}
          saving={save.isPending}
          onSave={(id, patch) => save.mutate({ id, patch })}
        />
      </AppShell>
    </AdminGate>
  );
}
