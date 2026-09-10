// 검증 대조 차이 시각화 — 일별 차이/누적 차이, 협력사별 누적 차이
import { useMemo } from "react";
import {
  Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { CompareRow } from "@/lib/manpower-model";

const POS = "hsl(160,60%,42%)"; // 보고 > 검증 이 아니라, diff = 검증 - 보고 (+ = 보고 누락 반대)
const NEG = "hsl(0,72%,51%)";

const barColor = (v: number) => (v < 0 ? NEG : v > 0 ? POS : "hsl(215,16%,65%)");

export function CompareDiffCharts({ rows, day }: { rows: CompareRow[]; day: string }) {
  const daily = useMemo(() => {
    const m = new Map<string, { diff: number; abs: number }>();
    for (const r of rows) {
      const d = r.report_date;
      const cur = m.get(d) ?? { diff: 0, abs: 0 };
      cur.diff += r.diff ?? 0;
      cur.abs += Math.abs(r.diff ?? 0);
      m.set(d, cur);
    }
    let cum = 0;
    return [...m.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => {
        cum += v.diff;
        return { date, label: date.slice(5), diff: v.diff, abs: v.abs, cum };
      });
  }, [rows]);

  const byCompany = useMemo(() => {
    const m = new Map<string, { diff: number; abs: number; cards: number }>();
    for (const r of rows) {
      const cur = m.get(r.company) ?? { diff: 0, abs: 0, cards: 0 };
      cur.diff += r.diff ?? 0;
      cur.abs += Math.abs(r.diff ?? 0);
      cur.cards += r.result === "MATCH" ? 0 : 1;
      m.set(r.company, cur);
    }
    return [...m.entries()]
      .map(([company, v]) => ({ company, ...v }))
      .filter((r) => r.abs > 0)
      .sort((a, b) => b.abs - a.abs)
      .slice(0, 12);
  }, [rows]);

  const totalDiff = daily.reduce((s, d) => s + d.diff, 0);
  const totalAbs = daily.reduce((s, d) => s + d.abs, 0);

  return (
    <section className="mb-4 grid gap-3 lg:grid-cols-2">
      <div className="rounded-md border border-border p-3">
        <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold">일별 차이 · 누적 차이</h2>
          <span className="text-[11px] text-muted-foreground">
            기간 합계 {totalDiff > 0 ? `+${totalDiff}` : totalDiff}명 · 절대차 {totalAbs}명
          </span>
        </header>
        <div className="h-[260px] w-full">
          {daily.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={daily} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={12} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 6 }}
                  formatter={(v: number | string, n: string) => [v as number, n === "diff" ? "일별 차이" : "누적 차이"]}
                />
                <ReferenceLine yAxisId="left" y={0} stroke="currentColor" opacity={0.4} />
                <ReferenceLine yAxisId="left" x={day.slice(5)} stroke="hsl(215,90%,55%)" strokeDasharray="4 3" />
                <Bar yAxisId="left" dataKey="diff" name="diff" isAnimationActive={false}>
                  {daily.map((d) => <Cell key={d.date} fill={barColor(d.diff)} />)}
                </Bar>
                <Line yAxisId="right" type="monotone" dataKey="cum" name="cum" dot={false}
                  stroke="hsl(215,90%,55%)" strokeWidth={2} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          차이 = HDEC 재집계 − 협력사 보고. 음수(빨강)는 보고가 더 많고, 양수(초록)는 재집계가 더 많습니다.
        </p>
      </div>

      <div className="rounded-md border border-border p-3">
        <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold">협력사별 누적 차이</h2>
          <span className="text-[11px] text-muted-foreground">절대차 상위 {byCompany.length}개사</span>
        </header>
        <div className="w-full" style={{ height: Math.max(260, byCompany.length * 26 + 40) }}>
          {byCompany.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={byCompany} layout="vertical" margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="company" width={110} tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 6 }}
                  formatter={(v: number | string) => [v as number, "누적 차이"]}
                />
                <ReferenceLine x={0} stroke="currentColor" opacity={0.4} />
                <Bar dataKey="diff" name="누적 차이" isAnimationActive={false}>
                  {byCompany.map((c) => <Cell key={c.company} fill={barColor(c.diff)} />)}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </div>
      </div>
    </section>
  );
}

function Empty() {
  return <div className="flex h-full items-center justify-center text-xs text-muted-foreground">기간 내 대조 자료가 없습니다.</div>;
}
