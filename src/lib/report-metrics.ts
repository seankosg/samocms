import { avgOf, dayDiff, isDone, isLate, KPI_SLOTS, milestoneDates, MSDEF, SLOT_LABEL, type Row } from "./schedule-model";
import { stageDone, type TcItem } from "./tc-model";

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
