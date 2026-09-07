import type { Tables } from "@/integrations/supabase/types";
import { flat } from "./schedule-model";

export type TcItem = Tables<"tc_items">;
export type TcManual = Tables<"tc_manual">;

export const TC_STAGES = ["T0", "T1", "Report", "RFI", "T2", "Response"] as const;
export type TcStage = (typeof TC_STAGES)[number];

export const TC_STAGE_SUB: Record<TcStage, string> = {
  T0: "반입 · 설치 확인",
  T1: "Internal T&C",
  Report: "검사 보고서",
  RFI: "검사 요청",
  T2: "Consultant Inspection",
  Response: "코멘트 대응",
};

const PLAN_COL: Record<TcStage, keyof TcItem> = {
  T0: "t0_p",
  T1: "t1_p",
  Report: "rp_p",
  RFI: "rfi_p",
  T2: "t2_p",
  Response: "resp_p",
};

export function stageDone(r: TcItem, stage: TcStage): boolean {
  switch (stage) {
    case "T0":
      return Number(r.t0_rem) === 0;
    case "T1":
      return Number(r.t1_rem) === 0;
    case "Report":
      return Number(r.rp_rem) === 0;
    case "RFI":
      return Number(r.rfi_rem) === 0;
    case "T2":
      return !!r.t2_a;
    case "Response":
      return !!r.resp_a;
  }
}

export const TC_CUTOFF = "2026-09-05";

export type StageStat = { qty: number; pct: number; plan: number; act: number; pv: number | null; pvCap: number | null; over: boolean; noplan: number; early: number };
export type TcProgress = Record<TcStage, StageStat> & { _tot: number; _pass: number; _fail: number; _legacy: boolean; _base: string | null };

/** 스테이지별 진도 — 완료 Qty, 계획 대비 실적, 미계획/조기 완료 분리 */
export function stageProgress(rows: TcItem[], base: string | null): TcProgress {
  const tot = rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
  const legacy = !!base && base <= TC_CUTOFF;
  const out = {} as TcProgress;
  TC_STAGES.forEach((st) => {
    const pcol = PLAN_COL[st];
    let done = 0, plan = 0, noplan = 0, early = 0;
    rows.forEach((r) => {
      const q = Number(r.qty) || 0;
      const d = stageDone(r, st);
      const pd = r[pcol] as string | null;
      const due = !!pd && !!base && pd <= base;
      if (d) done += q;
      if (due) plan += q;
      else if (d && legacy) plan += q;
      if (d && !due) {
        if (!pd) noplan += q;
        else early += q;
      }
    });
    const pv = plan ? done / plan : null;
    out[st] = { qty: done, pct: tot ? done / tot : 0, plan, act: done, pv, pvCap: pv == null ? null : Math.min(1, pv), over: pv != null && pv > 1, noplan, early };
  });
  let pass = 0, fail = 0;
  rows.forEach((r) => {
    const q = Number(r.qty) || 0;
    const s = flat(r.status).toLowerCase();
    if (s === "pass") pass += q;
    else if (s === "fail") fail += q;
  });
  out._tot = tot;
  out._pass = pass;
  out._fail = fail;
  out._legacy = legacy;
  out._base = base;
  return out;
}

type Acc = { q: number; pass: number; fail: number; done: Record<TcStage, number>; late: Record<TcStage, number> };
const zero = (): Acc => ({
  q: 0,
  pass: 0,
  fail: 0,
  done: { T0: 0, T1: 0, Report: 0, RFI: 0, T2: 0, Response: 0 },
  late: { T0: 0, T1: 0, Report: 0, RFI: 0, T2: 0, Response: 0 },
});
function acc(o: Acc, r: TcItem, base: string | null) {
  const q = Number(r.qty) || 0;
  o.q += q;
  TC_STAGES.forEach((k) => {
    if (stageDone(r, k)) o.done[k] += q;
    else {
      const pd = r[PLAN_COL[k]] as string | null;
      if (pd && base && pd <= base) o.late[k] += q;
    }
  });
  const s = flat(r.status).toLowerCase();
  if (s === "pass") o.pass += q;
  else if (s === "fail") o.fail += q;
}
function merge(a: Acc, b: Acc) {
  a.q += b.q;
  a.pass += b.pass;
  a.fail += b.fail;
  TC_STAGES.forEach((k) => {
    a.done[k] += b.done[k];
    a.late[k] += b.late[k];
  });
  return a;
}
export type StageCells = Record<TcStage, [number, number, number]>;
const cells = (o: Acc): StageCells =>
  TC_STAGES.reduce((c, k) => {
    c[k] = [o.done[k], o.q - o.done[k], o.late[k]];
    return c;
  }, {} as StageCells);

export type CenterRow = { loc: string | null; item: string | null; qty: number; st: StageCells; pass: number; fail: number; typ: "row" | "sub" | "tot"; key: string | null };
export type RightRow = { equip: string; tot: number; st: StageCells; pass: number; fail: number };

/** 건물 × Item(Ready for Operation) / Item 합계(Equipment Status) 두 블록 생성 */
export function buildBlocks(rows: TcItem[], base: string | null) {
  const order: string[] = [];
  const g = new Map<string, { b: string; it: string; a: Acc }>();
  rows.forEach((r) => {
    const b = flat(r.bldg) || "(미지정)";
    const it = flat(r.item) || "(미지정)";
    const k = `${b}\u0000${it}`;
    if (!order.includes(b)) order.push(b);
    if (!g.has(k)) g.set(k, { b, it, a: zero() });
    acc(g.get(k)!.a, r, base);
  });
  const center: CenterRow[] = [];
  const GT = zero();
  order.forEach((b) => {
    const list = [...g.values()].filter((x) => x.b === b);
    const ST = zero();
    let first = true;
    list.forEach((x) => {
      merge(ST, x.a);
      center.push({ loc: first ? b : null, item: x.it, qty: x.a.q, st: cells(x.a), pass: x.a.pass, fail: x.a.fail, typ: "row", key: `${b}|${x.it}|${x.a.q}` });
      first = false;
    });
    center.push({ loc: "Sub Total", item: null, qty: ST.q, st: cells(ST), pass: ST.pass, fail: ST.fail, typ: "sub", key: null });
    merge(GT, ST);
  });
  center.push({ loc: "Total", item: null, qty: GT.q, st: cells(GT), pass: GT.pass, fail: GT.fail, typ: "tot", key: null });

  const io: string[] = [];
  const gi = new Map<string, Acc>();
  rows.forEach((r) => {
    const it = flat(r.item) || "(미지정)";
    if (!io.includes(it)) io.push(it);
    if (!gi.has(it)) gi.set(it, zero());
    acc(gi.get(it)!, r, base);
  });
  const right: RightRow[] = io.map((it) => {
    const o = gi.get(it)!;
    return { equip: it, tot: o.q, st: cells(o), pass: o.pass, fail: o.fail };
  });
  right.push({ equip: "Total", tot: GT.q, st: cells(GT), pass: GT.pass, fail: GT.fail });
  return { center, right };
}

export const tcPct = (v: number | null | undefined) => (v == null || isNaN(v) ? "—" : `${(Math.round(v * 1000) / 10).toFixed(1)}%`);

export const TC_DISC_LABEL: Record<string, string> = { Mech: "MECH", Elec: "ELEC" };

export const memoMap = (manual: TcManual[], discipline: string, block: string) => {
  const m: Record<string, string> = {};
  manual.filter((x) => x.discipline === discipline && x.block === block).forEach((x) => {
    if (x.memo) m[x.item_key] = x.memo;
  });
  return m;
};
