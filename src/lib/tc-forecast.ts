// T&C 진행도 예측 — 단계·팀·건물별 계획/실적/예측 곡선 계산 (순수 함수)
import type { TcItem } from "./tc-model";

const DAY = 864e5;
const toTs = (d: string) => Date.parse(d);
const toDate = (t: number) => new Date(t).toISOString().slice(0, 10);

/** 예측에 사용하는 4단계 (Report·RFI 제외) */
export const TC_FORECAST_STAGES = ["T0", "T1", "T2", "Response"] as const;
export type TcForecastStage = (typeof TC_FORECAST_STAGES)[number];

export const TC_F_STAGE_LABEL: Record<TcForecastStage, string> = {
  T0: "T0",
  T1: "T1",
  T2: "T2",
  Response: "Response",
};

const PLAN_COL: Record<TcForecastStage, keyof TcItem> = {
  T0: "t0_p",
  T1: "t1_p",
  T2: "t2_p",
  Response: "resp_p",
};
const ACT_COL: Record<TcForecastStage, keyof TcItem> = {
  T0: "t0_a",
  T1: "t1_a",
  T2: "t2_a",
  Response: "resp_a",
};

type Unit = { plan: string; act: string | null };

function unitsFor(items: TcItem[], stage: TcForecastStage | "ALL"): Unit[] {
  const out: Unit[] = [];
  const stages = stage === "ALL" ? [...TC_FORECAST_STAGES] : [stage];
  for (const r of items) {
    for (const st of stages) {
      const p = r[PLAN_COL[st]] as string | null;
      if (!p) continue; // 해당 단계 계획일이 없는 (item,stage) 단위는 제외
      const a = r[ACT_COL[st]] as string | null;
      out.push({ plan: p, act: a && a >= p ? a : a }); // act 그대로
    }
  }
  return out;
}

type Hist = { date: string; planned: number; actual: number };

function slopeOf(hist: Hist[]): number | null {
  const pts = hist.slice(-14);
  if (pts.length < 2) return null;
  const t0 = toTs(pts[0]!.date);
  const xs = pts.map((p) => (toTs(p.date) - t0) / DAY);
  const ys = pts.map((p) => p.actual);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0, den = 0;
  xs.forEach((x, i) => { num += (x - mx) * (ys[i]! - my); den += (x - mx) ** 2; });
  if (den === 0) return null;
  return num / den;
}

export interface TcForecastModel {
  hist: Hist[];
  days: string[];
  planCurve: Map<string, number>;
  forecastCurve: Map<string, number>;
  slope: number | null;
  planDoneDate: string;
  forecastEnd: string | null;
  diffDays: number | null;
  lastDate: string;
  lastActual: number;
  itemCount: number;
}

export interface TcForecastOptions {
  stage: TcForecastStage | "ALL";
  team: "ALL" | "Mech" | "Elec";
  bldg: "ALL" | string;
  base: string;
}

/** 선택 조건(단계·팀·건물)의 T&C 예측 모델. 데이터가 부족하면 null. */
export function buildTcForecast(items: TcItem[], opts: TcForecastOptions): TcForecastModel | null {
  const { stage, team, bldg, base } = opts;
  const scoped = items.filter((r) =>
    (team === "ALL" || r.discipline === team) &&
    (bldg === "ALL" || (r.bldg ?? "(미지정)") === bldg),
  );
  const units = unitsFor(scoped, stage);
  if (units.length === 0) return null;

  const total = units.length;
  const planDates = units.map((u) => u.plan).sort();
  const minPlan = planDates[0]!;
  const maxPlan = planDates[planDates.length - 1]!;
  const planDoneDate = maxPlan;

  // 일자별 계획/실적 누계 (0~1)
  const planCum = (d: string) => units.filter((u) => u.plan <= d).length / total;
  const actCum = (d: string) => units.filter((u) => u.act != null && u.act <= d).length / total;

  // 마지막 실적 완료일 (있으면), 없으면 base
  const actDates = units.map((u) => u.act).filter((a): a is string => !!a).sort();
  const lastActDate = actDates.length ? actDates[actDates.length - 1]! : null;
  const lastDate = base;
  const lastActual = actCum(base);

  // 속도: base 기준 최근 14일 실적 곡선 샘플
  const sampleStart = new Date(toTs(base) - 13 * DAY);
  const sampleStartStr = sampleStart.toISOString().slice(0, 10);
  const hist: Hist[] = [];
  for (let t = toTs(sampleStartStr); t <= toTs(base); t += DAY) {
    const d = toDate(t);
    hist.push({ date: d, planned: planCum(d), actual: actCum(d) });
  }
  // 기록이 2개 미만이면 범위를 minPlan~base로 넓힘
  if (hist.length < 2) {
    hist.length = 0;
    for (let t = toTs(minPlan); t <= toTs(base); t += DAY) {
      const d = toDate(t);
      hist.push({ date: d, planned: planCum(d), actual: actCum(d) });
    }
  }
  if (hist.length < 2) return null;

  const slope = slopeOf(hist);
  let forecastEnd: string | null = null;
  if (slope != null && slope > 1e-6 && lastActual < 0.999) {
    const days = Math.min(365, (1 - lastActual) / slope);
    forecastEnd = toDate(toTs(base) + Math.ceil(days) * DAY);
  } else if (lastActual >= 0.999) {
    forecastEnd = lastActDate ?? base;
  }

  const endDate = [planDoneDate, forecastEnd, base].filter((d): d is string => !!d)
    .reduce((a, b) => (b > a ? b : a), base);
  const days: string[] = [];
  for (let t = toTs(minPlan); t <= toTs(endDate); t += DAY) days.push(toDate(t));

  const planCurve = new Map<string, number>();
  const forecastCurve = new Map<string, number>();
  for (const d of days) planCurve.set(d, planCum(d));
  if (slope != null && slope > 1e-6) {
    for (const d of days) {
      if (d <= base) continue;
      const v = lastActual + slope * ((toTs(d) - toTs(base)) / DAY);
      forecastCurve.set(d, Math.min(1, v));
    }
  }

  const diffDays = forecastEnd ? Math.round((toTs(forecastEnd) - toTs(planDoneDate)) / DAY) : null;
  return { hist, days, planCurve, forecastCurve, slope, planDoneDate, forecastEnd, diffDays, lastDate, lastActual, itemCount: total };
}

/** 요약표용: 선택 팀 내 건물별(또는 팀 전체 시 팀별) 모델 요약 */
export interface TcForecastSummaryRow {
  key: string;
  label: string;
  actual: number | null;
  slope: number | null;
  planDone: string | null;
  forecastEnd: string | null;
  diffDays: number | null;
  itemCount: number;
}

export function buildTcForecastSummary(
  items: TcItem[],
  opts: { stage: TcForecastStage | "ALL"; team: "ALL" | "Mech" | "Elec"; base: string },
): TcForecastSummaryRow[] {
  const { stage, team, base } = opts;
  // 팀 전체 선택 → 팀별 행(Mech/Elec). 특정 팀 → 건물별 행.
  const keys: { key: string; label: string; team: "Mech" | "Elec"; bldg: "ALL" | string }[] =
    team === "ALL"
      ? [{ key: "Mech", label: "MECH", team: "Mech", bldg: "ALL" }, { key: "Elec", label: "ELEC", team: "Elec", bldg: "ALL" }]
      : [];
  if (team !== "ALL") {
    const bldgs = [...new Set(items.filter((r) => r.discipline === team).map((r) => r.bldg ?? "(미지정)"))].sort((a, b) => a.localeCompare(b, "ko"));
    for (const b of bldgs) keys.push({ key: b, label: b, team, bldg: b });
  }
  const rows: TcForecastSummaryRow[] = [];
  for (const k of keys) {
    const m = buildTcForecast(items, { stage, team: k.team, bldg: k.bldg, base });
    if (!m) { rows.push({ key: k.key, label: k.label, actual: null, slope: null, planDone: null, forecastEnd: null, diffDays: null, itemCount: 0 }); continue; }
    rows.push({
      key: k.key, label: k.label,
      actual: m.lastActual, slope: m.slope,
      planDone: m.planDoneDate, forecastEnd: m.forecastEnd, diffDays: m.diffDays,
      itemCount: m.itemCount,
    });
  }
  return rows;
}
