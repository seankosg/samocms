import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { ScheduleTable } from "@/components/schedule-table";
import { ProgressRiskAnalysis } from "@/components/dashboard/progress-risk-analysis";
import { ForecastChart } from "@/components/dashboard/forecast-chart";
import { projectQuery, useProject } from "@/lib/use-project";
import {
  applyBaseline, avgOf, fmtDate, isDone, isLate, milestoneDates, MSDEF, OWNER_SLOT, pct1, type Row,
} from "@/lib/schedule-model";

type OwnerSearch = { base?: string };

export const Route = createFileRoute("/_authenticated/owner/")({
  head: () => ({ meta: [
    { title: "발주처 공정현황 | HMMME PROJECT CMS" },
    { name: "description", content: "발주처(HMMME) 업역 공정의 부서별·건물별 진도, 지연 현황과 완료 예측을 확인합니다." },
    { property: "og:title", content: "HMMME 발주처 공정현황" },
    { property: "og:description", content: "발주처 업역 공정의 진도·지연·예측 대시보드." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  validateSearch: (raw: Record<string, unknown>): OwnerSearch =>
    typeof raw["base"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw["base"]) ? { base: raw["base"] } : {},
  loader: ({ context }) => context.queryClient.ensureQueryData(projectQuery),
  errorComponent: () => <div role="alert" className="p-8">발주처 공정 데이터를 불러오지 못했습니다.</div>,
  component: OwnerDashboard,
});

const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "");

function group(rows: Row[], key: (r: Row) => string) {
  const m = new Map<string, Row[]>();
  rows.forEach((r) => {
    const k = key(r) || "미지정";
    m.set(k, [...(m.get(k) ?? []), r]);
  });
  return [...m.entries()]
    .map(([label, list]) => ({
      label,
      total: list.length,
      done: list.filter(isDone).length,
      late: list.filter(isLate).length,
      pc: avgOf(list.filter((r) => r.pl != null || r.pc != null), "pc"),
    }))
    .sort((a, b) => b.total - a.total);
}

function OwnerDashboard() {
  const { ownerRows, batches, base: globalBase } = useProject();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  /** 발주처 파일 기준일 → 없으면 전사 기준일 */
  const fileBase = batches.find((b) => b.kind === "schedule" && b.slot === OWNER_SLOT)?.file_date ?? null;
  const base = search.base ?? fileBase ?? globalBase;

  const rows = useMemo(() => applyBaseline(ownerRows, base), [ownerRows, base]);
  const withP = rows.filter((r) => r.pl != null || r.pc != null);
  const late = withP.filter(isLate);
  const done = rows.filter(isDone);
  const msDates = milestoneDates(rows);

  const byDept = useMemo(() => group(rows, (r) => r.ownerDept ?? r.dept), [rows]);
  const byBldg = useMemo(() => group(rows, (r) => r.bldg ?? "미지정"), [rows]);
  const byMs = useMemo(() => {
    const keys = [...new Set(rows.map((r) => r.ms ?? "미지정"))].sort((a, b) => {
      const an = /^M(\d+)$/.exec(a), bn = /^M(\d+)$/.exec(b);
      if (an && bn) return Number(an[1]) - Number(bn[1]);
      if (an) return -1;
      if (bn) return 1;
      return a.localeCompare(b, "ko");
    });
    return keys.map((k) => {
      const list = rows.filter((r) => (r.ms ?? "미지정") === k);
      return {
        key: k, name: MSDEF[k] ?? "", due: msDates[k] ?? null, total: list.length,
        done: list.filter(isDone).length, late: list.filter(isLate).length,
      };
    });
  }, [rows, msDates]);

  return (
    <AppShell
      title="발주처 공정현황"
      desc={`기준일 ${fmtDate(base)} · HMMME 업역 ${rows.length.toLocaleString()}개 활동`}
      actions={
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">기준일</span>
          <Input
            type="date" aria-label="발주처 기준일" value={base} className="h-8 w-[150px] text-xs"
            onChange={(e) => navigate({ search: e.target.value ? { base: e.target.value } : {} })}
          />
          {search.base && (
            <button type="button" className="text-xs font-semibold text-primary underline" onClick={() => navigate({ search: {} })}>
              파일 기준일로
            </button>
          )}
        </div>
      }
    >
      <section className="grid gap-3 xl:grid-cols-3">
        <div className="grid gap-4 rounded-md border border-border bg-card p-4 shadow-sm sm:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="text-xs font-bold text-muted-foreground">완료현황</p>
            <p className="mt-1 flex flex-wrap items-baseline gap-1.5">
              <span className="text-3xl font-bold"><Drill search={{ status: "done" }}>{done.length.toLocaleString()}</Drill></span>
              <span className="text-lg font-semibold text-muted-foreground">{pct1(rows.length ? done.length / rows.length : 0)}%</span>
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              전체 <Drill className="font-semibold text-foreground">{rows.length.toLocaleString()}</Drill>행
            </p>
            <Bar v={rows.length ? done.length / rows.length : 0} className="mt-3" />
          </div>
          <div className="border-t border-border pt-2 text-[11px] sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
            <div className="grid grid-cols-4 gap-1 pb-1 text-right text-muted-foreground">
              <span />{["계획", "실적", "차이"].map((h) => <span key={h}>{h}</span>)}
            </div>
            {kpiDept.map((s) => (
              <div key={s.dept} className="grid grid-cols-4 gap-1 border-t border-border/60 py-1 text-right">
                <span className="text-left font-semibold"><Drill search={{ dept: s.dept }}>{s.dept}</Drill></span>
                <span><Drill search={{ dept: s.dept, duebyBase: true }}>{s.plan}</Drill></span>
                <span className="font-bold"><Drill search={{ dept: s.dept, status: "done" }}>{s.act}</Drill></span>
                <span className={`font-semibold ${gapCls(s.gap)}`}><Drill search={{ dept: s.dept, duebyBase: true }}>{sign(s.gap)}{Math.abs(s.gap)}</Drill></span>
              </div>
            ))}
            <p className="mt-1 text-right text-[9px] text-muted-foreground">계획 = 기준일 내 완료 예정 · 실적 = 완료</p>
          </div>
        </div>

        <div className="grid gap-4 rounded-md border border-primary/30 bg-primary/5 p-4 shadow-sm sm:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="text-xs font-bold text-muted-foreground">계획 대비 실적</p>
            <p className="mt-1 flex flex-wrap items-baseline gap-1.5">
              <span className="text-3xl font-bold"><Drill>{pct1(avgOf(withP, "pc"))}%</Drill></span>
              <span className="text-sm text-muted-foreground">/ <Drill>{pct1(avgOf(withP, "pl"))}%</Drill></span>
              <span className={`text-xs font-bold ${gapCls(avgOf(withP, "pc") - avgOf(withP, "pl"))}`}>
                {sign(avgOf(withP, "pc") - avgOf(withP, "pl"))}{pct1(Math.abs(avgOf(withP, "pc") - avgOf(withP, "pl")))}p
              </span>
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">평균 진도 · 대상 <span className="font-semibold text-foreground">{withP.length.toLocaleString()}</span>행</p>
            <Bar v={avgOf(withP, "pc")} marker={avgOf(withP, "pl")} className="mt-3" />
          </div>
          <div className="border-t border-border pt-2 text-[11px] sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
            <div className="grid grid-cols-4 gap-1 pb-1 text-right text-muted-foreground">
              <span />{["계획", "실적", "차이"].map((h) => <span key={h}>{h}</span>)}
            </div>
            {kpiDept.map((s) => (
              <div key={s.dept} className="grid grid-cols-4 gap-1 border-t border-border/60 py-1 text-right">
                <span className="text-left font-semibold"><Drill search={{ dept: s.dept }}>{s.dept}</Drill></span>
                {s.n === 0 ? <><span className="text-muted-foreground">—</span><span className="text-muted-foreground">—</span><span className="text-muted-foreground">—</span></> : (
                  <>
                    <span>{pct1(s.pl)}</span>
                    <span className="font-bold">{pct1(s.pc)}</span>
                    <span className={`font-semibold ${gapCls(s.pc - s.pl)}`}>{sign(s.pc - s.pl)}{pct1(Math.abs(s.pc - s.pl))}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 rounded-md border border-destructive/30 bg-destructive/5 p-4 shadow-sm sm:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="text-xs font-bold text-muted-foreground">지연</p>
            <p className="mt-1 text-3xl font-bold text-destructive">
              <Drill search={{ status: "delay" }}>{late.length.toLocaleString()}</Drill>
              <span className="ml-1 text-sm font-semibold text-muted-foreground">건</span>
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              대상 <span className="font-semibold text-foreground">{withP.length.toLocaleString()}</span>행 중 ·{" "}
              <b className="text-foreground"><Drill search={{ status: "delay" }}>{pct1(withP.length ? late.length / withP.length : 0)}%</Drill></b>
            </p>
            <Bar v={withP.length ? late.length / withP.length : 0} tone="bad" className="mt-3" />
          </div>
          <div className="border-t border-border pt-2 text-[11px] sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
            <div className="grid grid-cols-[1fr_auto_60px] gap-2 pb-1 text-right text-muted-foreground"><span /><span>지연</span><span>비교</span></div>
            {kpiDept.map((s) => (
              <div key={s.dept} className="grid grid-cols-[1fr_auto_60px] items-center gap-2 border-t border-border/60 py-1">
                <span className="font-semibold"><Drill search={{ dept: s.dept, status: "delay" }}>{s.dept}</Drill></span>
                <span className={`text-right font-bold ${s.late ? "text-destructive" : "text-muted-foreground"}`}>
                  <Drill search={{ dept: s.dept, status: "delay" }}>{s.late}</Drill>
                </span>
                <span className="h-1.5 overflow-hidden rounded bg-muted">
                  <span className="block h-full bg-destructive" style={{ width: `${(s.late / maxLate) * 100}%` }} />
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-4 grid gap-3 lg:grid-cols-2">
        {[{ title: "부서별", list: byDept }, { title: "건물별", list: byBldg }].map((blk) => (
          <div key={blk.title} className="rounded-md border border-border bg-card shadow-sm">
            <p className="border-b border-border px-3 py-2 text-xs font-bold">{blk.title} 현황</p>
            <div className="max-h-[300px] overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-secondary text-secondary-foreground">
                  <tr>{["구분", "활동", "완료", "지연", "평균 실적"].map((h) => (
                    <th key={h} className="border-b border-border px-3 py-2 font-bold">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {blk.list.map((g) => (
                    <tr key={g.label} className="border-b border-border">
                      <td className="px-3 py-1.5 font-semibold">{g.label}</td>
                      <td className="px-3 py-1.5 tabular-nums">{g.total.toLocaleString()}</td>
                      <td className="px-3 py-1.5 tabular-nums">{g.done.toLocaleString()}</td>
                      <td className={`px-3 py-1.5 tabular-nums ${g.late ? "font-bold text-destructive" : "text-muted-foreground"}`}>{g.late.toLocaleString()}</td>
                      <td className="px-3 py-1.5 tabular-nums">{pct1(g.pc)}%</td>
                    </tr>
                  ))}
                  {!blk.list.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">데이터가 없습니다.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </section>

      <section className="mt-4 rounded-md border border-border bg-card shadow-sm">
        <p className="border-b border-border px-3 py-2 text-xs font-bold">마일스톤별 현황</p>
        <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-4">
          {byMs.map((ms) => (
            <div key={ms.key} className="rounded-md border border-border/70 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <strong className="text-lg font-extrabold tracking-tight">{ms.key}</strong>
                <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-bold tabular-nums">{fmtDate(ms.due)}</span>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{ms.name || "—"}</p>
              <p className="mt-1.5 text-xs">
                활동 <b>{ms.total.toLocaleString()}</b> · 완료 <b>{ms.done.toLocaleString()}</b>
                {" "}· 지연 <b className={ms.late ? "text-destructive" : ""}>{sign(0)}{ms.late.toLocaleString()}</b>
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-4">
        <ProgressRiskAnalysis rows={rows} base={base} ownerMode />
      </div>

      <div className="mt-4">
        <ForecastChart
          rows={rows} tcItems={[]} base={base}
          slots={byDept.map((d) => d.label)}
          rowScope={() => true} modes={["discipline", "milestone"]} groupBy="dept"
        />

      </div>

      <section className="mt-4">
        <p className="mb-2 text-xs font-bold">
          지연 리스트 <span className="font-normal text-muted-foreground">기준일 {fmtDate(base)} · {late.length.toLocaleString()}건</span>
          <Link to="/owner/list" className="ml-2 font-semibold text-primary underline">발주처 공정 리스트 보기</Link>
        </p>
        <ScheduleTable rows={rows} fileName="HMMME_발주처_지연리스트.xlsx" lockLate />
      </section>
    </AppShell>
  );
}
