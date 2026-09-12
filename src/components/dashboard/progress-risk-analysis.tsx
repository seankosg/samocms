import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, ChevronRight } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { avgOf, isLate, MSDEF, pct1, SLOT_LABEL, type Row } from "@/lib/schedule-model";
import { stageDone, TC_STAGES, TC_STAGE_SUB, type TcItem, type TcStage } from "@/lib/tc-model";
import { cn } from "@/lib/utils";

type RowDimension = "dept" | "bldg" | "mgr" | "sub" | "ms";
type Dimension = RowDimension | "tc";

const DIMENSIONS: { key: Dimension; label: string }[] = [
  { key: "dept", label: "담당부서별" },
  { key: "bldg", label: "건물별" },
  { key: "mgr", label: "담당자별" },
  { key: "sub", label: "협력사별" },
  { key: "ms", label: "마일스톤별" },
  { key: "tc", label: "T&C별" },
];

const TC_PLAN_COL: Record<TcStage, keyof TcItem> = {
  T0: "t0_p", T1: "t1_p", Report: "rp_p", RFI: "rfi_p", T2: "t2_p", Response: "resp_p",
};

type GroupMetric = {
  key: string;
  label: string;
  total: number;
  planned: number;
  actual: number;
  gap: number;
  ahead: number;
  late: number;
  avgGap: number;
  avgDelayDays: number;
  maxDelayDays: number;
  short: number;
  medium: number;
  long: number;
  severity: "critical" | "warning" | "watch";
};

const groupValue = (row: Row, dimension: RowDimension) => {
  const raw = row[dimension];
  const value = String(raw ?? "").trim();
  return value || "미지정";
};

const displayLabel = (value: string, dimension: RowDimension) => {
  if (dimension === "dept") return SLOT_LABEL[value] ?? value;
  if (dimension === "ms") return value === "미지정" ? value : `${value} ${MSDEF[value] ?? ""}`.trim();
  return value;
};

const taskDelayDays = (row: Row) => {
  if (!isLate(row)) return 0;
  const duration = row.s && row.e
    ? Math.max(1, Math.round((Date.parse(row.e) - Date.parse(row.s)) / 864e5) + 1)
    : 1;
  return Math.max(1, Math.round(((row.pl ?? 0) - (row.pc ?? 0)) * duration));
};

function aggregate(rows: Row[], dimension: RowDimension): GroupMetric[] {
  const groups = new Map<string, Row[]>();
  rows.forEach((row) => {
    const key = groupValue(row, dimension);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });

  return [...groups.entries()].map(([key, list]) => {
    const measured = list.filter((row) => row.pl != null || row.pc != null);
    const lateRows = measured.filter(isLate);
    const delayDays = lateRows.map(taskDelayDays);
    const planned = avgOf(measured, "pl") * 100;
    const actual = avgOf(measured, "pc") * 100;
    const avgGap = lateRows.length
      ? lateRows.reduce((sum, row) => sum + ((row.pl ?? 0) - (row.pc ?? 0)), 0) / lateRows.length * 100
      : 0;
    const avgDelayDays = delayDays.length ? delayDays.reduce((sum, days) => sum + days, 0) / delayDays.length : 0;
    const maxDelayDays = delayDays.length ? Math.max(...delayDays) : 0;
    const long = delayDays.filter((days) => days >= 14).length;
    const medium = delayDays.filter((days) => days >= 7 && days < 14).length;
    const short = delayDays.filter((days) => days > 0 && days < 7).length;
    const severity: GroupMetric["severity"] = avgGap >= 20 || maxDelayDays >= 14
      ? "critical"
      : avgGap >= 10 || maxDelayDays >= 7
        ? "warning"
        : "watch";
    return {
      key,
      label: displayLabel(key, dimension),
      total: measured.length,
      planned,
      actual,
      gap: actual - planned,
      ahead: measured.filter((row) => (row.pc ?? 0) > (row.pl ?? 0)).length,
      late: lateRows.length,
      avgGap,
      avgDelayDays,
      maxDelayDays,
      short,
      medium,
      long,
      severity,
    };
  }).filter((group) => group.total > 0);
}

/** T&C 단계별 집계 — 계획 누계 Qty 대비 완료 Qty, 계획일 경과 미완료 항목을 지연으로 산정 */
function aggregateTc(items: TcItem[], base: string | null): GroupMetric[] {
  const total = items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  if (!total) return [];

  return TC_STAGES.map((stage) => {
    const planCol = TC_PLAN_COL[stage];
    let planQty = 0, doneQty = 0, ahead = 0;
    const delayDays: number[] = [];

    items.forEach((item) => {
      const qty = Number(item.qty) || 0;
      const planDate = item[planCol] as string | null;
      const due = !!planDate && !!base && planDate <= base;
      const done = stageDone(item, stage);
      if (done) doneQty += qty;
      if (due) planQty += qty;
      if (done && !due) ahead += 1;
      if (!done && due && base && planDate) {
        delayDays.push(Math.max(1, Math.round((Date.parse(base) - Date.parse(planDate)) / 864e5)));
      }
    });

    const planned = (planQty / total) * 100;
    const actual = (doneQty / total) * 100;
    const late = delayDays.length;
    const avgGap = Math.max(0, planned - actual);
    const avgDelayDays = late ? delayDays.reduce((sum, days) => sum + days, 0) / late : 0;
    const maxDelayDays = late ? Math.max(...delayDays) : 0;
    const long = delayDays.filter((days) => days >= 14).length;
    const medium = delayDays.filter((days) => days >= 7 && days < 14).length;
    const short = delayDays.filter((days) => days > 0 && days < 7).length;
    const severity: GroupMetric["severity"] = avgGap >= 20 || maxDelayDays >= 14
      ? "critical"
      : avgGap >= 10 || maxDelayDays >= 7
        ? "warning"
        : "watch";

    return {
      key: stage,
      label: `${stage} · ${TC_STAGE_SUB[stage]}`,
      total: items.length,
      planned,
      actual,
      gap: actual - planned,
      ahead,
      late,
      avgGap,
      avgDelayDays,
      maxDelayDays,
      short,
      medium,
      long,
      severity,
    };
  });
}

const searchFor = (dimension: RowDimension, key: string) => {
  if (key === "미지정") return {};
  if (dimension === "dept") return { dept: key };
  if (dimension === "bldg") return { bldg: key };
  if (dimension === "sub") return { sub: key };
  if (dimension === "ms") return { ms: key };
  return { q: key };
};

export function ProgressRiskAnalysis({ rows, tcItems = [], base = null }: { rows: Row[]; tcItems?: TcItem[]; base?: string | null }) {
  const [progressDimension, setProgressDimension] = useState<Dimension>("dept");
  const [riskDimension, setRiskDimension] = useState<Dimension>("dept");
  const navigate = useNavigate();
  const all = useMemo((): Record<Dimension, GroupMetric[]> => ({
    dept: aggregate(rows, "dept"),
    bldg: aggregate(rows, "bldg"),
    mgr: aggregate(rows, "mgr"),
    sub: aggregate(rows, "sub"),
    ms: aggregate(rows, "ms"),
    tc: aggregateTc(tcItems, base),
  }), [rows, tcItems, base]);

  const progress = progressDimension === "tc"
    ? all.tc
    : [...all[progressDimension]].sort((a, b) => b.total - a.total);
  const risks = [...all[riskDimension]]
    .filter((group) => group.late > 0)
    .sort((a, b) => b.long - a.long || b.maxDelayDays - a.maxDelayDays || b.avgGap - a.avgGap)
    .slice(0, 10);
  const chartWidth = Math.max(620, progress.length * (progressDimension === "tc" ? 130 : 92));

  const openList = (dimension: Dimension, key: string, late = false) => {
    if (dimension === "tc") {
      void navigate({ to: "/tc/progress", search: { stages: key } });
      return;
    }
    void navigate({
      to: late ? "/delays" : "/schedule",
      search: searchFor(dimension, key),
    });
  };

  return (
    <section className="mt-6 grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
      <article className="min-w-0 overflow-hidden rounded-md border border-border bg-card shadow-sm">
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border p-4">
          <div>
            <h2 className="text-sm font-bold">전체 공정 진도 현황</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">계획 대비 실적 · 막대를 선택하면 상세 목록으로 이동</p>
          </div>
          <span className="rounded-sm bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">기준일 재계산</span>
        </header>
        <DimensionTabs value={progressDimension} onChange={setProgressDimension} />
        <div className="overflow-x-auto p-3 sm:p-4">
          <div style={{ width: chartWidth, minWidth: "100%" }}>
            <ResponsiveContainer width="100%" height={315}>
              <BarChart
                data={progress}
                barGap={2}
                barCategoryGap="22%"
                margin={{ top: 52, right: 10, bottom: progress.length > 7 ? 45 : 20, left: -12 }}
                onClick={(state) => {
                  const payload = state?.activePayload?.[0]?.payload as GroupMetric | undefined;
                  if (payload) openList(progressDimension, payload.key);
                }}
              >
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  angle={progress.length > 7 ? -30 : 0}
                  textAnchor={progress.length > 7 ? "end" : "middle"}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                />
                <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                <Tooltip content={<ProgressTooltip />} cursor={{ fill: "var(--muted)" }} />
                <Bar dataKey="planned" name="계획" fill="var(--schedule-plan)" radius={[3, 3, 0, 0]}>
                  <LabelList dataKey="planned" content={<ProgressLabel kind="planned" rows={progress} />} />
                </Bar>
                <Bar dataKey="actual" name="실적" fill="var(--schedule-actual)" radius={[3, 3, 0, 0]}>
                  <LabelList dataKey="actual" content={<ProgressLabel kind="actual" rows={progress} />} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </article>

      <article className="min-w-0 overflow-hidden rounded-md border border-border bg-card shadow-sm">
        <header className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-bold"><AlertTriangle className="size-4 text-destructive" />지연 리스크 통합 분석</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">평균 진도 격차와 환산 지연일 기준 우선순위</p>
          </div>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => void navigate({ to: "/delays" })}>
            전체 보기 <ArrowRight className="size-3" />
          </Button>
        </header>
        <DimensionTabs value={riskDimension} onChange={setRiskDimension} />
        <div className="grid grid-cols-[minmax(0,1fr)_74px_70px] gap-2 border-b border-border bg-muted/25 px-4 py-2 text-[9px] font-bold text-muted-foreground">
          <span>대상 · 지속 구간</span><span className="text-right">평균 격차</span><span className="text-right">최장 환산</span>
        </div>
        <div className="max-h-[350px] divide-y divide-border overflow-y-auto">
          {risks.length === 0 && <p className="p-8 text-center text-xs text-muted-foreground">지연 항목이 없습니다.</p>}
          {risks.map((group) => {
            const segments = group.short + group.medium + group.long || 1;
            return (
              <button
                key={group.key}
                type="button"
                onClick={() => openList(riskDimension, group.key, true)}
                className={cn(
                  "grid w-full grid-cols-[minmax(0,1fr)_74px_70px] items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  group.severity === "critical" && "bg-destructive/5",
                  group.severity === "warning" && "bg-chart-2/5",
                )}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1 text-xs font-bold">
                    <span className="truncate" title={group.label}>{group.label}</span>
                    <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
                  </span>
                  <span className="mt-1.5 flex h-2 overflow-hidden rounded-sm bg-muted" aria-label={`단기 ${group.short}, 중기 ${group.medium}, 장기 ${group.long}`}>
                    <span className="bg-chart-3" style={{ width: `${group.short / segments * 100}%` }} />
                    <span className="bg-chart-2" style={{ width: `${group.medium / segments * 100}%` }} />
                    <span className="bg-destructive" style={{ width: `${group.long / segments * 100}%` }} />
                  </span>
                  <span className="mt-1 block text-[9px] text-muted-foreground">지연 {group.late}건 · 1~6일 {group.short} · 7~13일 {group.medium} · 14일+ {group.long}</span>
                </span>
                <span className={cn("text-right text-xs font-bold", group.avgGap >= 20 ? "text-destructive" : group.avgGap >= 10 ? "text-chart-2" : "text-foreground")}>{pct1(group.avgGap / 100)}%p</span>
                <span className={cn("text-right text-xs font-bold", group.maxDelayDays >= 14 ? "text-destructive" : group.maxDelayDays >= 7 ? "text-chart-2" : "text-muted-foreground")}>{group.maxDelayDays}일</span>
              </button>
            );
          })}
        </div>
        <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-muted/25 px-4 py-2 text-[9px] text-muted-foreground">
          <span><i className="mr-1 inline-block size-2 rounded-sm bg-chart-3" />1~6일</span>
          <span><i className="mr-1 inline-block size-2 rounded-sm bg-chart-2" />7~13일</span>
          <span><i className="mr-1 inline-block size-2 rounded-sm bg-destructive" />14일 이상</span>
          <span className="sm:ml-auto">환산 지연일 = 계획·실적 격차 × 작업기간</span>
        </footer>
      </article>
    </section>
  );
}

function DimensionTabs({ value, onChange }: { value: Dimension; onChange: (value: Dimension) => void }) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as Dimension)}>
      <TabsList className="grid h-10 w-full grid-cols-4 rounded-none border-b border-border bg-muted/25 p-0">
        {DIMENSIONS.map((dimension) => (
          <TabsTrigger
            key={dimension.key}
            value={dimension.key}
            className="h-10 rounded-none border-b-2 border-transparent px-1 text-[10px] shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none sm:text-[11px]"
          >
            {dimension.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function ProgressTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: GroupMetric }> }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-md border border-border bg-popover p-2 text-[11px] text-popover-foreground shadow-md">
      <p className="font-bold">{row.label}</p>
      <p className="mt-1">계획 {pct1(row.planned / 100)}% · 실적 {pct1(row.actual / 100)}%</p>
      <p className={row.gap < 0 ? "text-destructive" : "text-primary"}>차이 {row.gap > 0 ? "+" : ""}{pct1(row.gap / 100)}%p</p>
      <p className="text-muted-foreground">선행 {row.ahead}건 · 지연 {row.late}건 · 전체 {row.total}건</p>
    </div>
  );
}

function ProgressLabel({ x = 0, y = 0, width = 0, value = 0, index = 0, kind, rows }: {
  x?: number; y?: number; width?: number; value?: number; index?: number; kind: "planned" | "actual"; rows: GroupMetric[];
}) {
  const row = rows[index];
  if (!row) return null;
  if (kind === "planned") {
    return <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize="9" fill="var(--muted-foreground)">{Math.round(value)}%</text>;
  }
  return (
    <g>
      <text x={x + width / 2} y={y - 34} textAnchor="middle" fontSize="9" fontWeight="700">
        <tspan fill="var(--primary)">▲{row.ahead}</tspan><tspan fill="var(--muted-foreground)"> </tspan><tspan fill="var(--destructive)">▼{row.late}</tspan>
      </text>
      <text x={x + width / 2} y={y - 20} textAnchor="middle" fontSize="9" fontWeight="700" fill={row.gap < 0 ? "var(--destructive)" : "var(--primary)"}>{row.gap > 0 ? "+" : ""}{row.gap.toFixed(1)}p</text>
      <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--foreground)">{Math.round(value)}%</text>
    </g>
  );
}