import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import * as XLSX from "xlsx";
import { Download } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AdminGate } from "@/components/manpower/admin-gate";
import { Kpi } from "@/routes/_authenticated/manpower.index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { manpowerRangeQuery, useManpower } from "@/lib/use-manpower";
import { RESULT_ORDER, addDays, fmtDay, riyadhToday, verificationStats, type CompareRow } from "@/lib/manpower-model";
import { MP, RESULT_LABEL } from "@/lib/manpower-i18n";
import { CompareDiffCharts } from "@/components/manpower/compare-diff-charts";

const search = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cmpFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  result: z.enum(["ALL", "MATCH", "DIFF", "HDEC ONLY", "NOT COUNTED"]).optional(),
});

/** 차트 기본 기간: 기준일 포함 최근 14일 */
const chartFrom = (day: string, from?: string) => from ?? addDays(day, -13);

export const Route = createFileRoute("/_authenticated/manpower/compare")({
  head: () => ({ meta: [
    { title: "출면 검증 대조 | HMMME 통합 공정 관리" },
    { name: "description", content: "협력사 보고 인원과 HDEC 현장 재집계 인원을 장소·조 단위로 대조해 차이를 확인합니다." },
    { property: "og:title", content: "HMMME 출면 검증 대조" },
    { property: "og:description", content: "보고와 재집계의 차이를 한눈에 확인하세요." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  validateSearch: (s: unknown) => search.parse(s),
  loaderDeps: ({ search: s }) => ({ day: s.day ?? riyadhToday() }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(manpowerRangeQuery(deps.day, deps.day)),
  errorComponent: ({ error }) => <div role="alert" className="p-8 text-sm">대조 데이터를 불러오지 못했습니다. {(error as Error).message}</div>,
  component: ComparePage,
});

const TONE: Record<CompareRow["result"], string> = {
  MATCH: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  DIFF: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "HDEC ONLY": "bg-destructive/10 text-destructive",
  "NOT COUNTED": "bg-muted text-muted-foreground",
};

function ComparePage() {
  const s = Route.useSearch();
  const navigate = Route.useNavigate();
  const day = s.day ?? riyadhToday();
  const filter = s.result ?? "ALL";
  const { compare } = useManpower(day, day);
  const [q, setQ] = useState("");

  const rows = useMemo(() => compare.filter((r) => r.report_date === day), [compare, day]);
  const stats = useMemo(() => verificationStats(rows), [rows]);
  const shown = useMemo(
    () => rows
      .filter((r) => (filter === "ALL" || r.result === filter) && (!q || `${r.company} ${r.location}`.toLowerCase().includes(q.toLowerCase())))
      .sort((a, b) => RESULT_ORDER[a.result] - RESULT_ORDER[b.result] || a.company.localeCompare(b.company) || a.location.localeCompare(b.location)),
    [rows, filter, q],
  );

  const exportXlsx = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(shown.map((r) => ({
      협력사: r.company, 보고일: r.report_date, 장소: r.location, 조: r.shift,
      협력사보고: r.reported, HDEC재집계: r.verified, 차이: r.diff, 판정: RESULT_LABEL[r.result],
      보고자: r.sub_reporter, HDEC확인자: r.hdec_counter,
    }))), "검증대조");
    XLSX.writeFile(wb, `HMMME_출면검증_${day.replace(/-/g, "")}.xlsx`);
  };

  const setResult = (v: string) => navigate({ search: (p) => ({ ...p, result: v as never }), replace: true });

  return (
    <AdminGate title="검증 대조">
    <AppShell
      title={MP.compare}
      desc={`${fmtDay(day)} · 대조 ${rows.length}건 · 일치율 ${Math.round(stats.matchRate * 100)}%`}
      actions={
        <>
          <Input type="date" aria-label="보고일" value={day} onChange={(e) => navigate({ search: (p) => ({ ...p, day: e.target.value }), replace: true })} className="h-8 w-[150px] text-xs" />
          <Button size="sm" variant="outline" onClick={exportXlsx}><Download className="size-3.5" />엑셀</Button>
        </>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={MP.coverage} value={`${Math.round(stats.coverage * 100)}%`} sub={`${stats.coveredCards} / ${stats.subCards} 카드 검증`} />
        <Kpi label="일치율" value={`${Math.round(stats.matchRate * 100)}%`} />
        <Kpi label="평균 절대차" value={stats.avgAbsDiff.toFixed(1)} sub="차이가 난 카드 기준" />
        <Kpi label={MP.hdecOnly} value={String(stats.hdecOnly)} sub="보고 없이 현장에서 확인" tone={stats.hdecOnly ? "warn" : "ok"} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["ALL", "DIFF", "HDEC ONLY", "NOT COUNTED", "MATCH"] as const).map((v) => (
          <Button key={v} size="sm" variant={filter === v ? "default" : "outline"} onClick={() => setResult(v)} className="h-7 text-xs">
            {v === "ALL" ? "전체" : RESULT_LABEL[v]}
            <span className="ml-1 opacity-70">{v === "ALL" ? rows.length : rows.filter((r) => r.result === v).length}</span>
          </Button>
        ))}
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="협력사·장소 검색" className="h-8 max-w-[200px] text-xs" />
      </div>

      <section className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[820px] text-xs">
          <caption className="sr-only">협력사 보고와 HDEC 재집계 대조</caption>
          <thead className="bg-muted/60">
            <tr className="[&>th]:border-b [&>th]:border-border [&>th]:px-2 [&>th]:py-2 [&>th]:text-left">
              <th scope="col">{MP.company}</th><th scope="col">{MP.location}</th><th scope="col">{MP.shift}</th>
              <th scope="col" className="!text-right">{MP.reported}</th>
              <th scope="col" className="!text-right">{MP.verified}</th>
              <th scope="col" className="!text-right">{MP.diff}</th>
              <th scope="col">{MP.result}</th><th scope="col">{MP.reporter}</th><th scope="col">{MP.counter}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i} className="[&>td]:border-b [&>td]:border-border/60 [&>td]:px-2 [&>td]:py-1.5">
                <td className="font-medium">{r.company}</td><td>{r.location}</td><td>{r.shift}</td>
                <td className="text-right">{r.reported ?? "—"}</td>
                <td className="text-right">{r.verified ?? "—"}</td>
                <td className={`text-right font-bold ${(r.diff ?? 0) < 0 ? "text-destructive" : (r.diff ?? 0) > 0 ? "text-emerald-600" : ""}`}>
                  {r.diff == null ? "—" : r.diff > 0 ? `+${r.diff}` : r.diff}
                </td>
                <td><span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${TONE[r.result]}`}>{RESULT_LABEL[r.result]}</span></td>
                <td className="text-muted-foreground">{r.sub_reporter ?? "—"}</td>
                <td className="text-muted-foreground">{r.hdec_counter ?? "—"}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">해당 조건의 대조 자료가 없습니다.</td></tr>}
          </tbody>
        </table>
      </section>
    </AppShell>
    </AdminGate>
  );
}
