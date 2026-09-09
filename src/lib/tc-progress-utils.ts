// T&C Progress 매트릭스/차트 공통 유틸.
// QAIL Snag Progress 의 progress-utils 를 T&C 6단계로 이식한 순수 함수 모음.

import { TC_STAGES, stageDone, type TcItem, type TcStage } from "./tc-model";
import { flat } from "./schedule-model";

export type Bucket = "day" | "week" | "month";
export type Unit = "count" | "qty";
export type GroupBy = "bldg" | "item" | "grp" | "supplier" | "discipline";

export const ALL_GROUP_BY: GroupBy[] = ["bldg", "item", "grp", "supplier", "discipline"];
export const GROUP_LABELS: Record<GroupBy, string> = {
  bldg: "건물",
  item: "Item",
  grp: "Group",
  supplier: "공급사",
  discipline: "공종",
};
/** 드릴다운 시 T&C List 검색 파라미터 키 */
export const GROUP_QUERY_PARAM: Record<GroupBy, string> = {
  bldg: "bldg",
  item: "item",
  grp: "grp",
  supplier: "supplier",
  discipline: "disc",
};

export const STAGE_LABELS: Record<TcStage, string> = {
  T0: "T0",
  T1: "T1",
  Report: "Report",
  RFI: "RFI",
  T2: "T2",
  Response: "Resp",
};

/** tc_daily_progress.stage(DB 토큰) → TcStage */
export const DB_STAGE: Record<string, TcStage> = {
  t0: "T0", t1: "T1", rp: "Report", rfi: "RFI", t2: "T2", resp: "Response",
};

export const PLAN_COL: Record<TcStage, keyof TcItem> = {
  T0: "t0_p", T1: "t1_p", Report: "rp_p", RFI: "rfi_p", T2: "t2_p", Response: "resp_p",
};
export const ACT_COL: Record<TcStage, keyof TcItem> = {
  T0: "t0_a", T1: "t1_a", Report: "rp_a", RFI: "rfi_a", T2: "t2_a", Response: "resp_a",
};

export const STAGE_COLORS: Record<TcStage, { line: string; bar: string }> = {
  T0: { line: "hsl(217, 91%, 60%)", bar: "hsla(217, 91%, 60%, 0.45)" },
  T1: { line: "hsl(38, 92%, 50%)", bar: "hsla(38, 92%, 50%, 0.45)" },
  Report: { line: "hsl(280, 65%, 60%)", bar: "hsla(280, 65%, 60%, 0.45)" },
  RFI: { line: "hsl(190, 80%, 42%)", bar: "hsla(190, 80%, 42%, 0.45)" },
  T2: { line: "hsl(160, 60%, 45%)", bar: "hsla(160, 60%, 45%, 0.45)" },
  Response: { line: "hsl(0, 72%, 51%)", bar: "hsla(0, 72%, 51%, 0.45)" },
};

// ── 날짜 유틸 ───────────────────────────────────────────────
const toIso = (d: Date) => d.toISOString().slice(0, 10);
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}
export function weekStartIso(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = d.getUTCDay() || 7;
  if (dow !== 1) d.setUTCDate(d.getUTCDate() - (dow - 1));
  return toIso(d);
}
export const monthStartIso = (iso: string) => `${iso.slice(0, 7)}-01`;
function addMonths(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  return toIso(d);
}
export function bucketize(iso: string, g: Bucket): string {
  if (g === "month") return monthStartIso(iso);
  return g === "day" ? iso : weekStartIso(iso);
}
/** 버킷 종료일(포함) */
export function bucketEnd(iso: string, g: Bucket): string {
  if (g === "day") return iso;
  if (g === "week") return addDays(iso, 6);
  return addDays(addMonths(iso, 1), -1);
}

export function buildBucketRange(startIso: string, endIso: string, g: Bucket): string[] {
  const out: string[] = [];
  let cur = bucketize(startIso, g);
  const end = bucketize(endIso, g);
  let safety = 0;
  while (cur <= end && safety < 2000) {
    out.push(cur);
    cur = g === "month" ? addMonths(cur, 1) : addDays(cur, g === "day" ? 1 : 7);
    safety++;
  }
  return out;
}

function getIsoWeek(d: Date): number {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = (target.getTime() - firstThursday.getTime()) / 86400000;
  return 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

export function formatBucketLabel(iso: string, bucket: Bucket): { primary: string; secondary: string } {
  const d = new Date(`${iso}T00:00:00Z`);
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const day = d.getUTCDate();
  if (bucket === "month") return { primary: month, secondary: String(d.getUTCFullYear()) };
  if (bucket === "day") {
    const dow = d.toLocaleString("en-US", { weekday: "short", timeZone: "UTC" });
    return { primary: `${month} ${day}`, secondary: dow };
  }
  return { primary: `W${getIsoWeek(d)}`, secondary: `${month} ${day}` };
}

export function labelDdMmm(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()}-${d.toLocaleString("en-US", { month: "short", timeZone: "UTC" })}`;
}

// ── 매트릭스 조립 ────────────────────────────────────────────
export type DailyRow = {
  event_date: string;
  discipline: string;
  item_key: string;
  stage: string;
  bldg: string | null;
  grp: string | null;
  item: string | null;
  equip: string | null;
  supplier: string | null;
  qty: number;
  plan_count: number;
  plan_qty: number;
  actual_count: number;
  actual_qty: number;
};

export interface BucketCell { bucket: string; plan: number; actual: number }
export interface StageRow {
  stage: TcStage;
  cells: BucketCell[];
  total: number;
  totalDone: number;
  cumPlan: number;
  cumActual: number;
}
export interface GroupRow {
  key: string;
  label: string;
  total: number;
  doneCount: number;
  cumPlan: number;
  cumActual: number;
  stages: Record<TcStage, StageRow>;
  combined: BucketCell[];
  groupKeyRaw: string[];
}
export interface MatrixResult { buckets: string[]; rows: GroupRow[] }

export const NONE_LABEL = "(미지정)";
const GROUP_SEP = " · ";
const norm = (v: unknown) => {
  const s = flat(v as string | null);
  return s ? s : NONE_LABEL;
};
export const groupKeyOf = (dims: GroupBy[], src: { bldg?: string | null; item?: string | null; grp?: string | null; supplier?: string | null; discipline?: string | null }) =>
  dims.map((d) => norm(src[d] ?? null));

function emptyStage(buckets: string[], stage: TcStage): StageRow {
  return {
    stage,
    cells: buckets.map((b) => ({ bucket: b, plan: 0, actual: 0 })),
    total: 0, totalDone: 0, cumPlan: 0, cumActual: 0,
  };
}

export function assembleMatrix(opts: {
  daily: DailyRow[];
  items: TcItem[];
  buckets: string[];
  bucket: Bucket;
  stages: TcStage[];
  groupBy: GroupBy[];
  base: string;
  unit: Unit;
}): MatrixResult {
  const { daily, items, buckets, bucket, stages, groupBy, base, unit } = opts;
  const dims = groupBy.length ? groupBy : (["bldg"] as GroupBy[]);
  const idx = new Map<string, number>();
  buckets.forEach((b, i) => idx.set(b, i));
  const rowMap = new Map<string, GroupRow>();

  const ensure = (raw: string[]): GroupRow => {
    const key = raw.join(GROUP_SEP);
    let row = rowMap.get(key);
    if (!row) {
      row = {
        key, label: key,
        total: 0, doneCount: 0, cumPlan: 0, cumActual: 0,
        stages: TC_STAGES.reduce((a, s) => { a[s] = emptyStage(buckets, s); return a; }, {} as Record<TcStage, StageRow>),
        combined: buckets.map((b) => ({ bucket: b, plan: 0, actual: 0 })),
        groupKeyRaw: [...raw],
      };
      rowMap.set(key, row);
    }
    return row;
  };

  // Total Scope / Up-to-기준일 누계 — tc_items 원본에서 산출
  for (const it of items) {
    const row = ensure(groupKeyOf(dims, it));
    const v = unit === "qty" ? Number(it.qty) || 0 : 1;
    for (const st of TC_STAGES) {
      const sr = row.stages[st];
      sr.total += v;
      if (stageDone(it, st)) sr.totalDone += v;
      const p = it[PLAN_COL[st]] as string | null;
      const a = it[ACT_COL[st]] as string | null;
      if (p && p <= base) sr.cumPlan += v;
      if (a && a <= base) sr.cumActual += v;
    }
  }

  // 타임라인 셀 — tc_daily_progress
  for (const d of daily) {
    const st = DB_STAGE[d.stage];
    if (!st) continue;
    const b = bucketize(d.event_date, bucket);
    const i = idx.get(b);
    if (i === undefined) continue;
    const row = ensure(groupKeyOf(dims, d));
    const sr = row.stages[st];
    const cell = sr.cells[i];
    if (!cell) continue;
    cell.plan += unit === "qty" ? Number(d.plan_qty) || 0 : Number(d.plan_count) || 0;
    cell.actual += unit === "qty" ? Number(d.actual_qty) || 0 : Number(d.actual_count) || 0;
  }

  // 선택 단계 합산
  for (const row of rowMap.values()) {
    let t = 0, done = 0, cp = 0, ca = 0;
    row.combined.forEach((c) => { c.plan = 0; c.actual = 0; });
    for (const st of stages) {
      const sr = row.stages[st];
      t += sr.total; done += sr.totalDone; cp += sr.cumPlan; ca += sr.cumActual;
      for (let i = 0; i < buckets.length; i++) {
        row.combined[i]!.plan += sr.cells[i]!.plan;
        row.combined[i]!.actual += sr.cells[i]!.actual;
      }
    }
    row.total = t; row.doneCount = done; row.cumPlan = cp; row.cumActual = ca;
  }

  const rows = [...rowMap.values()].sort((a, b) => a.label.localeCompare(b.label));
  return { buckets, rows };
}

/** 그룹 키 → T&C List 검색 파라미터 */
export function groupKeyToParams(dims: GroupBy[], raw: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  dims.forEach((d, i) => {
    const v = raw[i];
    if (!v || v === NONE_LABEL) return;
    out[GROUP_QUERY_PARAM[d]] = v;
  });
  return out;
}
