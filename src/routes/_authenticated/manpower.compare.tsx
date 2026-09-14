import { useCallback, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Download } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ExportDialog, type ExportRow } from "@/components/export-dialog";

import { Kpi } from "@/routes/_authenticated/manpower.index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { manpowerRangeQuery, useManpower } from "@/lib/use-manpower";
import { RESULT_ORDER, addDays, deptDot, fmtDay, reporterLabel, riyadhToday, verificationStats, type CompareRow } from "@/lib/manpower-model";
import { CardHistoryButton } from "@/components/manpower/card-history";
import { MP, RESULT_LABEL } from "@/lib/manpower-i18n";
import { CompareDiffCharts } from "@/components/manpower/compare-diff-charts";
import { MultiSelectFilter, matchMulti } from "@/components/column-filter";

const search = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cmpFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  result: z.enum(["ALL", "MATCH", "DIFF", "HDEC ONLY", "NOT COUNTED"]).optional(),
});

/** 차트 기본 기간: 기준일 포함 최근 14일 */
const chartFrom = (day: string, from?: string) => from ?? addDays(day, -13);

export const Route = createFileRoute("/_authenticated/manpower/compare")({
  head: () => ({ meta: [
    { title: "출면 검증 대조 | HMMME PROJECT CMS" },
    { name: "description", content: "협력사 보고 인원과 HDEC 현장 재집계 인원을 장소·조 단위로 대조해 차이를 확인합니다." },
    { property: "og:title", content: "HMMME 출면 검증 대조" },
    { property: "og:description", content: "보고와 재집계의 차이를 한눈에 확인하세요." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  validateSearch: (s: unknown) => search.parse(s),
  loaderDeps: ({ search: s }) => {
    const day = s.day ?? riyadhToday();
    return { day, from: chartFrom(day, s.cmpFrom) };
  },
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(manpowerRangeQuery(deps.from, deps.day)),
  errorComponent: ({ error }) => <div role="alert" className="p-8 text-sm">대조 데이터를 불러오지 못했습니다. {(error as Error).message}</div>,
  component: ComparePage,
});

const TONE: Record<CompareRow["result"], string> = {
  MATCH: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  DIFF: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "HDEC ONLY": "bg-destructive/10 text-destructive",
  "NOT COUNTED": "bg-muted text-muted-foreground",
};

type ColumnFilterKey = "company" | "location" | "shift" | "reported" | "hse_verified" | "exe_verified" | "hse_diff" | "exe_diff" | "hse_result" | "exe_result" | "sub_reporter" | "hse_counter" | "exe_counter";

const columnValue = (row: CompareRow, key: ColumnFilterKey): unknown => row[key];

function ComparePage() {
  const s = Route.useSearch();
  const navigate = Route.useNavigate();
  const day = s.day ?? riyadhToday();
  const filter = s.result ?? "ALL";
  const from = chartFrom(day, s.cmpFrom);
  const { compare, memberMap } = useManpower(from, day);
  const [q, setQ] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [columnFilters, setColumnFilters] = useState<Partial<Record<ColumnFilterKey, string[]>>>({});

  const rows = useMemo(() => compare.filter((r) => r.report_date === day), [compare, day]);
  const stats = useMemo(() => verificationStats(rows), [rows]);
  const searchedRows = useMemo(
    () => rows.filter((r) => (filter === "ALL" || r.result === filter) && (!q || `${r.company} ${r.location}`.toLowerCase().includes(q.toLowerCase()))),
    [rows, filter, q],
  );
  const facet = useCallback((key: ColumnFilterKey) => {
    const counts = new Map<string, number>();
    for (const row of searchedRows) {
      const value = String(columnValue(row, key) ?? "").trim();
      const token = value || "__EMPTY__";
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    return [...counts].map(([value, count]) => ({ value, count }));
  }, [searchedRows]);
  const setColumnFilter = (key: ColumnFilterKey, value: string[] | undefined) =>
    setColumnFilters((current) => ({ ...current, [key]: value }));
  const shown = useMemo(
    () => searchedRows
      .filter((r) => (Object.entries(columnFilters) as [ColumnFilterKey, string[] | undefined][])
        .every(([key, selected]) => matchMulti(columnValue(r, key), selected)))
      .sort((a, b) => RESULT_ORDER[a.result] - RESULT_ORDER[b.result] || a.company.localeCompare(b.company) || a.location.localeCompare(b.location)),
    [searchedRows, columnFilters],
  );

  const exportRows = useCallback((): ExportRow[] => shown.map((r) => ({
    group: r.company,
    rec: {
      Company: r.company,
      "Report Date": r.report_date,
      Location: r.location,
      Shift: r.shift,
      "Subcon Report": r.reported,
      "HDEC HSE Count": r.hse_verified,
      "HDEC Exe Count": r.exe_verified,
      "Diff (HSE)": r.hse_diff,
      "Diff (EXE)": r.exe_diff,
      "Result (HSE)": r.hse_result,
      "Result (EXE)": r.exe_result,
      Reporter: reporterLabel(memberMap, r.sub_reporter_tg_id, r.sub_reporter).text,
      "HSE Counter": reporterLabel(memberMap, r.hse_counter_tg_id, r.hse_counter).text,
      "EXE Counter": reporterLabel(memberMap, r.exe_counter_tg_id, r.exe_counter).text,
    },
  })), [shown, memberMap]);

  const exportStamp = useMemo(() => {
    const value = new Date(`${day}T00:00:00Z`);
    const dd = String(value.getUTCDate()).padStart(2, "0");
    const mmm = value.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
    return `${dd}-${mmm}-${value.getUTCFullYear()}`;
  }, [day]);

  const setResult = (v: string) => navigate({ search: (p) => ({ ...p, result: v as never }), replace: true });

  return (
    <AppShell
      title={MP.compare}
      desc={`${fmtDay(day)} · 대조 ${rows.length}건 · 일치율 ${Math.round(stats.matchRate * 100)}%`}
      actions={
        <>
          <Input type="date" aria-label="차트 시작일" value={from} max={day}
            onChange={(e) => navigate({ search: (p) => ({ ...p, cmpFrom: e.target.value }), replace: true })}
            className="h-8 w-[150px] text-xs" />
          <span className="text-xs text-muted-foreground">~</span>
          <Input type="date" aria-label="보고일" value={day} onChange={(e) => navigate({ search: (p) => ({ ...p, day: e.target.value }), replace: true })} className="h-8 w-[150px] text-xs" />
        </>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={MP.coverage} value={`${Math.round(stats.coverage * 100)}%`} sub={`${stats.coveredCards} / ${stats.subCards} 카드 검증`} />
        <Kpi label="일치율" value={`${Math.round(stats.matchRate * 100)}%`} />
        <Kpi label="평균 절대차" value={stats.avgAbsDiff.toFixed(1)} sub="차이가 난 카드 기준" />
        <Kpi label={MP.hdecOnly} value={String(stats.hdecOnly)} sub="보고 없이 현장에서 확인" tone={stats.hdecOnly ? "warn" : "ok"} />
      </div>

      <CompareDiffCharts rows={compare} day={day} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["ALL", "DIFF", "HDEC ONLY", "NOT COUNTED", "MATCH"] as const).map((v) => (
          <button key={v} type="button" data-active={filter === v} onClick={() => setResult(v)} className="ui-filter inline-flex h-7 cursor-pointer items-center rounded-md px-2.5 text-xs transition-colors">
            {v === "ALL" ? "전체" : RESULT_LABEL[v]}
            <span className="ml-1 opacity-70">{v === "ALL" ? rows.length : rows.filter((r) => r.result === v).length}</span>
          </button>
        ))}
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="협력사·장소 검색" className="h-8 max-w-[200px] text-xs" />
        <Button size="sm" onClick={() => setExportOpen(true)} className="ml-auto">
          <Download className="size-3.5" />XLSX
        </Button>
        <ExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          title="Manpower Check 내보내기"
          getRows={exportRows}
          fileBase="Manpower Check"
          sheetName="Manpower Check"
          docLabel="Manpower Verification Check"
          subtitle={`Report Date: ${exportStamp} · Filtered Records: ${shown.length.toLocaleString()}`}
          dateStamp={exportStamp}
          singleSuffix="Subcon"
          groupAfterStamp
        />
      </div>

      <section className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[1100px] text-xs">
          <caption className="sr-only">협력사 보고와 HDEC 재집계 대조</caption>
          <thead className="bg-muted/60">
            <tr className="[&>th]:border-b [&>th]:border-border [&>th]:px-2 [&>th]:py-2 [&>th]:text-left">
               <th scope="col"><span className="flex items-center gap-1">Company <MultiSelectFilter options={facet("company")} selected={columnFilters.company ?? []} onChange={(v) => setColumnFilter("company", v)} /></span></th>
               <th scope="col"><span className="flex items-center gap-1">Location <MultiSelectFilter options={facet("location")} selected={columnFilters.location ?? []} onChange={(v) => setColumnFilter("location", v)} /></span></th>
               <th scope="col"><span className="flex items-center gap-1">Shift <MultiSelectFilter options={facet("shift")} selected={columnFilters.shift ?? []} onChange={(v) => setColumnFilter("shift", v)} /></span></th>
               <th scope="col"><span className="flex items-center justify-end gap-1">Subcon Report <MultiSelectFilter options={facet("reported")} selected={columnFilters.reported ?? []} onChange={(v) => setColumnFilter("reported", v)} /></span></th>
               <th scope="col"><span className="flex items-center justify-end gap-1">HDEC HSE Count <MultiSelectFilter options={facet("hse_verified")} selected={columnFilters.hse_verified ?? []} onChange={(v) => setColumnFilter("hse_verified", v)} /></span></th>
               <th scope="col"><span className="flex items-center justify-end gap-1">HDEC Exe Count <MultiSelectFilter options={facet("exe_verified")} selected={columnFilters.exe_verified ?? []} onChange={(v) => setColumnFilter("exe_verified", v)} /></span></th>
               <th scope="col"><span className="flex items-center justify-end gap-1">Diff (HSE) <MultiSelectFilter options={facet("hse_diff")} selected={columnFilters.hse_diff ?? []} onChange={(v) => setColumnFilter("hse_diff", v)} /></span></th>
               <th scope="col"><span className="flex items-center justify-end gap-1">Diff (EXE) <MultiSelectFilter options={facet("exe_diff")} selected={columnFilters.exe_diff ?? []} onChange={(v) => setColumnFilter("exe_diff", v)} /></span></th>
               <th scope="col"><span className="flex items-center gap-1">Result (HSE) <MultiSelectFilter options={facet("hse_result")} selected={columnFilters.hse_result ?? []} onChange={(v) => setColumnFilter("hse_result", v)} /></span></th>
               <th scope="col"><span className="flex items-center gap-1">Result (EXE) <MultiSelectFilter options={facet("exe_result")} selected={columnFilters.exe_result ?? []} onChange={(v) => setColumnFilter("exe_result", v)} /></span></th>
               <th scope="col"><span className="flex items-center gap-1">Reporter <MultiSelectFilter options={facet("sub_reporter")} selected={columnFilters.sub_reporter ?? []} onChange={(v) => setColumnFilter("sub_reporter", v)} /></span></th>
               <th scope="col"><span className="flex items-center gap-1">HSE Counter <MultiSelectFilter options={facet("hse_counter")} selected={columnFilters.hse_counter ?? []} onChange={(v) => setColumnFilter("hse_counter", v)} /></span></th>
               <th scope="col"><span className="flex items-center gap-1">EXE Counter <MultiSelectFilter options={facet("exe_counter")} selected={columnFilters.exe_counter ?? []} onChange={(v) => setColumnFilter("exe_counter", v)} /></span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i} className="[&>td]:border-b [&>td]:border-border/60 [&>td]:px-2 [&>td]:py-1.5">
                <td className="font-medium">{r.company}</td><td>{r.location}</td><td>{r.shift}</td>
                <td className="text-right">{r.reported ?? "—"}</td>
                <td className="text-right">{r.hse_verified ?? "—"}</td>
                <td className="text-right">{r.exe_verified ?? "—"}</td>
                <td className={`text-right font-bold ${diffTone(r.hse_diff)}`}>{fmtDiff(r.hse_diff)}</td>
                <td className={`text-right font-bold ${diffTone(r.exe_diff)}`}>{fmtDiff(r.exe_diff)}</td>
                <td>{resultBadge(r.hse_result)}</td>
                <td>{resultBadge(r.exe_result)}</td>
                <td className="text-muted-foreground"><ReporterCell source="SUB" row={r} memberMap={memberMap} /></td>
                <td className="text-muted-foreground"><ReporterCell source="HDEC" group="HSE" row={r} memberMap={memberMap} /></td>
                <td className="text-muted-foreground"><ReporterCell source="HDEC" group="EXE" row={r} memberMap={memberMap} /></td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={13} className="p-6 text-center text-muted-foreground">해당 조건의 대조 자료가 없습니다.</td></tr>}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}

const diffTone = (d: number | null | undefined) =>
  d == null ? "" : d < 0 ? "text-destructive" : d > 0 ? "text-emerald-600" : "";
const fmtDiff = (d: number | null | undefined) =>
  d == null ? "—" : d > 0 ? `+${d}` : `${d}`;
const resultBadge = (result: CompareRow["hse_result"]) =>
  result ? <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${TONE[result]}`}>{RESULT_LABEL[result]}</span> : <span className="text-muted-foreground">—</span>;

/** 입력자 칸 — 「이름 · 부서」(부서 색 점), 미등록이면 표시, 재제출 이력 뱃지 */
function ReporterCell({ source, group, row, memberMap }: { source: "SUB" | "HDEC"; group?: "HSE" | "EXE"; row: CompareRow; memberMap: Map<string, { telegram_id: string; name: string; dept: string | null; position: string | null }> }) {
  const tg = source === "SUB" ? row.sub_reporter_tg_id : group === "HSE" ? row.hse_counter_tg_id : group === "EXE" ? row.exe_counter_tg_id : row.hdec_counter_tg_id;
  const raw = source === "SUB" ? row.sub_reporter : group === "HSE" ? row.hse_counter : group === "EXE" ? row.exe_counter : row.hdec_counter;
  const superseded = (source === "SUB" ? row.sub_superseded : group === "HSE" ? row.hse_superseded : group === "EXE" ? row.exe_superseded : row.hdec_superseded) ?? 0;
  const who = reporterLabel(memberMap, tg, raw);
  if (!who.text || who.text === "—") return <>—</>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {who.member?.dept && <span className={`inline-block size-1.5 rounded-full ${deptDot(who.member.dept)}`} aria-hidden />}
      <span>{who.text}</span>
      {!who.registered && <span className="text-[10px] text-muted-foreground/70">(미등록)</span>}
      <CardHistoryButton
        source={source} company={row.company} report_date={row.report_date}
        location={row.location} shift={row.shift} memberMap={memberMap} superseded={superseded} group={group}
      />
    </span>
  );
}
