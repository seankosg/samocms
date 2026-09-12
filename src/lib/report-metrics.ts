import { avgOf, dayDiff, isDone, isLate, KPI_SLOTS, milestoneDates, MSDEF, planAt, SLOT_LABEL, type Row } from "./schedule-model";
import { stageDone, type TcItem } from "./tc-model";
import { buildTcForecast, buildTcForecastSummary } from "./tc-forecast";

const PLAN_COL = { T1: "t1_p", T2: "t2_p" } as const;

export type ReportMetrics = ReturnType<typeof buildReportMetrics>;

/** 리포트(1페이지)용 대시보드 지표 — 대시보드와 동일한 계산 규칙 */
export function buildReportMetrics(rows: Row[], base: string) {
  const withP = rows.filter((r) => r.pl != null || r.pc != null);
  const late = withP.filter(isLate);
  const done = rows.filter(isDone);
  const msDates = milestoneDates(rows);

  const bySlot = KPI_SLOTS.map((s) => {
    const list = rows.filter((r) => r.slot === s || r.dept === s);
    const w = list.filter((r) => r.pl != null || r.pc != null);
    const plan = list.filter((r) => r.e && r.e <= base).length;
    const act = list.filter(isDone).length;
    return { slot: s, label: SLOT_LABEL[s] ?? s, n: w.length, total: list.length, pl: avgOf(w, "pl"), pc: avgOf(w, "pc"), late: w.filter(isLate).length, plan, act, gap: act - plan };
  });

  const byMs = Object.keys(MSDEF).map((k) => {
    const list = rows.filter((r) => r.ms === k);
    const w = list.filter((r) => r.pl != null || r.pc != null);
    const due = msDates[k] ?? null;
    const plan = list.filter((r) => r.e && r.e <= base).length;
    const act = list.filter(isDone).length;
    return {
      key: k, name: MSDEF[k]!, due, total: list.length,
      pc: w.length ? avgOf(w, "pc") : null,
      late: list.filter(isLate).length,
      dd: due ? dayDiff(base, due) : null,
      plan, act, gap: act - plan,
    };
  });

  const rank = (key: (r: Row) => string | null) => {
    const g = new Map<string, { n: number; late: number; gap: number }>();
    rows.forEach((r) => {
      const k = key(r);
      if (!k) return;
      const o = g.get(k) ?? { n: 0, late: 0, gap: 0 };
      o.n += 1;
      if (isLate(r)) { o.late += 1; o.gap += (r.pl ?? 0) - (r.pc ?? 0); }
      g.set(k, o);
    });
    return [...g.entries()].map(([k, v]) => ({ k, ...v })).filter((x) => x.late).sort((a, b) => b.late - a.late).slice(0, 8);
  };

  const delays = late
    .map((r) => ({ r, gap: (r.pl ?? 0) - (r.pc ?? 0) }))
    .sort((a, b) => b.gap - a.gap);

  return {
    total: rows.length, withP: withP.length, done: done.length, late: late.length,
    donePct: rows.length ? done.length / rows.length : 0,
    latePct: withP.length ? late.length / withP.length : 0,
    pl: avgOf(withP, "pl"), pc: avgOf(withP, "pc"),
    bySlot, byMs, bldg: rank((r) => r.bldg), sub: rank((r) => r.sub), delays,
  };
}

export type TcStageCell = { qty: number; doneQty: number; rem: number; lateQty: number };
export type TcBldgRow = { bldg: string; qty: number; t1: TcStageCell; t2: TcStageCell; pass: number; fail: number };
export type TcDiscReport = { key: string; label: string; qty: number; t1: TcStageCell; t2: TcStageCell; pass: number; fail: number; byBldg: TcBldgRow[] };

const emptyCell = (): TcStageCell => ({ qty: 0, doneQty: 0, rem: 0, lateQty: 0 });

function accCell(cell: TcStageCell, r: TcItem, stage: "T1" | "T2", base: string | null) {
  const q = Number(r.qty) || 0;
  cell.qty += q;
  if (stageDone(r, stage)) cell.doneQty += q;
  else {
    cell.rem += q;
    const pd = r[PLAN_COL[stage]] as string | null;
    if (pd && base && pd <= base) cell.lateQty += q;
  }
}

/** 3페이지용 — 공종(MECH/ELEC)별 T1·T2 현황과 건물별 세부 */
export function buildTcT1T2(tcItems: TcItem[], base: string, labelOf: (k: string) => string): TcDiscReport[] {
  const keys = [...new Set(tcItems.map((i) => i.discipline))];
  return keys.map((key) => {
    const list = tcItems.filter((i) => i.discipline === key);
    const t1 = emptyCell(), t2 = emptyCell();
    let qty = 0, pass = 0, fail = 0;
    const bmap = new Map<string, TcBldgRow>();
    list.forEach((r) => {
      const q = Number(r.qty) || 0;
      qty += q;
      const st = String(r.status ?? "").trim().toLowerCase();
      if (st === "pass") pass += q;
      else if (st === "fail") fail += q;
      accCell(t1, r, "T1", base);
      accCell(t2, r, "T2", base);
      const b = String(r.bldg ?? "").trim() || "(미지정)";
      let row = bmap.get(b);
      if (!row) { row = { bldg: b, qty: 0, t1: emptyCell(), t2: emptyCell(), pass: 0, fail: 0 }; bmap.set(b, row); }
      row.qty += q;
      if (st === "pass") row.pass += q;
      else if (st === "fail") row.fail += q;
      accCell(row.t1, r, "T1", base);
      accCell(row.t2, r, "T2", base);
    });
    return { key, label: labelOf(key), qty, t1, t2, pass, fail, byBldg: [...bmap.values()].sort((a, b) => b.qty - a.qty) };
  });
}

/* ────────────── 진행도 예측 요약 (AI Executive Summary 입력용) ────────────── */

const DAY = 864e5;
const toTs = (d: string) => Date.parse(d);
const toDate = (t: number) => new Date(t).toISOString().slice(0, 10);

export type ForecastSeries = { date: string; disc: string; ms: string; planned: number; actual: number; count: number };

/** 최근 최대 14일 실적 최소자승 기울기 (fraction/day) — 예측 차트와 동일 규칙 */
function slopeOf(pts: { date: string; actual: number }[]): number | null {
  const p = pts.slice(-14);
  if (p.length < 2) return null;
  const t0 = toTs(p[0]!.date);
  const xs = p.map((x) => (toTs(x.date) - t0) / DAY);
  const ys = p.map((x) => x.actual);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0, den = 0;
  xs.forEach((x, i) => { num += (x - mx) * (ys[i]! - my); den += (x - mx) ** 2; });
  if (den === 0) return null;
  return num / den;
}

function planCurveOf(rows: Row[], dates: string[]): Map<string, number> {
  const m = new Map<string, number>();
  const dated = rows.filter((r) => r.s && r.e);
  if (dated.length === 0) return m;
  for (const d of dates) {
    let sum = 0;
    for (const r of dated) sum += planAt(r, d) ?? 0;
    m.set(d, sum / dated.length);
  }
  return m;
}

type FcCalc = { actual: number | null; slope: number | null; planDone: string | null; forecastEnd: string | null; diffDays: number | null; itemCount: number };

function calcForecast(series: ForecastSeries[], sel: Row[]): FcCalc {
  const empty: FcCalc = { actual: null, slope: null, planDone: null, forecastEnd: null, diffDays: null, itemCount: sel.length };
  if (series.length === 0 || sel.length === 0) return empty;
  const byDate = new Map<string, { a: number; n: number }>();
  for (const s of series) {
    const cur = byDate.get(s.date) ?? { a: 0, n: 0 };
    cur.a += s.actual * s.count; cur.n += s.count;
    byDate.set(s.date, cur);
  }
  const hist = [...byDate.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([date, v]) => ({ date, actual: v.a / v.n }));
  if (hist.length === 0) return empty;
  const last = hist[hist.length - 1]!;
  const slope = slopeOf(hist);
  let forecastEnd: string | null = null;
  if (slope != null && slope > 1e-6 && last.actual < 0.999) {
    forecastEnd = toDate(toTs(last.date) + Math.ceil(Math.min(365, (1 - last.actual) / slope)) * DAY);
  } else if (last.actual >= 0.999) forecastEnd = last.date;
  const end = sel.reduce<string | null>((acc, r) => (r.e && (!acc || r.e > acc) ? r.e : acc), null) ?? last.date;
  const days: string[] = [];
  for (let t = toTs(hist[0]!.date); t <= toTs(end); t += DAY) days.push(toDate(t));
  const pc = planCurveOf(sel, days);
  const planDone = days.find((d) => (pc.get(d) ?? 0) >= 0.999) ?? end;
  const diffDays = forecastEnd ? Math.round((toTs(forecastEnd) - toTs(planDone)) / DAY) : null;
  return { actual: last.actual, slope, planDone, forecastEnd, diffDays, itemCount: sel.length };
}

const judge = (d: number | null) => (d == null ? "판정 불가" : d > 0 ? `${d}일 지연 예상` : d < 0 ? `${Math.abs(d)}일 선행 예상` : "계획 부합");

function fcLine(label: string, f: FcCalc): string | null {
  if (f.forecastEnd == null && f.actual == null) return null;
  const act = f.actual == null ? "—" : `${(f.actual * 100).toFixed(1)}%`;
  const sp = f.slope == null ? "—" : `${(f.slope * 100).toFixed(2)}%p/일`;
  return `${label}: 현재 실적 ${act}, 최근 속도 ${sp}, 계획 완료 ${f.planDone ?? "—"}, 예측 완료 ${f.forecastEnd ?? "—"}, ${judge(f.diffDays)}`;
}

/**
 * 대시보드 예측 탭과 동일한 규칙으로 공종·마일스톤·T&C 예측을 문장 목록으로 정리.
 * AI Executive Summary 입력(facts)에 덧붙여 사용한다.
 */
export function buildForecastFacts(
  series: ForecastSeries[],
  rows: Row[],
  tcItems: TcItem[],
  base: string,
): string {
  const eligible = rows.filter((r) => r.mgr !== "HM"); // 발주처(HM) 담당 항목 제외
  const l: string[] = [];

  const all = calcForecast(series, eligible);
  const allLine = fcLine("전체 공정 예측", all);
  if (allLine) l.push(allLine);

  for (const disc of KPI_SLOTS) {
    const sel = eligible.filter((r) => r.slot === disc);
    if (sel.length === 0) continue;
    const f = calcForecast(series.filter((s) => s.disc === disc), sel);
    const line = fcLine(`공종 예측 ${SLOT_LABEL[disc] ?? disc}`, f);
    if (line) l.push(line);
  }

  const msKeys = [...new Set(eligible.map((r) => r.ms ?? "미지정"))].sort((a, b) => {
    const an = /^M(\d+)$/.exec(a), bn = /^M(\d+)$/.exec(b);
    if (an && bn) return Number(an[1]) - Number(bn[1]);
    if (an) return -1;
    if (bn) return 1;
    return a.localeCompare(b, "ko");
  });
  for (const ms of msKeys) {
    const sel = eligible.filter((r) => (r.ms ?? "미지정") === ms);
    if (sel.length === 0) continue;
    const f = calcForecast(series.filter((s) => s.ms === ms), sel);
    const line = fcLine(`마일스톤 예측 ${ms}`, f);
    if (line) l.push(line);
  }

  // T&C 예측 (T0·T1·T2·Response 4단계 합산)
  const tcAll = buildTcForecast(tcItems, { stage: "ALL", team: "ALL", bldg: "ALL", base });
  if (tcAll) {
    l.push(
      fcLine("T&C 예측 전체(T0·T1·T2·Response 합산)", {
        actual: tcAll.lastActual, slope: tcAll.slope, planDone: tcAll.planDoneDate,
        forecastEnd: tcAll.forecastEnd, diffDays: tcAll.diffDays, itemCount: tcAll.itemCount,
      })!,
    );
  }
  for (const r of buildTcForecastSummary(tcItems, { stage: "ALL", team: "ALL", base })) {
    if (r.itemCount === 0) continue;
    const line = fcLine(`T&C 예측 ${r.label}`, {
      actual: r.actual, slope: r.slope, planDone: r.planDone,
      forecastEnd: r.forecastEnd, diffDays: r.diffDays, itemCount: r.itemCount,
    });
    if (line) l.push(line);
  }

  return l.join("\n");
}
