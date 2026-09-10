import { useCallback, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AlertTriangle, Download } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ExportDialog, type ExportRow, type ExtraSheet } from "@/components/export-dialog";

import { SheetImportDialog } from "@/components/manpower/sheet-import-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/use-auth";
import { manpowerRangeQuery, useManpower } from "@/lib/use-manpower";
import {
  TRADES, cardMismatch, compliance, fmtDay, riyadhToday, riyadhTime,
  toDaily, tradeTotals, type Card as MpCard, type Source,
} from "@/lib/manpower-model";

/** 매트릭스 인원 합산 대상 직종 (나머지 직종은 제외) */
const MATRIX_TRADES = ["worker", "electrician", "plumber", "scaffolder"] as const;
const matrixCount = (c: MpCard) => MATRIX_TRADES.reduce((s, t) => s + Number(c[t] ?? 0), 0);
const MATRIX_SHIFTS = ["Day Shift", "Overtime", "Night Shift"] as const;
const MATRIX_SHIFT_LABEL: Record<(typeof MATRIX_SHIFTS)[number], string> = {
  "Day Shift": "주간", Overtime: "연장", "Night Shift": "야간",
};
type MatrixCell = { total: number; byShift: Record<(typeof MATRIX_SHIFTS)[number], number> };
/**
 * mode=company: 행=협력사·열=장소 / mode=location: 행=장소·열=협력사
 * 장소는 값 유무와 상관없이 앱에 등록된 모든 활성 장소를 표시하고 이름 오름차순 정렬.
 */
function buildMatrix(
  cards: MpCard[],
  source: Source,
  mode: "company" | "location",
  allLocations: string[],
  allCompanies: string[],
) {
  const rows = new Map<string, Map<string, MatrixCell>>();
  const colSet = new Set<string>();
  cards.filter((c) => c.source === source).forEach((c) => {
    const n = matrixCount(c);
    if (!n) return;
    const [rk, ck] = mode === "company" ? [c.company, c.location] : [c.location, c.company];
    colSet.add(ck);
    let row = rows.get(rk);
    if (!row) { row = new Map(); rows.set(rk, row); }
    let cell = row.get(ck);
    if (!cell) { cell = { total: 0, byShift: { "Day Shift": 0, Overtime: 0, "Night Shift": 0 } }; row.set(ck, cell); }
    const sh = (MATRIX_SHIFTS as readonly string[]).includes(c.shift) ? (c.shift as (typeof MATRIX_SHIFTS)[number]) : "Day Shift";
    cell.byShift[sh] += n;
    cell.total += n;
  });
  // 장소는 마스터 전체를 항상 표시 (값이 없어도 행/열로 노출)
  const sortedLocs = [...allLocations].sort((a, b) => a.localeCompare(b));
  const sortedComps = [...allCompanies].sort((a, b) => a.localeCompare(b));
  if (mode === "company") {
    // 행=전체 활성 협력사, 열=전체 활성 장소 (값이 없어도 모두 표시)
    sortedLocs.forEach((loc) => colSet.add(loc));
    sortedComps.forEach((co) => { if (!rows.has(co)) rows.set(co, new Map()); });
    return { rows: new Map([...rows.entries()].sort((a, b) => a[0].localeCompare(b[0]))), cols: [...colSet].sort((a, b) => a.localeCompare(b)) };
  }
  // location 모드: 행=전체 장소, 열=전체 협력사
  sortedLocs.forEach((loc) => { if (!rows.has(loc)) rows.set(loc, new Map()); });
  sortedComps.forEach((co) => colSet.add(co));
  return { rows: new Map([...rows.entries()].sort((a, b) => a[0].localeCompare(b[0]))), cols: [...colSet].sort((a, b) => a.localeCompare(b)) };
}
import { MP, TRADE_LABEL } from "@/lib/manpower-i18n";

const search = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), src: z.enum(["SUB", "HDEC"]).optional() });

export const Route = createFileRoute("/_authenticated/manpower/")({
  head: () => ({ meta: [
    { title: "출면 현황 | HMMME PROJECT CMS" },
    { name: "description", content: "협력사 텔레그램 보고와 HDEC 재집계를 일자별로 확인하는 출면(Daily Manpower) 현황 화면입니다." },
    { property: "og:title", content: "HMMME 출면 현황" },
    { property: "og:description", content: "일자별 협력사·장소·직종 출면 인원을 확인하세요." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  validateSearch: (s: unknown) => search.parse(s),
  loaderDeps: ({ search: s }) => ({ day: s.day ?? riyadhToday() }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(manpowerRangeQuery(deps.day, deps.day)),
  errorComponent: ({ error }) => <div role="alert" className="p-8 text-sm">출면 데이터를 불러오지 못했습니다. {(error as Error).message}</div>,
  component: ManpowerPage,
});

function ManpowerPage() {
  const s = Route.useSearch();
  const navigate = Route.useNavigate();
  const day = s.day ?? riyadhToday();
  const source: Source = s.src ?? "SUB";
  const { cards, companies, locations, settings, cutoff, lastReceivedAt, reminderLog } = useManpower(day, day);
  /** 오늘 미보고 알림이 발송된 횟수 (협력사별) */
  const reminderCount = useMemo(() => {
    const m = new Map<string, number>();
    reminderLog.forEach((r) => (r.missing ?? []).forEach((co) => m.set(co, (m.get(co) ?? 0) + 1)));
    return m;
  }, [reminderLog]);
  const { isAdmin } = useAuth();
  const [matrixMode, setMatrixMode] = useState<"company" | "location">("company");
  const [exportOpen, setExportOpen] = useState(false);

  const dayCards = useMemo(() => cards.filter((c) => c.report_date === day), [cards, day]);
  const shown = useMemo(() => dayCards.filter((c) => c.source === source), [dayCards, source]);
  const daily = useMemo(() => toDaily(shown), [shown]);
  const totals = useMemo(() => tradeTotals(shown, source), [shown, source]);
  const comp = useMemo(() => compliance(dayCards, companies, day, cutoff), [dayCards, companies, day, cutoff]);
  const allLocNames = useMemo(
    () => locations.filter((l) => l.is_active).map((l) => l.name).sort((a, b) => a.localeCompare(b)),
    [locations],
  );
  const allCompNames = useMemo(
    () => companies.filter((c) => c.is_active).map((c) => c.name).sort((a, b) => a.localeCompare(b)),
    [companies],
  );
  const matrix = useMemo(() => buildMatrix(shown, source, matrixMode, allLocNames, allCompNames), [shown, source, matrixMode, allLocNames, allCompNames]);
  const locs = useMemo(() => [...new Set(shown.map((c) => c.location))].sort(), [shown]);
  const mismatches = shown.filter(cardMismatch);

  const setDay = (d: string) => navigate({ search: (p) => ({ ...p, day: d }), replace: true });

  const getRows = useCallback((): ExportRow[] => shown.map((c) => ({
    group: c.company,
    rec: {
      구분: c.source, 협력사: c.company, 보고일: c.report_date, 장소: c.location, 조: c.shift,
      Staff: c.staff, Safety: c.safety_officer, Operator: c.operator, Worker: c.worker,
      Electrician: c.electrician, Scaffolder: c.scaffolder, Plumber: c.plumber, 소계: c.subtotal,
      보고자: c.reporter_name, 보고시각: c.submitted_at ? riyadhTime(c.submitted_at) : "",
    },
  })), [shown]);

  /** 매트릭스 1개 시트 (2단 헤더 + 그룹 병합 + 합계행) */
  const matrixSheet = useCallback((): ExtraSheet => {
    const head1: unknown[] = [matrixMode === "company" ? MP.company : MP.location, MP.total];
    const head2: unknown[] = ["", ""];
    matrix.cols.forEach((col) => {
      head1.push(col, "", "");
      MATRIX_SHIFTS.forEach((sh) => head2.push(MATRIX_SHIFT_LABEL[sh]));
    });
    const body = [...matrix.rows.entries()].map(([rowKey, row]) => {
      const line: unknown[] = [rowKey, [...row.values()].reduce((a, c) => a + c.total, 0)];
      matrix.cols.forEach((col) => MATRIX_SHIFTS.forEach((sh) => line.push(row.get(col)?.byShift[sh] || 0)));
      return line;
    });
    const totalLine: unknown[] = ["합계", [...matrix.rows.values()].reduce((a, row) => a + [...row.values()].reduce((b, c) => b + c.total, 0), 0)];
    matrix.cols.forEach((col) => MATRIX_SHIFTS.forEach((sh) =>
      totalLine.push([...matrix.rows.values()].reduce((a, row) => a + (row.get(col)?.byShift[sh] ?? 0), 0))));
    // 1단 헤더: 행 라벨/합계는 세로 병합, 각 열 그룹은 가로 3칸 병합
    const merges = [
      { r1: 0, c1: 0, r2: 1, c2: 0 },
      { r1: 0, c1: 1, r2: 1, c2: 1 },
      ...matrix.cols.map((_, i) => ({ r1: 0, c1: 2 + i * 3, r2: 0, c2: 4 + i * 3 })),
    ];
    return {
      name: matrixMode === "company" ? "협력사×장소" : "장소×협력사",
      aoa: [head1, head2, ...body, totalLine], headerRows: 2, merges, freezeCols: 2, minColWidth: 9,
      title: `출면 현황 - ${matrixMode === "company" ? "협력사 × 장소" : "장소 × 협력사"} (Worker·Elec·Plumb·Scaf)`,
      subtitle: `기준일 ${fmtDay(day)} · ${source === "SUB" ? MP.sub : MP.hdec}`,
    };
  }, [matrix, matrixMode, day, source]);

  /** 매트릭스만 단일 파일로 내려받기 */
  const exportMatrix = useCallback(async () => {
    const { styledAoaSheet, XLSXS } = await import("@/lib/xlsx-style");
    const ex = matrixSheet();
    const wb = XLSXS.utils.book_new();
    XLSXS.utils.book_append_sheet(wb, styledAoaSheet(ex.aoa, 2, {
      title: ex.title, subtitle: ex.subtitle, merges: ex.merges, freezeCols: ex.freezeCols, minColWidth: ex.minColWidth,
    }), ex.name);
    XLSXS.writeFile(wb, `출면매트릭스_${day.replace(/-/g, "")}_${source}.xlsx`);
  }, [matrixSheet, day, source]);

  /** 단일 파일 모드에 함께 담는 추가 시트: 협력사 집계 + 매트릭스 */
  const getExtraSheets = useCallback((): ExtraSheet[] => {
    const sum = <T,>(f: (d: (typeof daily)[number]) => number) => daily.reduce((a, d) => a + f(d), 0) as T;
    const summary: unknown[][] = [
      [MP.company, MP.day, MP.ot, MP.night, ...TRADES.map((t) => TRADE_LABEL[t]), MP.total, MP.firstSubmit],
      ...[...daily].sort((a, b) => b.total - a.total).map((d) => [
        d.company, d.day_total, d.ot_total, d.night_total, ...TRADES.map((t) => d[t]), d.total,
        d.first_submitted_at ? riyadhTime(d.first_submitted_at) : "",
      ]),
      ["합계", sum<number>((d) => d.day_total), sum<number>((d) => d.ot_total), sum<number>((d) => d.night_total),
        ...TRADES.map((t) => totals[t]), totals.total, ""],
    ];
    return [
      { name: "협력사집계", aoa: summary, headerRows: 1, title: `출면 현황 - 협력사 집계 (${source === "SUB" ? MP.sub : MP.hdec})`, subtitle: `기준일 ${fmtDay(day)}` },
      matrixSheet(),
    ];
  }, [daily, totals, matrixSheet, day, source]);

  return (
    <AppShell
      title={MP.daily}
      desc={`${fmtDay(day)} · ${source === "SUB" ? MP.sub : MP.hdec} · 총 ${totals.total.toLocaleString()}명 · 카드 ${shown.length}건${
        lastReceivedAt ? ` · 마지막 수신 ${new Date(lastReceivedAt).toLocaleString("ko-KR", { timeZone: "Asia/Riyadh", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""
      }`}

      actions={
        <>
          <Input type="date" aria-label="보고일" value={day} onChange={(e) => setDay(e.target.value)} className="h-8 w-[150px] text-xs" />
          <Button size="sm" variant="outline" onClick={() => setExportOpen(true)}><Download className="size-3.5" />엑셀 내보내기</Button>
          {isAdmin && <SheetImportDialog settings={settings} />}
        </>
      }
    >
      <Tabs value={source} onValueChange={(v) => navigate({ search: (p) => ({ ...p, src: v as Source }), replace: true })} className="mb-4">
        <TabsList><TabsTrigger value="SUB">{MP.sub}</TabsTrigger><TabsTrigger value="HDEC">{MP.hdec}</TabsTrigger></TabsList>
      </Tabs>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={MP.headcount} value={totals.total.toLocaleString()} sub={`${MP.day} ${daily.reduce((a, d) => a + d.day_total, 0)} · ${MP.ot} ${daily.reduce((a, d) => a + d.ot_total, 0)} · ${MP.night} ${daily.reduce((a, d) => a + d.night_total, 0)}`} />
        <Kpi label="보고 협력사" value={`${new Set(shown.map((c) => c.company)).size} / ${companies.filter((c) => c.is_active).length}`} sub={`장소 ${locs.length}곳`} />
        <Kpi label={MP.compliance} value={`${Math.round(comp.rate * 100)}%`} sub={`마감 ${cutoff} 이전 ${comp.n}/${comp.total}개사`} />
        <Kpi label={MP.notReported} value={String(comp.missing.length)} tone={comp.missing.length ? "warn" : "ok"}
          sub={comp.missing.length
            ? comp.missing.slice(0, 3).map((co) => {
                const n = reminderCount.get(co) ?? 0;
                return n > 0 ? `${co} (${MP.reminderSent} ${n}회)` : co;
              }).join(", ")
            : "없음"} />
      </div>

      {mismatches.length > 0 && (
        <p className="mb-3 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="size-3.5" />직종 합계와 소계가 다른 카드 {mismatches.length}건이 있습니다.
        </p>
      )}

      <section className="mb-6 overflow-x-auto rounded-lg border border-border shadow-sm">
        <table className="w-full min-w-[900px] border-collapse text-xs tabular-nums">
          <caption className="sr-only">협력사별 출면 집계</caption>
          <thead>
            <tr className="bg-primary/10 [&>th]:border-b-2 [&>th]:border-primary/30 [&>th]:px-3 [&>th]:py-2.5 [&>th]:text-right [&>th]:text-[11px] [&>th]:font-bold [&>th]:uppercase [&>th]:tracking-wide [&>th]:text-primary [&>th:first-child]:text-left">
              <th scope="col">{MP.company}</th>
              <th scope="col" className="text-sky-700 dark:text-sky-300">{MP.day}</th>
              <th scope="col" className="text-amber-700 dark:text-amber-300">{MP.ot}</th>
              <th scope="col" className="text-indigo-700 dark:text-indigo-300">{MP.night}</th>
              {TRADES.map((t) => <th key={t} scope="col">{TRADE_LABEL[t]}</th>)}
              <th scope="col">{MP.total}</th><th scope="col" className="!text-left">{MP.firstSubmit}</th>
            </tr>
          </thead>
          <tbody>
            {daily.sort((a, b) => b.total - a.total).map((d, i) => (
              <tr key={d.company} className={`transition-colors hover:bg-primary/5 ${i % 2 ? "bg-muted/30" : ""} [&>td]:border-b [&>td]:border-border/50 [&>td]:px-3 [&>td]:py-2 [&>td]:text-right [&>td:first-child]:text-left`}>
                <td className="font-semibold">{d.company}</td>
                <td className="font-medium text-sky-700 dark:text-sky-300">{d.day_total || <span className="text-muted-foreground/30">–</span>}</td>
                <td className="font-medium text-amber-700 dark:text-amber-300">{d.ot_total || <span className="text-muted-foreground/30">–</span>}</td>
                <td className="font-medium text-indigo-700 dark:text-indigo-300">{d.night_total || <span className="text-muted-foreground/30">–</span>}</td>
                {TRADES.map((t) => <td key={t} className="text-muted-foreground">{d[t] || ""}</td>)}
                <td className="bg-primary/5 text-sm font-extrabold">{d.total.toLocaleString()}</td>
                <td className="!text-left text-muted-foreground">{d.first_submitted_at ? riyadhTime(d.first_submitted_at) : "—"}</td>
              </tr>
            ))}
            {!daily.length && <tr><td colSpan={12} className="p-6 text-center text-muted-foreground">해당 일자의 보고가 없습니다.</td></tr>}
            {daily.length > 0 && (
              <tr className="bg-primary/10 font-bold [&>td]:border-t-2 [&>td]:border-primary/30 [&>td]:px-3 [&>td]:py-2.5 [&>td]:text-right [&>td:first-child]:text-left">
                <td>합계</td>
                <td className="text-sky-700 dark:text-sky-300">{daily.reduce((a, d) => a + d.day_total, 0)}</td>
                <td className="text-amber-700 dark:text-amber-300">{daily.reduce((a, d) => a + d.ot_total, 0)}</td>
                <td className="text-indigo-700 dark:text-indigo-300">{daily.reduce((a, d) => a + d.night_total, 0)}</td>
                {TRADES.map((t) => <td key={t}>{totals[t]}</td>)}
                <td className="text-sm font-extrabold">{totals.total.toLocaleString()}</td><td />
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold">협력사 × 장소 <span className="font-normal text-muted-foreground">(Worker·Elec·Plumb·Scaf 합계)</span></h2>
        <Tabs value={matrixMode} onValueChange={(v) => setMatrixMode(v as "company" | "location")}>
          <TabsList className="h-8"><TabsTrigger value="company" className="text-xs">협력사별</TabsTrigger><TabsTrigger value="location" className="text-xs">장소별</TabsTrigger></TabsList>
        </Tabs>
      </div>
      <section className="overflow-x-auto rounded-lg border border-border shadow-sm">
        <table className="w-full border-collapse text-xs tabular-nums" style={{ minWidth: 200 + matrix.cols.length * 3 * 64 }}>
          <caption className="sr-only">{matrixMode === "company" ? "협력사별 장소·조별 배치 인원" : "장소별 협력사·조별 배치 인원"}</caption>
          <thead>
            <tr className="bg-primary/10 [&>th]:border-b [&>th]:border-primary/20 [&>th]:px-2 [&>th]:py-2 [&>th]:text-center [&>th]:font-bold [&>th]:text-primary">
              <th scope="col" rowSpan={2} className="sticky left-0 z-10 w-[150px] min-w-[150px] bg-primary/10 !text-left shadow-[2px_0_0_0_hsl(var(--border))]">{matrixMode === "company" ? MP.company : MP.location}</th>
              <th scope="col" rowSpan={2} className="sticky left-[150px] z-10 min-w-[72px] whitespace-nowrap border-l-2 border-primary/30 bg-primary/15 text-sm">{MP.total}</th>
              {matrix.cols.map((col) => <th key={col} scope="colgroup" colSpan={3} className="whitespace-nowrap border-l-2 border-primary/20">{col}</th>)}
            </tr>
            <tr className="bg-muted/50 [&>th]:border-b-2 [&>th]:border-primary/30 [&>th]:px-2 [&>th]:py-1.5 [&>th]:text-right [&>th]:text-[11px] [&>th]:font-semibold">
              {matrix.cols.map((col) =>
                MATRIX_SHIFTS.map((sh, i) => (
                  <th key={`${col}-${sh}`} scope="col" className={`${i === 0 ? "border-l-2 border-primary/20" : ""} ${sh === "Day Shift" ? "text-sky-700 dark:text-sky-300" : sh === "Overtime" ? "text-amber-700 dark:text-amber-300" : "text-indigo-700 dark:text-indigo-300"}`}>{MATRIX_SHIFT_LABEL[sh]}</th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {[...matrix.rows.entries()].map(([rowKey, row], ri) => {
              const rowTotal = [...row.values()].reduce((a, c) => a + c.total, 0);
              return (
                <tr key={rowKey} className={`transition-colors hover:bg-primary/5 ${ri % 2 ? "bg-muted/20" : ""} [&>td]:border-b [&>td]:border-border/50 [&>td]:px-2 [&>td]:py-1.5 [&>td]:text-right [&>td:first-child]:text-left`}>
                  <td className={`sticky left-0 z-10 w-[150px] min-w-[150px] font-semibold shadow-[2px_0_0_0_hsl(var(--border))] ${ri % 2 ? "bg-muted/40" : "bg-card"}`}>
                    {rowKey}
                    {matrixMode === "company" && source === "SUB" && comp.missing.includes(rowKey) && (
                      <span className="ml-1.5 inline-block rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                        {MP.notReported}{(reminderCount.get(rowKey) ?? 0) > 0 ? ` · ${MP.reminderSent} ${reminderCount.get(rowKey)}회` : ""}
                      </span>
                    )}
                  </td>
                  <td className={`sticky left-[150px] z-10 min-w-[72px] border-l-2 border-primary/20 font-bold text-sm ${ri % 2 ? "bg-muted/40" : "bg-card"} ${rowTotal ? "" : "text-muted-foreground/40"}`}>{rowTotal || "–"}</td>
                  {matrix.cols.map((col) => {
                    const cell = row.get(col);
                    return MATRIX_SHIFTS.map((sh, i) => {
                      const v = cell?.byShift[sh] ?? 0;
                      return (
                        <td key={`${col}-${sh}`} className={`${i === 0 ? "border-l-2 border-border/60" : ""} ${v ? `font-medium ${sh === "Day Shift" ? "text-sky-700 dark:text-sky-300" : sh === "Overtime" ? "text-amber-700 dark:text-amber-300" : "text-indigo-700 dark:text-indigo-300"}` : ""}`}>
                          {v || <span className="text-muted-foreground/30">–</span>}
                        </td>
                      );
                    });
                  })}
                </tr>
              );
            })}
            {!matrix.rows.size && <tr><td colSpan={matrix.cols.length * 3 + 2} className="p-6 text-center text-muted-foreground">표시할 자료가 없습니다.</td></tr>}
            {matrix.rows.size > 0 && (
              <tr className="bg-primary/10 font-bold [&>td]:border-t-2 [&>td]:border-primary/30 [&>td]:px-2 [&>td]:py-2 [&>td]:text-right [&>td:first-child]:text-left">
                <td className="sticky left-0 z-10 w-[150px] min-w-[150px] bg-primary/10 shadow-[2px_0_0_0_hsl(var(--border))]">합계</td>
                <td className="sticky left-[150px] z-10 min-w-[72px] border-l-2 border-primary/30 bg-primary/15 text-sm font-extrabold">
                  {[...matrix.rows.values()].reduce((a, row) => a + [...row.values()].reduce((b, c) => b + c.total, 0), 0).toLocaleString()}
                </td>
                {matrix.cols.map((col) =>
                  MATRIX_SHIFTS.map((sh, i) => {
                    const v = [...matrix.rows.values()].reduce((a, row) => a + (row.get(col)?.byShift[sh] ?? 0), 0);
                    return <td key={`${col}-${sh}`} className={i === 0 ? "border-l-2 border-primary/20" : ""}>{v || ""}</td>;
                  }),
                )}
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        title="출면 현황 내보내기"
        getRows={getRows}
        extraSheets={getExtraSheets}
        fileBase={`HMMME_출면현황_${source}_${day.replace(/-/g, "")}`}
        sheetName="출면카드"
        docLabel={`출면 현황 (${source === "SUB" ? MP.sub : MP.hdec})`}
        subtitle={`기준일 ${fmtDay(day)} · 총 ${totals.total.toLocaleString()}명 · 카드 ${shown.length}건`}
      />
    </AppShell>
  );
}

export function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone === "warn" ? "text-amber-600 dark:text-amber-400" : ""}`}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export type { MpCard };
