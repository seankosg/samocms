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
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { k: "전체", v: rows.length.toLocaleString(), s: "HMMME 업역 활동" },
          { k: "완료", v: done.length.toLocaleString(), s: `${pct1(rows.length ? done.length / rows.length : 0)}%` },
          { k: "평균 진도", v: `${pct1(avgOf(withP, "pc"))}%`, s: `계획 ${pct1(avgOf(withP, "pl"))}%` },
          { k: "지연", v: late.length.toLocaleString(), s: `대상 ${withP.length.toLocaleString()}행` },
        ].map((c) => (
          <div key={c.k} className="rounded-md border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-bold text-muted-foreground">{c.k}</p>
            <p className="mt-1 text-3xl font-bold">{c.v}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{c.s}</p>
          </div>
        ))}
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
        <ProgressRiskAnalysis rows={rows} base={base} />
      </div>

      <div className="mt-4">
        <ForecastChart rows={rows} tcItems={[]} base={base} slots={[OWNER_SLOT]} rowScope={() => true} modes={["discipline", "milestone"]} />
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
