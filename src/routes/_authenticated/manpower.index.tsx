import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import * as XLSX from "xlsx";
import { AlertTriangle, Download } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AdminGate } from "@/components/manpower/admin-gate";
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
/** mode=company: 행=협력사·열=장소 / mode=location: 행=장소·열=협력사 */
function buildMatrix(cards: MpCard[], source: Source, mode: "company" | "location") {
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
  return { rows, cols: [...colSet].sort() };
}
import { MP, TRADE_LABEL } from "@/lib/manpower-i18n";

const search = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), src: z.enum(["SUB", "HDEC"]).optional() });

export const Route = createFileRoute("/_authenticated/manpower/")({
  head: () => ({ meta: [
    { title: "출면 현황 | HMMME 통합 공정 관리" },
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
  const { cards, companies, settings, cutoff } = useManpower(day, day);
  const { isAdmin } = useAuth();
  const [q, setQ] = useState("");
  const [matrixMode, setMatrixMode] = useState<"company" | "location">("company");

  const dayCards = useMemo(() => cards.filter((c) => c.report_date === day), [cards, day]);
  const shown = useMemo(
    () => dayCards.filter((c) => c.source === source && (!q || `${c.company} ${c.location}`.toLowerCase().includes(q.toLowerCase()))),
    [dayCards, source, q],
  );
  const daily = useMemo(() => toDaily(shown), [shown]);
  const totals = useMemo(() => tradeTotals(shown, source), [shown, source]);
  const comp = useMemo(() => compliance(dayCards, companies, day, cutoff), [dayCards, companies, day, cutoff]);
  const matrix = useMemo(() => buildMatrix(shown, source, matrixMode), [shown, source, matrixMode]);
  const locs = useMemo(() => [...new Set(shown.map((c) => c.location))].sort(), [shown]);
  const mismatches = shown.filter(cardMismatch);

  const setDay = (d: string) => navigate({ search: (p) => ({ ...p, day: d }), replace: true });

  const exportXlsx = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(shown.map((c) => ({
      구분: c.source, 협력사: c.company, 보고일: c.report_date, 장소: c.location, 조: c.shift,
      Staff: c.staff, Safety: c.safety_officer, Operator: c.operator, Worker: c.worker,
      Electrician: c.electrician, Scaffolder: c.scaffolder, Plumber: c.plumber, 소계: c.subtotal,
      보고자: c.reporter_name, 보고시각: c.submitted_at ? riyadhTime(c.submitted_at) : "",
    }))), "출면카드");
    XLSX.writeFile(wb, `HMMME_출면_${day.replace(/-/g, "")}.xlsx`);
  };

  return (
    <AdminGate title="출면 현황">
    <AppShell
      title={MP.daily}
      desc={`${fmtDay(day)} · ${source === "SUB" ? MP.sub : MP.hdec} · 총 ${totals.total.toLocaleString()}명 · 카드 ${shown.length}건`}
      actions={
        <>
          <Input type="date" aria-label="보고일" value={day} onChange={(e) => setDay(e.target.value)} className="h-8 w-[150px] text-xs" />
          <Button size="sm" variant="outline" onClick={exportXlsx}><Download className="size-3.5" />엑셀</Button>
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
        <Kpi label={MP.notReported} value={String(comp.missing.length)} sub={comp.missing.slice(0, 3).join(", ") || "없음"} tone={comp.missing.length ? "warn" : "ok"} />
      </div>

      {mismatches.length > 0 && (
        <p className="mb-3 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="size-3.5" />직종 합계와 소계가 다른 카드 {mismatches.length}건이 있습니다.
        </p>
      )}

      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="협력사·장소 검색" className="mb-3 h-8 max-w-xs text-xs" />

      <section className="mb-6 overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[900px] text-xs">
          <caption className="sr-only">협력사별 출면 집계</caption>
          <thead className="bg-muted/60">
            <tr className="[&>th]:border-b [&>th]:border-border [&>th]:px-2 [&>th]:py-2 [&>th]:text-right [&>th:first-child]:text-left">
              <th scope="col">{MP.company}</th>
              <th scope="col">{MP.day}</th><th scope="col">{MP.ot}</th><th scope="col">{MP.night}</th>
              {TRADES.map((t) => <th key={t} scope="col">{TRADE_LABEL[t]}</th>)}
              <th scope="col">{MP.total}</th><th scope="col" className="!text-left">{MP.firstSubmit}</th>
            </tr>
          </thead>
          <tbody>
            {daily.sort((a, b) => b.total - a.total).map((d) => (
              <tr key={d.company} className="[&>td]:border-b [&>td]:border-border/60 [&>td]:px-2 [&>td]:py-1.5 [&>td]:text-right [&>td:first-child]:text-left">
                <td className="font-medium">{d.company}</td>
                <td>{d.day_total || ""}</td><td>{d.ot_total || ""}</td><td>{d.night_total || ""}</td>
                {TRADES.map((t) => <td key={t} className="text-muted-foreground">{d[t] || ""}</td>)}
                <td className="font-bold">{d.total.toLocaleString()}</td>
                <td className="!text-left text-muted-foreground">{d.first_submitted_at ? riyadhTime(d.first_submitted_at) : "—"}</td>
              </tr>
            ))}
            {!daily.length && <tr><td colSpan={12} className="p-6 text-center text-muted-foreground">해당 일자의 보고가 없습니다.</td></tr>}
            {daily.length > 0 && (
              <tr className="bg-muted/40 font-bold [&>td]:px-2 [&>td]:py-2 [&>td]:text-right [&>td:first-child]:text-left">
                <td>합계</td>
                <td>{daily.reduce((a, d) => a + d.day_total, 0)}</td>
                <td>{daily.reduce((a, d) => a + d.ot_total, 0)}</td>
                <td>{daily.reduce((a, d) => a + d.night_total, 0)}</td>
                {TRADES.map((t) => <td key={t}>{totals[t]}</td>)}
                <td>{totals.total.toLocaleString()}</td><td />
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
      <section className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-xs" style={{ minWidth: 200 + matrix.cols.length * 3 * 64 }}>
          <caption className="sr-only">{matrixMode === "company" ? "협력사별 장소·조별 배치 인원" : "장소별 협력사·조별 배치 인원"}</caption>
          <thead className="bg-muted/60">
            <tr className="[&>th]:border-b [&>th]:border-border [&>th]:px-2 [&>th]:py-1.5 [&>th]:text-center">
              <th scope="col" rowSpan={2} className="sticky left-0 bg-muted/60 !text-left">{matrixMode === "company" ? MP.company : MP.location}</th>
              {matrix.cols.map((col) => <th key={col} scope="colgroup" colSpan={3} className="whitespace-nowrap border-l border-border">{col}</th>)}
              <th scope="col" rowSpan={2} className="border-l border-border">{MP.total}</th>
            </tr>
            <tr className="[&>th]:border-b [&>th]:border-border [&>th]:px-2 [&>th]:py-1 [&>th]:text-right [&>th]:font-normal [&>th]:text-muted-foreground">
              {matrix.cols.map((col) =>
                MATRIX_SHIFTS.map((sh, i) => (
                  <th key={`${col}-${sh}`} scope="col" className={i === 0 ? "border-l border-border" : ""}>{MATRIX_SHIFT_LABEL[sh]}</th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {[...matrix.rows.entries()].map(([rowKey, row]) => (
              <tr key={rowKey} className="[&>td]:border-b [&>td]:border-border/60 [&>td]:px-2 [&>td]:py-1.5 [&>td]:text-right [&>td:first-child]:text-left">
                <td className="sticky left-0 bg-card font-medium">{rowKey}</td>
                {matrix.cols.map((col) => {
                  const cell = row.get(col);
                  return MATRIX_SHIFTS.map((sh, i) => (
                    <td key={`${col}-${sh}`} className={i === 0 ? "border-l border-border/60" : ""}>
                      {cell?.byShift[sh] || <span className="text-muted-foreground/40">·</span>}
                    </td>
                  ));
                })}
                <td className="border-l border-border/60 font-bold">{[...row.values()].reduce((a, c) => a + c.total, 0)}</td>
              </tr>
            ))}
            {!matrix.rows.size && <tr><td colSpan={matrix.cols.length * 3 + 2} className="p-6 text-center text-muted-foreground">표시할 자료가 없습니다.</td></tr>}
          </tbody>
        </table>
      </section>
    </AppShell>
    </AdminGate>
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
