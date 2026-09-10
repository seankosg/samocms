import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import * as XLSX from "xlsx";
import { Download } from "lucide-react";
import { CartesianGrid, ComposedChart, Bar, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { AppShell } from "@/components/app-shell";
import { Kpi } from "@/routes/_authenticated/manpower.index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { manpowerRangeQuery, useManpower, defaultRange } from "@/lib/use-manpower";
import { dateRange, movingAverage, riyadhToday, addDays, totalsByDate } from "@/lib/manpower-model";
import { MP } from "@/lib/manpower-i18n";

const search = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  company: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/manpower/trend")({
  head: () => ({ meta: [
    { title: "출면 추이 | HMMME 통합 공정 관리" },
    { name: "description", content: "기간별 출면 인원 추이와 근무일 기준 7일 이동평균, 협력사별 투입 비중을 확인합니다." },
    { property: "og:title", content: "HMMME 출면 추이" },
    { property: "og:description", content: "기간별 인력 투입 흐름을 확인하세요." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  validateSearch: (s: unknown) => search.parse(s),
  loaderDeps: ({ search: s }) => {
    const d = defaultRange();
    return { from: s.from ?? d.from, to: s.to ?? d.to };
  },
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(manpowerRangeQuery(deps.from, deps.to)),
  errorComponent: ({ error }) => <div role="alert" className="p-8 text-sm">추이 데이터를 불러오지 못했습니다. {(error as Error).message}</div>,
  component: TrendPage,
});

function TrendPage() {
  const s = Route.useSearch();
  const navigate = Route.useNavigate();
  const def = defaultRange();
  const from = s.from ?? def.from;
  const to = s.to ?? def.to;
  const { cards, daily, isWorkday, plan } = useManpower(from, to);
  const [company, setCompany] = useState(s.company ?? "전체");

  const companies = useMemo(() => [...new Set(cards.map((c) => c.company))].sort(), [cards]);
  const filtered = useMemo(() => daily.filter((d) => company === "전체" || d.company === company), [daily, company]);
  const days = useMemo(() => dateRange(from, to), [from, to]);

  const subTotals = useMemo(() => totalsByDate(filtered, "SUB"), [filtered]);
  const hdecTotals = useMemo(() => totalsByDate(filtered, "HDEC"), [filtered]);
  const ma = useMemo(() => movingAverage(days, subTotals, isWorkday, 7), [days, subTotals, isWorkday]);
  const planByDate = useMemo(() => {
    const m = new Map<string, number>();
    plan.filter((p) => company === "전체" || p.company === company)
      .forEach((p) => m.set(p.plan_date, (m.get(p.plan_date) ?? 0) + p.planned_total));
    return m;
  }, [plan, company]);

  const chart = days.map((d, i) => ({
    day: d.slice(5),
    보고: subTotals.get(d) ?? 0,
    재집계: hdecTotals.get(d) ?? 0,
    "7일 이동평균": ma[i] == null ? null : Math.round(ma[i]! * 10) / 10,
    계획: planByDate.get(d) ?? null,
    휴무: isWorkday(d) ? 0 : 1,
  }));

  const workDays = days.filter(isWorkday);
  const sum = workDays.reduce((a, d) => a + (subTotals.get(d) ?? 0), 0);
  const avg = workDays.length ? sum / workDays.length : 0;
  const peakDay = days.reduce((best, d) => ((subTotals.get(d) ?? 0) > (subTotals.get(best) ?? 0) ? d : best), days[0] ?? from);

  const byCompany = useMemo(() => {
    const m = new Map<string, number>();
    daily.filter((d) => d.source === "SUB").forEach((d) => m.set(d.company, (m.get(d.company) ?? 0) + d.total));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [daily]);

  const exportXlsx = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(days.map((d, i) => ({
      일자: d, 근무일: isWorkday(d) ? "Y" : "N", 협력사보고: subTotals.get(d) ?? 0,
      HDEC재집계: hdecTotals.get(d) ?? 0, "7일이동평균": ma[i], 계획: planByDate.get(d) ?? null,
    }))), "출면추이");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(byCompany.map(([c, v]) => ({ 협력사: c, 연인원: v }))), "협력사별");
    XLSX.writeFile(wb, `HMMME_출면추이_${from.replace(/-/g, "")}_${to.replace(/-/g, "")}.xlsx`);
  };

  const setRange = (k: "from" | "to", v: string) => navigate({ search: (p) => ({ ...p, [k]: v }), replace: true });
  const quick = (n: number) => navigate({ search: (p) => ({ ...p, from: addDays(riyadhToday(), -(n - 1)), to: riyadhToday() }), replace: true });

  return (
    <AppShell
      title={MP.trend}
      desc={`${from} ~ ${to} · 근무일 ${workDays.length}일 · 연인원 ${sum.toLocaleString()}명`}
      actions={
        <>
          {[7, 30, 90].map((n) => <Button key={n} size="sm" variant="outline" className="h-8 text-xs" onClick={() => quick(n)}>{n}일</Button>)}
          <Input type="date" aria-label="시작일" value={from} onChange={(e) => setRange("from", e.target.value)} className="h-8 w-[140px] text-xs" />
          <Input type="date" aria-label="종료일" value={to} onChange={(e) => setRange("to", e.target.value)} className="h-8 w-[140px] text-xs" />
          <Button size="sm" variant="outline" onClick={exportXlsx}><Download className="size-3.5" />엑셀</Button>
        </>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="연인원" value={sum.toLocaleString()} sub="근무일 합계" />
        <Kpi label="근무일 평균" value={avg.toFixed(1)} sub={`${workDays.length}일 기준`} />
        <Kpi label="최대 투입일" value={String(subTotals.get(peakDay) ?? 0)} sub={peakDay} />
        <Kpi label="참여 협력사" value={String(byCompany.length)} sub={byCompany[0] ? `최다 ${byCompany[0][0]}` : ""} />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {["전체", ...companies].map((c) => (
          <Button key={c} size="sm" variant={company === c ? "default" : "outline"} className="h-7 text-xs"
            onClick={() => { setCompany(c); navigate({ search: (p) => ({ ...p, company: c }), replace: true }); }}>{c}</Button>
        ))}
      </div>

      <section className="mb-6 rounded-md border border-border bg-card p-3">
        <h2 className="mb-2 text-sm font-bold">일자별 출면 인원</h2>
        <div className="h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="보고" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
              <Bar dataKey="재집계" fill="hsl(var(--muted-foreground))" radius={[2, 2, 0, 0]} />
              <Line type="monotone" dataKey="7일 이동평균" stroke="hsl(var(--destructive))" dot={false} strokeWidth={2} connectNulls />
              <Line type="monotone" dataKey="계획" stroke="hsl(var(--chart-2, 200 80% 45%))" dot={false} strokeDasharray="5 4" connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <h2 className="mb-2 text-sm font-bold">협력사별 연인원</h2>
      <section className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[420px] text-xs">
          <caption className="sr-only">협력사별 기간 연인원</caption>
          <thead className="bg-muted/60">
            <tr className="[&>th]:border-b [&>th]:border-border [&>th]:px-2 [&>th]:py-2 [&>th]:text-left">
              <th scope="col">{MP.company}</th><th scope="col" className="!text-right">연인원</th>
              <th scope="col" className="!text-right">비중</th><th scope="col" className="!text-right">근무일 평균</th>
            </tr>
          </thead>
          <tbody>
            {byCompany.map(([c, v]) => (
              <tr key={c} className="[&>td]:border-b [&>td]:border-border/60 [&>td]:px-2 [&>td]:py-1.5">
                <td className="font-medium">{c}</td>
                <td className="text-right font-bold">{v.toLocaleString()}</td>
                <td className="text-right text-muted-foreground">{sum ? `${((v / byCompany.reduce((a, x) => a + x[1], 0)) * 100).toFixed(1)}%` : "—"}</td>
                <td className="text-right text-muted-foreground">{workDays.length ? (v / workDays.length).toFixed(1) : "—"}</td>
              </tr>
            ))}
            {!byCompany.length && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">기간 내 보고가 없습니다.</td></tr>}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
