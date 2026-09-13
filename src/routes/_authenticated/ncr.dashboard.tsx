import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { AdminGate } from "@/components/manpower/admin-gate";
import { Input } from "@/components/ui/input";
import { useNcrItems, ncrQuery } from "@/lib/use-ncr";
import type { NcrItem } from "@/lib/ncr.functions";
import { PS_NUMS, PS_LABEL, planField, actualField, currentStage, isStartDelayed, type SlotKey, type NcrDates } from "@/lib/ncr-model";

const searchSchema = z.object({
  docType: z.string().optional(),
  team: z.string().optional(),
  sub: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/ncr/dashboard")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({ meta: [
    { title: "NCR 대시보드 | HMMME PROJECT CMS" },
    { name: "description", content: "NCR·OR·SOR의 PS1~PS9 단계별 진행·지연·현재단계 현황을 한눈에 봅니다." },
    { property: "og:title", content: "HMMME NCR 대시보드" },
    { property: "og:description", content: "준공 준비 문서의 단계별 진행·지연 KPI." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(ncrQuery),
  errorComponent: ({ error }) => <div role="alert" className="p-8 text-sm">NCR 대시보드를 불러오지 못했습니다. {(error as Error).message}</div>,
  component: NcrDashboardPage,
});

const dates = (r: NcrItem) => r as unknown as NcrDates;

function NcrDashboardPage() {
  const items = useNcrItems();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const goList = useNavigate();
  const [asOf, setAsOf] = useState(() => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10)); // 제다 기준 오늘

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

  const stats = useMemo(() => PS_NUMS.map((n) => {
    const s = `ps${n}s` as SlotKey;
    const f = `ps${n}f` as SlotKey;
    let sPlan = 0, sAct = 0, fPlan = 0, fAct = 0, sDelay = 0, fDelay = 0, cur = 0;
    for (const r of filtered) {
      const d = dates(r);
      if (d[planField(s)] && d[planField(s)]! <= asOf) sPlan += 1;
      if (d[actualField(s)]) sAct += 1;
      if (d[planField(f)] && d[planField(f)]! <= asOf) fPlan += 1;
      if (d[actualField(f)]) fAct += 1;
      if (isStartDelayed(d, s, asOf)) sDelay += 1;
      if (isStartDelayed(d, f, asOf)) fDelay += 1;
      const c = currentStage(d);
      if (c.startsWith(`PS${n}`)) cur += 1;
    }
    return { n, stage: "PS" + n, sPlan, sAct, fPlan, fAct, sDelay, fDelay, cur };
  }), [filtered, asOf]);

  const closed = filtered.filter((r) => currentStage(dates(r)) === "Closed").length;

  const chip = (label: string, active: boolean, onClick: () => void) => (
    <button
      key={label}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-accent"}`}
    >
      {label}
    </button>
  );

  const toList = (params: Record<string, string>) => goList({ to: "/ncr", search: params });

  return (
    <AdminGate title="NCR 대시보드" desc="준공 준비 기능은 현재 관리자(Admin)에게만 제공됩니다.">
      <AppShell
        title="NCR 대시보드"
        desc={`PS1~PS9 단계별 진행 · 지연 · 현재단계 현황 — 카드를 누르면 해당 리스트로 이동합니다`}
        actions={
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            기준일
            <Input type="date" value={asOf} onChange={(e) => e.target.value && setAsOf(e.target.value)} className="h-8 w-36 text-xs" />
          </label>
        }
      >
        {/* 필터 */}
        <div className="mb-3 space-y-2 rounded-md border border-border bg-card p-3">
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
            <span className="ml-auto text-[11px] text-muted-foreground">
              대상 <b className="text-foreground">{filtered.length.toLocaleString()}</b>건 · 종결 <b className="text-primary">{closed}</b>건
            </span>
          </div>
        </div>

        {/* 1행 — Progress Stage (PS별 Start/Finish 계획·실적) */}
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Progress Stage — Start / Finish 계획(P) 대비 실적(A)</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-9">
          {stats.map((st) => {
            const pct = st.fPlan ? Math.round((st.fAct / Math.max(st.fPlan, st.fAct)) * 100) : null;
            return (
              <button
                key={st.n}
                onClick={() => toList({ stage: st.stage, ...(search.docType ? { docType: search.docType } : {}), ...(search.sub ? { sub: search.sub } : {}) }) }}
                className="rounded-md border border-border bg-card p-2.5 text-left shadow-sm transition-colors hover:border-primary/50 hover:bg-accent/30"
              >
                <p className="flex items-baseline justify-between">
                  <strong className="text-xs">PS{st.n}</strong>
                  <span className="truncate text-[9px] text-muted-foreground">{PS_LABEL[st.n]}</span>
                </p>
                <div className="mt-2 space-y-1.5 text-[10px]">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-muted-foreground">Start</span>
                    <span><b>{st.sAct}</b><span className="text-muted-foreground"> / {st.sPlan}</span></span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-muted-foreground">Finish</span>
                    <span><b className="text-primary">{st.fAct}</b><span className="text-muted-foreground"> / {st.fPlan}</span></span>
                  </div>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${pct ?? 0}%` }} />
                </div>
                <p className="mt-1 text-right text-[9px] text-muted-foreground">A / P · {pct ?? 0}%</p>
              </button>
            );
          })}
        </div>

        {/* 2행 — 지연 현황 */}
        <p className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">지연 현황 — 기준일({asOf.replace(/-/g, ".")}) 경과 & 실적 없음</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-9">
          {stats.map((st) => {
            const total = st.sDelay + st.fDelay;
            return (
              <button
                key={st.n}
                onClick={() => toList({ stage: st.stage, ...(search.docType ? { docType: search.docType } : {}), ...(search.sub ? { sub: search.sub } : {}) })}
                className={`rounded-md border p-2.5 text-left shadow-sm transition-colors ${total ? "border-destructive/50 bg-destructive/5 hover:bg-destructive/10" : "border-border bg-card hover:bg-accent/30"}`}
              >
                <p className="flex items-baseline justify-between">
                  <strong className="text-xs">PS{st.n}</strong>
                  <b className={`text-lg ${total ? "text-destructive" : "text-muted-foreground"}`}>{total}</b>
                </p>
                <div className="mt-1.5 space-y-1 text-[10px]">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Start 지연</span>
                    <b className={st.sDelay ? "text-destructive" : "text-muted-foreground"}>{st.sDelay}</b>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Finish 지연</span>
                    <b className={st.fDelay ? "text-destructive" : "text-muted-foreground"}>{st.fDelay}</b>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* 3행 — 현재단계 분포 */}
        <p className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">현재단계 — 자동 산출된 Current Stage 기준 건수</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-10">
          {stats.map((st) => (
            <button
              key={st.n}
              onClick={() => toList({ stage: st.stage, ...(search.docType ? { docType: search.docType } : {}), ...(search.sub ? { sub: search.sub } : {}) })}
              className="rounded-md border border-border bg-card p-2.5 text-left shadow-sm transition-colors hover:border-primary/50 hover:bg-accent/30"
            >
              <p className="flex items-baseline justify-between">
                <strong className="text-xs">PS{st.n}</strong>
                <b className={`text-lg ${st.cur ? "text-chart-4" : "text-muted-foreground"}`}>{st.cur}</b>
              </p>
              <p className="mt-1 truncate text-[9px] text-muted-foreground">{PS_LABEL[st.n]}</p>
            </button>
          ))}
          <button
            onClick={() => toList({ stage: "Closed", ...(search.docType ? { docType: search.docType } : {}), ...(search.sub ? { sub: search.sub } : {}) })}
            className="rounded-md border border-primary/40 bg-primary/5 p-2.5 text-left shadow-sm transition-colors hover:bg-primary/10"
          >
            <p className="flex items-baseline justify-between">
              <strong className="text-xs">Closed</strong>
              <b className="text-lg text-primary">{closed}</b>
            </p>
            <p className="mt-1 text-[9px] text-muted-foreground">종결 완료</p>
          </button>
        </div>
      </AppShell>
    </AdminGate>
  );
}
