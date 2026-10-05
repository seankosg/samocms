import { itemKeyOf, planAt, type Row } from "./schedule-model";

export type AggMode = "weighted" | "simple";

export type SnapSeriesMap = Record<string, [string, number | null][]>;

export type ScurvePoint = {
  date: string;
  plan: number | null;
  actual: number | null;
  /** 항목별 개별 실적선 (includeItems일 때만) */
  items?: Record<string, number | null>;
};

export function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const date = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`).getTime();
  while (date.getTime() <= last && dates.length < 1500) {
    dates.push(date.toISOString().slice(0, 10));
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return dates;
}

/** 항목의 특정 날짜 실적 — 해당일 이하 가장 최근 스냅샷 값 (없으면 null) */
function actualAt(series: [string, number | null][], date: string): number | null {
  let lo = 0;
  let hi = series.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid]![0] <= date) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans < 0 ? null : series[ans]![1];
}

/**
 * 선택 항목들의 통합 S-curve 시리즈.
 * - 계획: 각 항목의 일별 계획 진도율(planAt)을 합산
 * - 실적: activity_snapshots 날짜별 실적을 합산 (같은 날 중복은 마지막 기록, 기준일 이후 미표시)
 * - weighted: Σ(진도×총수량) ÷ Σ(총수량) / simple: 진도율 산술 평균
 */
export function buildCombinedSeries(opts: {
  rows: Row[];
  series: SnapSeriesMap;
  base: string;
  agg: AggMode;
  includeItems: boolean;
}): ScurvePoint[] {
  const { rows, series, base, agg, includeItems } = opts;
  if (rows.length === 0) return [];

  const entries = rows.map((row) => ({
    row,
    key: itemKeyOf(row.dept, row.no, row.act),
    snap: series[itemKeyOf(row.dept, row.no, row.act)] ?? [],
    weight: Math.max(0, Number(row.tot) || 0),
  }));

  const dates = entries.flatMap((e) => [e.row.s, e.row.e, e.snap[0]?.[0] ?? null, e.snap.at(-1)?.[0] ?? null]);
  const valid = dates.filter((d): d is string => !!d);
  const start = [base, ...valid].sort()[0] ?? base;
  const end = [base, ...valid].sort().at(-1) ?? base;

  const totalWeight = entries.reduce((s, e) => s + e.weight, 0);
  const useWeight = agg === "weighted" && totalWeight > 0;

  return dateRange(start, end).map((date) => {
    let planSum = 0;
    let planW = 0;
    let planN = 0;
    let actSum = 0;
    let actW = 0;
    let actN = 0;
    const itemValues: Record<string, number | null> | undefined = includeItems ? {} : undefined;

    for (const e of entries) {
      const p = planAt(e.row, date);
      if (p != null) {
        planN += 1;
        planSum += p * (useWeight ? e.weight : 1);
        planW += useWeight ? e.weight : 1;
      }
      if (date <= base) {
        const a = actualAt(e.snap, date);
        if (itemValues) itemValues[e.key] = a == null ? null : Math.round(a * 1000) / 10;
        if (a != null) {
          actN += 1;
          actSum += a * (useWeight ? e.weight : 1);
          actW += useWeight ? e.weight : 1;
        }
      } else if (itemValues) {
        itemValues[e.key] = null;
      }
    }

    void planN;
    void actN;
    return {
      date,
      plan: planW > 0 ? Math.round((planSum / planW) * 1000) / 10 : null,
      actual: date > base || actW === 0 ? null : Math.round((actSum / actW) * 1000) / 10,
      ...(itemValues ? { items: itemValues } : {}),
    };
  });
}

/** 선택 항목들의 단위 목록 (수량 가중 시 단위 혼합 경고용) */
export function unitsOf(rows: Row[]): string[] {
  return [...new Set(rows.map((r) => (r.unit ?? "").trim()).filter(Boolean))];
}
