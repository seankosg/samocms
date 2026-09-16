import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import * as XLSX from "xlsx";
import { Download } from "lucide-react";
import { CartesianGrid, ComposedChart, Bar, Line, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { AppShell } from "@/components/app-shell";

import { Kpi } from "@/routes/_authenticated/manpower.index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { manpowerRangeQuery, useManpower, defaultRange } from "@/lib/use-manpower";

/** 출면 추이 차트 기본 시작일 (고정) */
const TREND_DEFAULT_FROM = "2026-09-12";
import { dateRange, isExeRecheck, riyadhToday, addDays, type Card as MpCard } from "@/lib/manpower-model";
import { MP } from "@/lib/manpower-i18n";

const DIMS = ["company", "building", "team"] as const;
type Dim = (typeof DIMS)[number];
const DIM_LABEL: Record<Dim, string> = { team: "팀별", building: "건물별", company: "협력사별" };

const search = z.object({
  mpFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mpTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mpDim: z.enum(DIMS).optional(),
  mpVal: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/manpower/trend")({
  head: () => ({ meta: [
    { title: "출면 추이 | HMMME PROJECT CMS" },
    { name: "description", content: "팀·건물·협력사별 출면 인원의 일일 기록과 누계 추이를 확인합니다." },
    { property: "og:title", content: "HMMME 출면 추이" },
    { property: "og:description", content: "기간별 인력 투입 흐름을 확인하세요." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  validateSearch: (s: unknown) => search.parse(s),
  loaderDeps: ({ search: s }) => {
    const d = defaultRange();
    return { from: s.mpFrom ?? TREND_DEFAULT_FROM, to: s.mpTo ?? d.to };
  },
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(manpowerRangeQuery(deps.from, deps.to)),
  errorComponent: ({ error }) => <div role="alert" className="p-8 text-sm">추이 데이터를 불러오지 못했습니다. {(error as Error).message}</div>,
  component: TrendPage,
});

function TrendPage() {
  const s = Route.useSearch();
  const navigate = Route.useNavigate();
  const def = defaultRange();
  const from = s.mpFrom ?? TREND_DEFAULT_FROM;
  const to = s.mpTo ?? def.to;
  const dim: Dim = s.mpDim ?? "company";
  const { cards, companies, locations, isWorkday } = useManpower(from, to);

  /** 카드 → 선택 축의 그룹명 */
  const keyOf = useMemo(() => {
    const team = new Map(companies.map((c) => [c.name, c.discipline || "미지정"]));
    const bldg = new Map(locations.map((l) => [l.name, l.name]));
    return (c: MpCard) =>
      dim === "team" ? (team.get(c.company) ?? "미지정")
      : dim === "building" ? (bldg.get(c.location) ?? c.location)
      : c.company;
  }, [dim, companies, locations]);

  const groups = useMemo(() => [...new Set(cards.map(keyOf))].sort(), [cards, keyOf]);
  const [selected, setSelected] = useState<string[]>([]);
  const [shift, setShift] = useState<"전체" | "주간" | "연장" | "야간">("주간");
  useEffect(() => { setSelected([]); }, [dim]);
  const isAll = selected.length === 0;
  const shiftCode = shift === "주간" ? "Day Shift" : shift === "연장" ? "Overtime" : shift === "야간" ? "Night Shift" : null;
  const selLabel = `${isAll ? "전체" : selected.join(", ")}${shiftCode ? ` · ${shift}` : ""}`;
  const filtered = useMemo(
    () => cards.filter((c) => (isAll || selected.includes(keyOf(c))) && (!shiftCode || c.shift === shiftCode)),
    [cards, keyOf, isAll, selected, shiftCode],
  );

  /** 조 필터 없이 그룹 선택만 적용 (월간 조별 차트용) */
  const groupOnly = useMemo(() => cards.filter((c) => isAll || selected.includes(keyOf(c))), [cards, keyOf, isAll, selected]);

  const days = useMemo(() => dateRange(from, to), [from, to]);
  const byDate = (src: "SUB" | "HDEC") => {
    // 재집계(점선)는 수행팀(EXE) 기준
    const m = new Map<string, number>();
    filtered.filter((c) => c.source === src && isExeRecheck(c)).forEach((c) => m.set(c.report_date, (m.get(c.report_date) ?? 0) + c.subtotal));
    return m;
  };
  const subTotals = useMemo(() => byDate("SUB"), [filtered]);
  const hdecTotals = useMemo(() => byDate("HDEC"), [filtered]);

  const chart = days.map((d) => {
    const rep = subTotals.get(d) ?? 0;
    const ver = hdecTotals.get(d) ?? 0;
    return { day: d.slice(5), 보고: rep, 재집계: ver };
  });

  // 차트 크기: X축(일수)·Y축(최대값)에 따라 가변 — 영역 폭은 고정, 내부만 스크롤
  const dailyMax = Math.max(1, ...chart.map((r) => Math.max(r.보고, r.재집계)));
  const chartWidth = Math.max(640, days.length * (days.length > 45 ? 26 : 44));
  const chartHeight = dailyMax > 800 ? 520 : dailyMax > 400 ? 460 : dailyMax > 150 ? 400 : 340;

  const workDays = days.filter(isWorkday);
  const sum = days.reduce((s, d) => s + (subTotals.get(d) ?? 0), 0);
  const peakDay = days.reduce((best, d) => ((subTotals.get(d) ?? 0) > (subTotals.get(best) ?? 0) ? d : best), days[0] ?? from);

  const byGroup = useMemo(() => {
    const m = new Map<string, { total: number; day: number; ot: number; night: number }>();
    filtered.filter((c) => c.source === "SUB").forEach((c) => {
      const key = keyOf(c);
      const row = m.get(key) ?? { total: 0, day: 0, ot: 0, night: 0 };
      row.total += c.subtotal;
      if (c.shift === "Day Shift") row.day += c.subtotal;
      else if (c.shift === "Overtime") row.ot += c.subtotal;
      else if (c.shift === "Night Shift") row.night += c.subtotal;
      m.set(key, row);
    });
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [filtered, keyOf]);
  const groupSums = byGroup.reduce((a, [, x]) => ({ total: a.total + x.total, day: a.day + x.day, ot: a.ot + x.ot, night: a.night + x.night }), { total: 0, day: 0, ot: 0, night: 0 });
  const selectedSub = useMemo(() => groupOnly.filter((c) => c.source === "SUB"), [groupOnly]);
  const shiftSummary = useMemo(() => {
    const make = (label: string, code?: string) => {
      const rows = code ? selectedSub.filter((c) => c.shift === code) : selectedSub;
      const total = rows.reduce((a, c) => a + c.subtotal, 0);
      const reportDays = new Set(rows.filter((c) => c.subtotal > 0).map((c) => c.report_date)).size;
      return { label, total, reportDays, avg: reportDays ? total / reportDays : 0 };
    };
    return [make("전조"), make("주간", "Day Shift"), make("연장", "Overtime"), make("야간", "Night Shift")];
  }, [selectedSub]);
  const allShiftSummary = shiftSummary[0] ?? { label: "전조", total: 0, reportDays: 0, avg: 0 };
  /** 현재 선택된 조에 맞는 요약 — 상단 수치와 세부 내역이 같은 범위를 보게 한다 */
  const curShiftSummary =
    shift === "전체" ? allShiftSummary
    : shiftSummary[["전조", "주간", "연장", "야간"].indexOf(shift)] ?? allShiftSummary;

  const exportXlsx = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(chart.map((r, i) => ({
      일자: days[i], 근무일: isWorkday(days[i]!) ? "Y" : "N",
      보고: r.보고, 재집계: r.재집계,
    }))), "출면추이");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(byGroup.map(([c, v]) => ({ [DIM_LABEL[dim]]: c, 연인원: v.total, 주간: v.day, 연장: v.ot, 야간: v.night }))), DIM_LABEL[dim]);
    XLSX.writeFile(wb, `HMMME_출면추이_${from.replace(/-/g, "")}_${to.replace(/-/g, "")}.xlsx`);
  };

  const setRange = (k: "from" | "to", v: string) => navigate({ search: (p) => ({ ...p, [k === "from" ? "mpFrom" : "mpTo"]: v }), replace: true });
  const quick = (n: number) => navigate({ search: (p) => ({ ...p, mpFrom: addDays(riyadhToday(), -(n - 1)), mpTo: riyadhToday() }), replace: true });

  return (
    <AppShell
      title={MP.trend}
      desc={`${from} ~ ${to} · 근무일 ${workDays.length}일 · 연인원 ${sum.toLocaleString()}명`}
      actions={
        <>
          <Tabs value={dim} onValueChange={(v) => navigate({ search: (p) => ({ ...p, mpDim: v as Dim, mpVal: "전체" }), replace: true })}>
            <TabsList className="h-8">
              {DIMS.map((d) => <TabsTrigger key={d} value={d} className="h-6 px-2.5 text-xs">{DIM_LABEL[d]}</TabsTrigger>)}
            </TabsList>
          </Tabs>
          {[7, 30, 90].map((n) => <Button key={n} size="sm" variant="outline" className="h-8 text-xs" onClick={() => quick(n)}>{n}일</Button>)}
          <Input type="date" aria-label="시작일" value={from} onChange={(e) => setRange("from", e.target.value)} className="h-8 w-[140px] text-xs" />
          <Input type="date" aria-label="종료일" value={to} onChange={(e) => setRange("to", e.target.value)} className="h-8 w-[140px] text-xs" />
          <Button size="sm" variant="outline" onClick={exportXlsx}><Download className="size-3.5" />엑셀</Button>
        </>
      }
    >
      <p className="mb-2 rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-700 dark:text-sky-300">
        기준: 협력사 보고(실선) · 수행팀(EXE) 재집계(점선) · 조 필터 「{shift}」이(가) 아래 카드·차트·표에 모두 적용됩니다.
      </p>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="연인원" value={sum.toLocaleString()} sub={`${DIM_LABEL[dim]} · ${selLabel}`} breakdown={shiftSummary.slice(1).map((x) => ({ label: x.label, value: x.total.toLocaleString() }))} />
        <Kpi label="일일투입평균" value={curShiftSummary.avg.toFixed(1)} sub={`${selLabel} · 실제 보고일 ${curShiftSummary.reportDays}일`} breakdown={shiftSummary.slice(1).map((x) => ({ label: x.label, value: x.avg.toFixed(1) }))} />
        <Kpi label="최대 투입일" value={String(subTotals.get(peakDay) ?? 0)} sub={peakDay} />
        <Kpi label={DIM_LABEL[dim].replace("별", " 수")} value={String(byGroup.length)} sub={byGroup[0] ? `최다 ${byGroup[0][0]}` : ""} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {["전체", ...groups].map((c) => (
          <button key={c} type="button" data-active={isAll ? c === "전체" : selected.includes(c)} className="ui-filter h-7 cursor-pointer rounded-md px-2.5 text-xs transition-colors"
            onClick={() => { if (c === "전체") { setSelected([]); return; } setSelected(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]); }}>{c}</button>
        ))}
        <span className="mx-1.5 h-4 w-px bg-border" aria-hidden />
        <span className="text-xs font-semibold text-muted-foreground">조별</span>
        {(["전체", "주간", "연장", "야간"] as const).map((sh) => (
          <button key={sh} type="button" data-active={shift === sh} className="ui-filter h-7 cursor-pointer rounded-md px-2.5 text-xs transition-colors"
            onClick={() => setShift(sh)}>{sh}</button>
        ))}
      </div>

      <section className="mb-6 rounded-md border border-border bg-card p-3">
        <h2 className="mb-2 text-sm font-bold">
          일자별 출면 인원 <span className="text-xs font-normal text-muted-foreground">선: 일일 출면 인원 (당일 기준)</span>
        </h2>
        <div className="w-full overflow-x-auto">
          <ComposedChart width={chartWidth} height={chartHeight} data={chart} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="day" tick={{ fontSize: 11 }} interval={days.length > 60 ? 2 : 0} angle={days.length > 20 ? -45 : 0} textAnchor={days.length > 20 ? "end" : "middle"} height={days.length > 20 ? 52 : 30} />
            <YAxis tick={{ fontSize: 11 }} domain={[0, Math.ceil((dailyMax * 1.1) / 10) * 10]} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="보고" stroke="var(--chart-1)" dot={{ r: 2 }} strokeWidth={2} isAnimationActive={false} />
            <Line type="monotone" dataKey="재집계" stroke="var(--chart-4)" dot={{ r: 2 }} strokeWidth={2} strokeDasharray="5 4" isAnimationActive={false} />
          </ComposedChart>
        </div>
      </section>

      <MonthlyShiftChart cards={groupOnly} />

      <h2 className="mb-2 text-sm font-bold">
        {DIM_LABEL[dim]} 연인원 <span className="text-xs font-normal text-muted-foreground">{selLabel}</span>
      </h2>
      <section className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[820px] text-xs">
          <caption className="sr-only">{DIM_LABEL[dim]} 기간 연인원</caption>
          <thead className="bg-muted/60">
            <tr className="[&>th]:border-b [&>th]:border-border [&>th]:px-2 [&>th]:py-2 [&>th]:text-left">
              <th scope="col">{DIM_LABEL[dim].replace("별", "")}</th>
              {(["총계", "주간", "연장", "야간"] as const).flatMap((label) => [<th key={`${label}-n`} scope="col" className="!text-right">{label}</th>, <th key={`${label}-p`} scope="col" className="!text-right">비중</th>])}
            </tr>
          </thead>
          <tbody>
            {byGroup.map(([c, v]) => (
              <tr key={c} className={`cursor-pointer [&>td]:border-b [&>td]:border-border/60 [&>td]:px-2 [&>td]:py-1.5 ${isAll || selected.includes(c) ? "bg-primary/10" : "hover:bg-muted/40"}`}
                onClick={() => setSelected(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])}>
                <td className="font-medium">{c}</td>
                {(["total", "day", "ot", "night"] as const).flatMap((key) => [
                  <td key={`${key}-n`} className={`text-right ${key === "total" ? "font-bold" : ""}`}>{v[key].toLocaleString()}</td>,
                  <td key={`${key}-p`} className="text-right text-muted-foreground">{groupSums[key] ? `${((v[key] / groupSums[key]) * 100).toFixed(1)}%` : "—"}</td>,
                ])}
              </tr>
            ))}
            {!byGroup.length && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">기간 내 보고가 없습니다.</td></tr>}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}

/** 협력사별 월간 주간·연장·야간 인원 추이 (협력사 보고 기준) */
function MonthlyShiftChart({ cards }: { cards: MpCard[] }) {
  const [company, setCompany] = useState("전체");
  const sub = useMemo(() => cards.filter((c) => c.source === "SUB"), [cards]);
  const companyList = useMemo(() => [...new Set(sub.map((c) => c.company))].sort(), [sub]);
  const picked = companyList.includes(company) ? company : "전체";

  const data = useMemo(() => {
    const m = new Map<string, { month: string; 주간: number; 연장: number; 야간: number; 계: number }>();
    sub.filter((c) => picked === "전체" || c.company === picked).forEach((c) => {
      const month = c.report_date.slice(0, 7);
      let row = m.get(month);
      if (!row) { row = { month, 주간: 0, 연장: 0, 야간: 0, 계: 0 }; m.set(month, row); }
      if (c.shift === "Day Shift") row.주간 += c.subtotal;
      else if (c.shift === "Overtime") row.연장 += c.subtotal;
      else if (c.shift === "Night Shift") row.야간 += c.subtotal;
      row.계 += c.subtotal;
    });
    return [...m.values()].sort((a, b) => a.month.localeCompare(b.month));
  }, [sub, picked]);

  const max = Math.max(1, ...data.map((r) => r.계));
  const width = Math.max(560, data.length * 110);
  const height = max > 8000 ? 460 : max > 3000 ? 400 : 340;

  return (
    <section className="mb-6 rounded-md border border-border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold">
          협력사별 월간 조별 인원 <span className="text-xs font-normal text-muted-foreground">누적 막대: 주간·연장·야간 (협력사 보고 기준)</span>
        </h2>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {["전체", ...companyList].map((c) => (
          <button key={c} type="button" data-active={picked === c} className="ui-filter h-7 cursor-pointer rounded-md px-2.5 text-xs transition-colors" onClick={() => setCompany(c)}>{c}</button>
        ))}
      </div>
      {data.length ? (
        <div className="w-full overflow-x-auto">
          <ComposedChart width={width} height={height} data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} domain={[0, Math.ceil((max * 1.1) / 10) * 10]} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="주간" stackId="s" fill="var(--chart-1)" maxBarSize={72} />
            <Bar dataKey="연장" stackId="s" fill="var(--chart-3)" maxBarSize={72} />
            <Bar dataKey="야간" stackId="s" fill="var(--chart-4)" radius={[2, 2, 0, 0]} maxBarSize={72} />
          </ComposedChart>
        </div>
      ) : (
        <p className="p-6 text-center text-xs text-muted-foreground">기간 내 보고가 없습니다.</p>
      )}
    </section>
  );
}
