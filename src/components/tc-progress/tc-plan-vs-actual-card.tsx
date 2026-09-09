// Plan vs Actual S-Curve (QAIL SnagPlanVsActualCard 이식)
import { useMemo } from "react";
import {
  Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { ProgressChartLegend, VarianceLegend, type LegendMetric } from "./progress-chart-legend";
import { useProgressLegend } from "./use-progress-legend";
import { bucketTargetTerm, type SCurveResult } from "@/lib/tc-scurve-utils";
import { STAGE_COLORS, STAGE_LABELS, type Bucket, type Unit } from "@/lib/tc-progress-utils";
import type { TcStage } from "@/lib/tc-model";

const dataKey = (stage: string, series: string) => `${stage}__${series}`;

export function TcPlanVsActualCard({
  scurve, stages, bucket, unit, totals, base,
}: {
  scurve: SCurveResult;
  stages: TcStage[];
  bucket: Bucket;
  unit: Unit;
  totals: Record<TcStage, number>;
  base: string;
}) {
  const legend = useProgressLegend({
    metricKeys: stages,
    seriesKeys: ["plan", "actual"],
    dataKey,
  });

  const rows = useMemo(() => scurve.buckets.map((b, i) => {
    const r: Record<string, string | number | null> = { bucket: scurve.bucketLabels[i] ?? b, iso: b };
    for (const st of stages) {
      const s = scurve.series[st];
      r[dataKey(st, "plan")] = s.dailyPlan[i] ?? 0;
      r[dataKey(st, "actual")] = s.dailyActual[i] ?? null;
      r[`${st}__cumPlan`] = s.cumPlan[i] ?? 0;
      r[`${st}__cumActual`] = s.cumActual[i] ?? null;
    }
    const cp = stages.reduce((a, st) => a + (scurve.series[st].cumPlan[i] ?? 0), 0);
    const caVals = stages.map((st) => scurve.series[st].cumActual[i]);
    const ca = caVals.some((v) => v === null) ? null : caVals.reduce((a: number, v) => a + (v as number), 0);
    r["cumPlanAll"] = cp;
    r["cumActualAll"] = ca;
    r["variance"] = ca === null ? null : ca - cp;
    return r;
  }), [scurve, stages]);

  const metrics: LegendMetric[] = stages.map((st) => ({ key: st, label: STAGE_LABELS[st], color: STAGE_COLORS[st].line }));
  const term = bucketTargetTerm(bucket);
  const unitLabel = unit === "qty" ? "수량" : "건수";
  const baseLabel = scurve.todayIndex >= 0 ? scurve.bucketLabels[scurve.todayIndex] : undefined;

  const last = rows[rows.length - 1];
  const totalScope = stages.reduce((a, st) => a + (totals[st] ?? 0), 0);
  const cumPlan = Number(last?.["cumPlanAll"] ?? 0);
  const atBase = scurve.todayIndex >= 0 ? rows[scurve.todayIndex] : undefined;
  const planAtBase = Number(atBase?.["cumPlanAll"] ?? 0);
  const actualAtBase = Number(atBase?.["cumActualAll"] ?? 0);
  const variance = actualAtBase - planAtBase;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <h2 className="text-sm font-bold">Plan vs Actual S-Curve</h2>
        <Kpi label="Total Scope" value={totalScope} />
        <Kpi label={`계획 누계 (${base})`} value={planAtBase} />
        <Kpi label="실적 누계" value={actualAtBase} />
        <Kpi label="차이" value={variance} signed />
        <Kpi label="전체 계획" value={cumPlan} muted />
      </div>

      <ProgressChartLegend
        metrics={metrics}
        hiddenMetrics={legend.hiddenMetrics}
        onToggleMetric={legend.toggleMetric}
        hiddenSeries={legend.hiddenSeries}
        onToggleSeries={legend.toggleSeries}
        axes={{ left: `${term} (${unitLabel})`, right: `누계 (${unitLabel})` }}
        showReset={legend.canReset}
        onReset={legend.reset}
      />

      <div className="h-[360px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
            <XAxis dataKey="bucket" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={16} />
            <YAxis yAxisId="left" tick={{ fontSize: 10 }} allowDecimals={false} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 6 }}
              formatter={(v: number | string, n: string) => [v as number, n.replace("__", " ")]}
            />
            <Legend wrapperStyle={{ display: "none" }} />
            {baseLabel && (
              <ReferenceLine yAxisId="left" x={baseLabel} stroke="hsl(0,72%,51%)" strokeDasharray="4 3"
                label={{ value: `기준일 ${base}`, position: "top", fontSize: 10, fill: "hsl(0,72%,51%)" }} />
            )}
            {stages.map((st) => (
              <Bar
                key={`${st}-plan`} yAxisId="left" stackId="plan"
                dataKey={dataKey(st, "plan")} name={`${STAGE_LABELS[st]} 계획`}
                fill={STAGE_COLORS[st].bar} stroke={STAGE_COLORS[st].line} strokeDasharray="3 2"
                hide={legend.hidden.has(dataKey(st, "plan"))} isAnimationActive={false}
              />
            ))}
            {stages.map((st) => (
              <Bar
                key={`${st}-actual`} yAxisId="left" stackId="actual"
                dataKey={dataKey(st, "actual")} name={`${STAGE_LABELS[st]} 실적`}
                fill={STAGE_COLORS[st].line}
                hide={legend.hidden.has(dataKey(st, "actual"))} isAnimationActive={false}
              />
            ))}
            {stages.map((st) => (
              <Line
                key={`${st}-cumP`} yAxisId="right" type="monotone" dataKey={`${st}__cumPlan`}
                name={`${STAGE_LABELS[st]} 계획누계`} stroke={STAGE_COLORS[st].line} strokeDasharray="5 3"
                dot={false} strokeWidth={1.5} hide={legend.hidden.has(dataKey(st, "plan"))} isAnimationActive={false}
              />
            ))}
            {stages.map((st) => (
              <Line
                key={`${st}-cumA`} yAxisId="right" type="monotone" dataKey={`${st}__cumActual`}
                name={`${STAGE_LABELS[st]} 실적누계`} stroke={STAGE_COLORS[st].line}
                dot={false} strokeWidth={2.2} connectNulls={false}
                hide={legend.hidden.has(dataKey(st, "actual"))} isAnimationActive={false}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <VarianceLegend unitNote={`차이 (${unitLabel})`} />
      <div className="h-[120px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="bucket" tick={{ fontSize: 9 }} interval="preserveStartEnd" minTickGap={16} />
            <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
            <ReferenceLine y={0} stroke="currentColor" opacity={0.4} />
            {baseLabel && <ReferenceLine x={baseLabel} stroke="hsl(0,72%,51%)" strokeDasharray="4 3" />}
            <Bar dataKey="variance" name="차이" isAnimationActive={false}>
              {rows.map((r, i) => (
                <Cell key={i} fill={Number(r["variance"] ?? 0) >= 0 ? "hsl(160,60%,42%)" : "hsl(0,72%,51%)"} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Kpi({ label, value, signed, muted }: { label: string; value: number; signed?: boolean; muted?: boolean }) {
  const color = signed ? (value < 0 ? "text-schedule-short" : value > 0 ? "text-schedule-over" : "") : muted ? "text-muted-foreground" : "";
  return (
    <div className="leading-tight">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-bold tabular-nums", color)}>
        {signed && value > 0 ? "+" : ""}{Math.round(value * 10) / 10}
      </div>
    </div>
  );
}
