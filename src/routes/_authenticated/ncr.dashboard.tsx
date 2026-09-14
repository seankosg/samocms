import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardList } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AdminGate } from "@/components/manpower/admin-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNcrItems, ncrQuery } from "@/lib/use-ncr";
import type { NcrItem } from "@/lib/ncr.functions";
import { PS_NUMS, PS_LABEL, SLOT_ORDER, planField, actualField, currentStage, isStartDelayed, type SlotKey, type NcrDates } from "@/lib/ncr-model";

const searchSchema = z.object({
  docType: z.string().optional(),
  team: z.string().optional(),
  sub: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/ncr/dashboard")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({ meta: [
    { title: "NCR 대시보드 | HMMME PROJECT CMS" },
    { name: "description", content: "NCR·OR·SOR의 PS1~PS8 단계별 진행·지연·현재단계 현황을 한눈에 봅니다." },
    { property: "og:title", content: "HMMME NCR 대시보드" },
    { property: "og:description", content: "준공 준비 문서의 단계별 진행·지연 KPI." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(ncrQuery),
  errorComponent: ({ error }) => <div role="alert" className="p-8 text-sm">NCR 대시보드를 불러오지 못했습니다. {(error as Error).message}</div>,
  component: NcrDashboardPage,
});

const dates = (r: NcrItem) => r as unknown as NcrDates;

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** 임계치(일) 안에 계획일이 도래하지만 아직 실적이 없는 슬롯 */
const isUpcoming = (d: NcrDates, slot: SlotKey, asOf: string, limit: string) => {
  const planned = d[planField(slot)];
  if (!planned || d[actualField(slot)]) return false;
  return planned > asOf && planned <= limit;
};

const progressRate = (value: number, total: number) => total > 0 ? Math.round((value / total) * 100) : 0;

const currentStageTone = (value: number, max: number) => {
  if (value === 0 || max === 0) return "bg-muted/30 text-muted-foreground hover:bg-muted/50";
  const ratio = value / max;
  if (ratio <= 0.25) return "bg-ncr-stage-low text-foreground hover:bg-ncr-stage-mid";
  if (ratio <= 0.5) return "bg-ncr-stage-mid text-foreground hover:bg-ncr-stage-high";
  if (ratio <= 0.75) return "bg-ncr-stage-high text-foreground hover:bg-ncr-stage-max";
  return "bg-ncr-stage-max text-ncr-stage-strong-foreground hover:bg-ncr-stage-max";
};

function ProgressMetric({ plan, actual, total, onDrill }: { plan: number; actual: number; total: number; onDrill: (metric: "plan" | "actual" | "short" | "over") => void }) {
  const planRate = progressRate(plan, total);
  const actualRate = progressRate(actual, total);
  const gap = actualRate - planRate;
  const gapMetric = gap < 0 ? "short" : "over";
  return (
    <div className="min-w-0 px-2 py-2.5">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <Button variant="ghost" size="sm" onClick={() => onDrill("plan")} className="h-6 min-w-0 px-1 font-semibold text-ncr-progress-plan">P <strong className="ml-1 text-sm">{plan}</strong>건</Button>
        <Button variant="ghost" size="sm" onClick={() => onDrill("actual")} className="h-6 min-w-0 px-1 font-semibold text-ncr-progress-actual">A <strong className="ml-1 text-sm">{actual}</strong>건</Button>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <Button variant="ghost" onClick={() => onDrill("plan")} className="relative h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-muted p-0" aria-label={`계획 진도율 ${planRate}%`}>
          <span className="absolute inset-y-0 left-0 bg-ncr-progress-plan" style={{ width: `${planRate}%` }} />
          <span className="absolute inset-y-[3px] left-0 bg-ncr-progress-actual" style={{ width: `${actualRate}%` }} />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onDrill("plan")} className="h-6 px-1 text-[10px] font-bold text-ncr-progress-plan">P {planRate}%</Button>
        <Button variant="ghost" size="sm" onClick={() => onDrill("actual")} className="h-6 px-1 text-[10px] font-bold text-ncr-progress-actual">A {actualRate}%</Button>
        <Button variant="ghost" size="sm" onClick={() => onDrill(gapMetric)} className={`h-6 px-1 text-[10px] font-bold ${gap < 0 ? "text-ncr-delay" : gap > 0 ? "text-ncr-progress-over" : "text-foreground/60"}`}>
          {gap > 0 ? "+" : ""}{gap}%p
        </Button>
      </div>
    </div>
  );
}

function NcrDashboardPage() {
  const items = useNcrItems();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const goList = useNavigate();
  const [asOf, setAsOf] = useState(() => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10)); // 제다 기준 오늘
  const [within, setWithin] = useState(3); // Early Alert 임계치(일)

  const setSearch = (patch: Partial<z.infer<typeof searchSchema>>) =>
    navigate({ search: { ...search, ...patch }, replace: true });

  const facets = useMemo(() => {
    const uniq = (f: (r: NcrItem) => string | null) => [...new Set(items.map(f).filter((v): v is string => !!v))].sort();
    return { docTypes: uniq((r) => r.doc_type), teams: uniq((r) => r.team), subs: uniq((r) => r.subcontractor) };
  }, [items]);

  const filtered = useMemo(() => items.filter((r) => {
    if (search.docType && r.doc_type !== search.docType) return false;
    if (search.team && r.team !== search.team) return false;
    if (search.sub && r.subcontractor !== search.sub) return false;
    return true;
  }), [items, search]);

  const upLimit = useMemo(() => addDays(asOf, Math.max(1, within)), [asOf, within]);

  const stats = useMemo(() => PS_NUMS.map((n) => {
    const s = `ps${n}s` as SlotKey;
    const f = `ps${n}f` as SlotKey;
    let sPlan = 0, sAct = 0, fPlan = 0, fAct = 0, sDelay = 0, fDelay = 0, cur = 0, noPlan = 0, ongoing = 0, ongoingDelay = 0, upS = 0, upF = 0;
    for (const r of filtered) {
      const d = dates(r);
      if (!d[planField(s)] && !d[planField(f)]) noPlan += 1;
      if (d[planField(s)] && d[planField(s)]! <= asOf) sPlan += 1;
      if (d[actualField(s)]) sAct += 1;
      if (d[planField(f)] && d[planField(f)]! <= asOf) fPlan += 1;
      if (d[actualField(f)]) fAct += 1;
      if (isStartDelayed(d, s, asOf)) sDelay += 1;
      if (isStartDelayed(d, f, asOf)) fDelay += 1;
      if (d[actualField(s)] && !d[actualField(f)]) {
        ongoing += 1;
        const fPlan = d[planField(f)];
        if (fPlan && fPlan < asOf) ongoingDelay += 1;
      }
      if (isUpcoming(d, s, asOf, upLimit)) upS += 1;
      if (isUpcoming(d, f, asOf, upLimit)) upF += 1;
      const c = currentStage(d);
      if (c.startsWith(`PS${n}`)) cur += 1;
    }
    return { n, stage: "PS" + n, sPlan, sAct, fPlan, fAct, sDelay, fDelay, cur, noPlan, ongoing, ongoingDelay, upS, upF };
  }), [filtered, asOf, upLimit]);

  const closed = filtered.filter((r) => currentStage(dates(r)) === "Closed").length;
  const noPlanTotal = filtered.filter((r) => { const d = dates(r); return SLOT_ORDER.every((s) => !d[planField(s)]); }).length;
  const maxCurrent = Math.max(0, ...stats.map((st) => st.cur));

  const chip = (label: string, active: boolean, onClick: () => void) => (
    <Button
      key={label}
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      onClick={onClick}
      className="h-7 rounded-full px-3 text-[11px] font-semibold"
    >
      {label}
    </Button>
  );

  const baseListSearch = { ...(search.docType ? { docType: search.docType } : {}), ...(search.team ? { team: search.team } : {}), ...(search.sub ? { sub: search.sub } : {}) };
  const toList = (params: Record<string, string>) => goList({ to: "/ncr", search: { ...baseListSearch, ...params } });
  const drill = (slot: SlotKey, metric: string) =>
    toList({ slot: slot.toUpperCase(), metric, asOf, ...(metric.startsWith("upcoming") ? { within: String(Math.max(1, within)) } : {}) });

  return (
    <AdminGate title="NCR 대시보드" desc="준공 준비 기능은 현재 관리자(Admin)에게만 제공됩니다.">
      <AppShell
        title="NCR 대시보드"
        desc={`PS1~PS8 단계별 진행 · 지연 · 현재단계 현황 — 카드를 누르면 해당 리스트로 이동합니다`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              기준일
              <Input type="date" value={asOf} onChange={(e) => e.target.value && setAsOf(e.target.value)} className="h-8 w-36 text-xs" />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title="기준일로부터 이 일수 안에 계획일이 도래하는 미착수 항목을 Upcoming으로 표시합니다.">
              Upcoming 임계치
              <Input type="number" min={1} max={180} value={within} onChange={(e) => setWithin(Math.max(1, Math.min(180, Number(e.target.value) || 1)))} className="h-8 w-20 text-xs" />
              <span className="text-[11px]">일</span>
              {[3, 7, 14, 30].map((d) => (
                <Button key={d} type="button" size="sm" variant={within === d ? "default" : "outline"} onClick={() => setWithin(d)} className="h-7 rounded-full px-2 text-[11px] font-semibold">{d}</Button>
              ))}
            </label>
          </div>
        }
      >
        <div className="mb-4 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-ncr-matrix px-4 py-3 text-ncr-matrix-foreground">
            <div>
              <p className="text-sm font-bold">NCR Operational Progress Matrix</p>
              <p className="mt-0.5 text-[11px] opacity-70">PS1~PS8 계획 · 실적 · 지연 · 현재단계 비교</p>
            </div>
            <div className="flex items-center gap-4 text-[11px] font-semibold">
              <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-ncr-plan" />계획</span>
              <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-ncr-actual" />실적·완료</span>
              <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-ncr-upcoming" />임박</span>
              <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-ncr-delay" />지연</span>
            </div>
          </div>
          <div className="space-y-2 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-14 text-[11px] font-bold text-muted-foreground">문서종류</span>
            {chip("전체", !search.docType, () => setSearch({ docType: undefined }))}
            {facets.docTypes.map((t) => chip(t, search.docType === t, () => setSearch({ docType: search.docType === t ? undefined : t })))}
            {facets.teams.length > 1 && (
              <>
                <span className="ml-3 w-8 text-[11px] font-bold text-muted-foreground">팀</span>
                {chip("전체", !search.team, () => setSearch({ team: undefined }))}
                {facets.teams.map((t) => chip(t, search.team === t, () => setSearch({ team: search.team === t ? undefined : t })))}
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-14 text-[11px] font-bold text-muted-foreground">협력사</span>
            {chip("전체", !search.sub, () => setSearch({ sub: undefined }))}
            {facets.subs.map((t) => chip(t, search.sub === t, () => setSearch({ sub: search.sub === t ? undefined : t })))}
          </div>
          </div>
          <div className="grid grid-cols-2 border-t border-border bg-muted/30">
            <Button variant="ghost" onClick={() => toList({})} className="h-auto rounded-none border-r border-border px-4 py-2.5">
              <ClipboardList className="size-4 text-ncr-plan" />
              <span className="text-[11px] text-muted-foreground">대상 문서</span>
              <strong className="ml-auto text-lg">{filtered.length.toLocaleString()}<small className="ml-1 text-[10px] font-medium text-muted-foreground">건</small></strong>
            </Button>
            <Button variant="ghost" onClick={() => toList({ stage: "Closed" })} className="h-auto rounded-none px-4 py-2.5">
              <CheckCircle2 className="size-4 text-ncr-actual" />
              <span className="text-[11px] text-muted-foreground">종결 완료</span>
              <strong className="ml-auto text-lg text-ncr-actual">{closed}<small className="ml-1 text-[10px] font-medium">건</small></strong>
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <div className="min-w-[1160px]">
              <div className="grid grid-cols-[140px_repeat(8,minmax(0,1fr))_100px] border-b border-border bg-muted/50">
                <div className="sticky left-0 z-10 flex items-center border-r border-border bg-muted px-3 py-3 text-[11px] font-bold uppercase text-foreground/70">구분</div>
                {stats.map((st) => (
                  <Button key={st.n} variant="ghost" onClick={() => toList({ stage: st.stage })} className="h-auto min-w-0 rounded-none border-r border-border px-2 py-2.5 hover:bg-ncr-plan-soft">
                    <span className="block min-w-0 text-center"><strong className="block text-sm text-foreground">PS{st.n}</strong><small className="mt-0.5 block truncate text-[10px] font-medium text-foreground/50">{PS_LABEL[st.n]}</small></span>
                  </Button>
                ))}
                <Button variant="ghost" onClick={() => toList({ stage: "Closed" })} className="h-auto rounded-none px-2 text-xs font-bold text-ncr-actual">Closed</Button>
              </div>

              <div className="grid grid-cols-[140px_repeat(8,minmax(0,1fr))_100px] border-b border-border">
                 <Button variant="ghost" onClick={() => toList({})} className="sticky left-0 z-10 h-auto rounded-none border-r border-border bg-card px-3"><span className="text-left"><strong className="block text-sm font-bold uppercase tracking-wide">Start</strong></span></Button>
                 {stats.map((st) => { const slot = `ps${st.n}s` as SlotKey; return <div key={st.n} className="min-w-0 border-r border-border hover:bg-ncr-plan-soft"><ProgressMetric plan={st.sPlan} actual={st.sAct} total={filtered.length} onDrill={(metric) => drill(slot, metric)} /></div>; })}
                <div className="bg-muted/20" />
              </div>

              <div className="grid grid-cols-[140px_repeat(8,minmax(0,1fr))_100px] border-b border-border">
                  <Button variant="ghost" onClick={() => toList({})} className="sticky left-0 z-10 h-auto rounded-none border-r border-border bg-card px-3"><span className="text-left"><strong className="block text-sm font-bold uppercase tracking-wide">In Progress</strong></span></Button>
                  {stats.map((st) => {
                    const slot = `ps${st.n}s` as SlotKey;
                    return <div key={st.n} className={`min-w-0 border-r border-border px-2 py-2 ${st.ongoing ? "bg-ncr-plan-soft/60" : ""}`}>
                      <Button variant="ghost" size="sm" onClick={() => drill(slot, "ongoing")} className={`mx-auto block h-7 px-2 text-xl font-bold ${st.ongoing ? "text-ncr-progress-actual" : "text-foreground/40"}`}>{st.ongoing}</Button>
                      <span className="mt-1 flex items-center justify-center gap-1 text-[10px] text-foreground/50">
                        <Button variant="ghost" size="sm" onClick={() => drill(slot, "ongoing")} className="h-5 px-1 text-[10px]">시작 후 미완료</Button>
                        {st.ongoingDelay > 0 && (
                          <Button variant="ghost" size="sm" onClick={() => drill(slot, "ongoingDelay")} className="h-5 px-1 text-[10px] font-bold text-ncr-delay" title="완료 계획일이 지났는데 아직 진행 중">
                            완료계획 경과 <b className="ml-0.5">{st.ongoingDelay}</b>
                          </Button>
                        )}
                      </span>
                    </div>;
                  })}
                  <div className="bg-muted/20" />
              </div>

              <div className="grid grid-cols-[140px_repeat(8,minmax(0,1fr))_100px] border-b-4 border-ncr-matrix/10">
                  <Button variant="ghost" onClick={() => toList({})} className="sticky left-0 z-10 h-auto rounded-none border-r border-border bg-card px-3"><span className="text-left"><strong className="block text-sm font-bold uppercase tracking-wide">Finish</strong></span></Button>
                 {stats.map((st) => { const slot = `ps${st.n}f` as SlotKey; return <div key={st.n} className="min-w-0 border-r border-border hover:bg-ncr-actual-soft"><ProgressMetric plan={st.fPlan} actual={st.fAct} total={filtered.length} onDrill={(metric) => drill(slot, metric)} /></div>; })}
                <div className="bg-muted/20" />
              </div>

              <div className="grid grid-cols-[140px_repeat(8,minmax(0,1fr))_100px] border-b-4 border-ncr-matrix/10">
                 <Button variant="ghost" onClick={() => toList({})} className="sticky left-0 z-10 h-auto rounded-none border-r border-border bg-card px-3"><span className="text-left"><strong className="block text-sm font-bold uppercase tracking-wide">Upcoming</strong><small className="text-[9px] text-muted-foreground">{within}일 이내 · 미착수</small></span></Button>
                {stats.map((st) => {
                  const total = st.upS + st.upF;
                  return <div key={st.n} className={`min-w-0 border-r border-border px-2 py-2 ${total ? "bg-ncr-upcoming-soft" : ""}`}>
                    <Button variant="ghost" size="sm" onClick={() => drill(`ps${st.n}s` as SlotKey, "upcomingBoth")} className={`mx-auto block h-7 px-2 text-xl font-bold ${total ? "text-ncr-upcoming" : "text-foreground/40"}`}>{total}</Button>
                    <span className="mt-1 flex justify-between text-[10px] text-foreground/50">
                      <Button variant="ghost" size="sm" onClick={() => drill(`ps${st.n}s` as SlotKey, "upcoming")} className="h-5 px-1 text-[10px]">Start <b className={st.upS ? "ml-1 text-ncr-upcoming" : "ml-1"}>{st.upS}</b></Button>
                      <Button variant="ghost" size="sm" onClick={() => drill(`ps${st.n}f` as SlotKey, "upcoming")} className="h-5 px-1 text-[10px]">Finish <b className={st.upF ? "ml-1 text-ncr-upcoming" : "ml-1"}>{st.upF}</b></Button>
                    </span>
                  </div>;
                })}
                <div className="bg-muted/20" />
              </div>

              <div className="grid grid-cols-[140px_repeat(8,minmax(0,1fr))_100px] border-b-4 border-ncr-matrix/10">
                 <Button variant="ghost" onClick={() => toList({})} className="sticky left-0 z-10 h-auto rounded-none border-r border-border bg-card px-3"><span className="text-left"><strong className="block text-sm font-bold uppercase tracking-wide">In Delay</strong><small className="text-[9px] text-muted-foreground">{asOf.replace(/-/g, ".")}</small></span></Button>
                {stats.map((st) => {
                  const total = st.sDelay + st.fDelay;
                  return <div key={st.n} className={`min-w-0 border-r border-border px-2 py-2 ${total ? "bg-ncr-delay-soft" : ""}`}>
                    <Button variant="ghost" size="sm" onClick={() => drill(`ps${st.n}s` as SlotKey, "delayBoth")} className={`mx-auto block h-7 px-2 text-xl font-bold ${total ? "text-ncr-delay" : "text-foreground/40"}`}>{total}</Button>
                    <span className="mt-1 flex justify-between text-[10px] text-foreground/50"><Button variant="ghost" size="sm" onClick={() => drill(`ps${st.n}s` as SlotKey, "delay")} className="h-5 px-1 text-[10px]">Start <b className={st.sDelay ? "ml-1 text-ncr-delay" : "ml-1"}>{st.sDelay}</b></Button><Button variant="ghost" size="sm" onClick={() => drill(`ps${st.n}f` as SlotKey, "delay")} className="h-5 px-1 text-[10px]">Finish <b className={st.fDelay ? "ml-1 text-ncr-delay" : "ml-1"}>{st.fDelay}</b></Button></span>
                  </div>;
                })}
                <div className="bg-muted/20" />
              </div>

              <div className="grid grid-cols-[140px_repeat(8,minmax(0,1fr))_100px] border-b-4 border-ncr-matrix/10">
                 <Button variant="ghost" onClick={() => toList({})} className="sticky left-0 z-10 h-auto rounded-none border-r border-border bg-card px-3"><ClipboardList className="size-4 text-ncr-plan" /><span className="text-left"><strong className="block text-xs uppercase text-foreground">Current Stage</strong><small className="text-[10px] text-foreground/50">자동 산출</small><span className="mt-1.5 flex items-center gap-1 text-[8px] font-medium text-foreground/50"><span>적음</span><i className="size-2 bg-ncr-stage-low" /><i className="size-2 bg-ncr-stage-mid" /><i className="size-2 bg-ncr-stage-high" /><i className="size-2 bg-ncr-stage-max" /><span>많음</span></span></span></Button>
                {stats.map((st) => <Button key={st.n} variant="ghost" onClick={() => toList({ stage: st.stage })} aria-label={`${st.stage} Current Stage ${st.cur}건`} className={`h-auto min-w-0 rounded-none border-r border-border px-2 py-3 transition-colors ${currentStageTone(st.cur, maxCurrent)}`}><span><strong className="block text-xl">{st.cur}</strong><small className="text-[10px] font-semibold opacity-90">건</small></span></Button>)}
                <Button variant="ghost" onClick={() => toList({ stage: "Closed" })} className="h-auto rounded-none bg-ncr-actual-soft px-2 py-3 hover:bg-ncr-actual-soft"><span><strong className="block text-xl text-ncr-actual">{closed}</strong><small className="text-[9px] font-medium text-ncr-actual">완료</small></span></Button>
              </div>

              <div className="grid grid-cols-[140px_repeat(8,minmax(0,1fr))_100px]">
                 <Button variant="ghost" onClick={() => drill("ps1s", "noplanAll")} className="sticky left-0 z-10 h-auto items-center gap-2 rounded-none border-r border-border bg-muted px-3 py-2.5 hover:bg-muted"><span className="text-left"><strong className="block text-sm font-bold uppercase tracking-wide text-foreground">No Plan</strong><small className="text-[10px] text-foreground/50">계획일 없음</small></span></Button>
                {stats.map((st) => (
                  <div key={st.n} className={`min-w-0 border-r border-border text-center ${st.noPlan ? "bg-muted/60" : ""}`}>
                    <Button variant="ghost" onClick={() => drill(`ps${st.n}s` as SlotKey, "noplan")} aria-label={`PS${st.n} 계획 미수립 ${st.noPlan}건`} className="h-auto w-full flex-col gap-0 rounded-none px-2 py-2.5">
                      <strong className={`block text-lg ${st.noPlan ? "text-foreground" : "text-foreground/35"}`}>{st.noPlan}</strong>
                      <small className="text-[10px] font-medium text-foreground/50">건</small>
                    </Button>
                  </div>
                ))}
                <div className={`text-center ${noPlanTotal ? "bg-muted/60" : ""}`}>
                  <Button variant="ghost" onClick={() => drill("ps1s", "noplanAll")} aria-label={`전 단계 계획 미수립 ${noPlanTotal}건`} className="h-auto w-full flex-col gap-0 rounded-none px-2 py-2.5">
                    <strong className={`block text-lg ${noPlanTotal ? "text-foreground" : "text-foreground/35"}`}>{noPlanTotal}</strong>
                    <small className="text-[10px] font-medium text-foreground/50">전 단계</small>
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <div className="border-t border-border bg-muted/30 px-4 py-2 text-[10px] text-muted-foreground">각 수치 영역을 누르면 해당 Progress Stage의 NCR 리스트로 이동합니다.</div>
        </div>
      </AppShell>
    </AdminGate>
  );
}
