// T&C S-Curve 시리즈 빌더 (QAIL scurve-utils 이식).
import { TC_STAGES, type TcItem, type TcStage } from "./tc-model";
import {
  ACT_COL, PLAN_COL, bucketEnd, labelDdMmm,
  type Bucket, type BucketCell, type MatrixResult, type Unit,
} from "./tc-progress-utils";

export interface SCurveStageSeries {
  stage: TcStage;
  dailyPlan: number[];
  dailyActual: (number | null)[];
  cumPlan: number[];
  cumActual: (number | null)[];
}
export interface SCurveResult {
  buckets: string[];
  bucketLabels: string[];
  todayIndex: number;
  series: Record<TcStage, SCurveStageSeries>;
}

function empty(stage: TcStage, n: number): SCurveStageSeries {
  return {
    stage,
    dailyPlan: new Array(n).fill(0),
    dailyActual: new Array(n).fill(0),
    cumPlan: new Array(n).fill(0),
    cumActual: new Array(n).fill(0),
  };
}

/** 매트릭스(그룹×단계×버킷) 결과에서 단계별 전체 합계 시리즈를 만든다. */
export function buildTcSCurve(opts: {
  matrix: MatrixResult;
  items: TcItem[];
  stages: TcStage[];
  base: string;
  bucket: Bucket;
  unit: Unit;
}): SCurveResult {
  const { matrix, items, stages, base, bucket, unit } = opts;
  const buckets = matrix.buckets;
  const n = buckets.length;
  const series = TC_STAGES.reduce((a, s) => { a[s] = empty(s, n); return a; }, {} as Record<TcStage, SCurveStageSeries>);

  for (const row of matrix.rows) {
    for (const st of stages) {
      const sr = row.stages[st];
      const target = series[st];
      sr.cells.forEach((c: BucketCell, i: number) => {
        target.dailyPlan[i] = (target.dailyPlan[i] ?? 0) + c.plan;
        target.dailyActual[i] = ((target.dailyActual[i] as number) ?? 0) + c.actual;
      });
    }
  }

  let todayIndex = -1;
  for (let i = 0; i < n; i++) {
    if (buckets[i]! >= base) { todayIndex = i; break; }
  }
  if (todayIndex === -1 && n > 0 && buckets[n - 1]! < base) todayIndex = n - 1;

  for (const st of stages) {
    const s = series[st];
    for (let i = 0; i < n; i++) {
      const through = bucketEnd(buckets[i] ?? base, bucket);
      s.cumPlan[i] = items.reduce((sum, item) => {
        const date = item[PLAN_COL[st]] as string | null;
        const value = unit === "qty" ? Number(item.qty) || 0 : 1;
        return sum + (date && date <= through ? value : 0);
      }, 0);
      const isFuture = todayIndex >= 0 && i > todayIndex;
      if (isFuture) {
        s.dailyActual[i] = null;
        s.cumActual[i] = null;
      } else {
        s.cumActual[i] = items.reduce((sum, item) => {
          const date = item[ACT_COL[st]] as string | null;
          const value = unit === "qty" ? Number(item.qty) || 0 : 1;
          return sum + (date && date <= through ? value : 0);
        }, 0);
      }
    }
  }

  return { buckets, bucketLabels: buckets.map(labelDdMmm), todayIndex, series };
}

export function bucketTargetTerm(bucket?: string): string {
  if (bucket === "week") return "금주목표";
  if (bucket === "month") return "당월목표";
  if (bucket === "day") return "당일목표";
  return "기간목표";
}
