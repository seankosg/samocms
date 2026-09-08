import type { Tables } from "@/integrations/supabase/types";

export type ActivityRow = Tables<"activities">;

export const SLOTS = ["Arch", "Elec", "Mech", "Int", "Permit"] as const;
export type Slot = (typeof SLOTS)[number];
export const SLOT_LABEL: Record<string, string> = { Arch: "건축", Elec: "전기", Mech: "기계", Int: "내장", Permit: "인허가", MS: "인허가", Gas: "가스" };
export const KPI_SLOTS: Slot[] = ["Arch", "Int", "Elec", "Mech", "Permit"];

export const MSDEF: Record<string, string> = {
  M1: "POP FLS readiness",
  M2: "POP 대상 공사완료",
  M3: "ECZA 부분승인(POP)",
  M4: "FOP FLS 공사완료",
  M5: "FOP 대상 공사완료",
  M6: "ECZA 사용승인(FOP)",
  M7: "TOC 준공증명 신청",
  M8: "TOC 준공증명 승인",
};

export const BANDS = [
  { label: "건설", color: "#1f4e79" },
  { label: "인허가", color: "#b45309" },
  { label: "생산설비 (발주처)", color: "#6d28d9" },
];

export const STATUS_COLOR: Record<string, string> = { done: "#0d7a4f", ongoing: "#1565c0", plan: "#8b98a5", delay: "#c2185b" };
export const STATUS_LABEL: Record<string, string> = { done: "완료", ongoing: "진행중", plan: "예정", delay: "지연(계획 미달)" };

export const flat = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

const MSRE = /^\s*[Mm]\s*\.?\s*(\d{1,2})\s*$/;
export function normMS(v: string | null): string | null {
  if (v == null) return null;
  const m = String(v).match(MSRE);
  return m ? `M${parseInt(m[1]!, 10)}` : flat(v) || null;
}

const REFSEP = /\s*[,·]\s*/;
export function refList(v: string | null): { id: string; ty: string }[] {
  return String(v ?? "")
    .split(REFSEP)
    .map((t) => {
      const s = flat(t);
      if (!s) return null;
      const m = s.match(/^([^()\s]+)\s*(?:\((SS|FF)\))?$/);
      const id = m?.[1] ? normMS(m[1])! : s;
      return { id, ty: m?.[2] ?? "FS" };
    })
    .filter((x): x is { id: string; ty: string } => !!x);
}

const BLDG_STD: [string, string[]][] = [
  ["Energy Center", ["energycenter"]],
  ["Paint Shop", ["paintshop", "paint"]],
  ["Body Shop", ["bodyshop", "body"]],
  ["Assembly Shop", ["assemblyshop", "assembly"]],
  ["Plastic Shop", ["plasticshop", "plastic"]],
  ["C.C", ["cc", "consolidationcenter"]],
  ["C.C.C", ["ccc"]],
  ["Main Office", ["mainoffice"]],
  ["WWTP", ["wwtp"]],
  ["VPC", ["vpc"]],
  ["Main Gate", ["maingate"]],
  ["Main Bridge", ["mainbridge"]],
  ["Fuel Tank", ["fueltank"]],
  ["Pump Room", ["pumproom"]],
  ["Waste Material", ["wastematerial", "wastematerialweighingfacility"]],
  ["Guard House", ["guardhouse", "gh1", "gh2", "gh3"]],
  ["GMS", ["gms", "gasmeteringskid"]],
  ["Underbody Inspection", ["underbodyinspection"]],
  ["Site Wide", ["sitewideexternal", "sitewide", "all", "general"]],
  ["MRMU", ["mrmu"]],
  ["CANOPY", ["canopy"]],
  ["Rainwater Tank", ["rainwatertank"]],
];
const BLDG_MAP: Record<string, string> = {};
BLDG_STD.forEach(([std, keys]) => keys.forEach((k) => (BLDG_MAP[k] = std)));
const bldgKey = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9가-힣]/g, "");

export function normBldg(v: string | null): string | null {
  if (v == null) return null;
  const s = flat(v);
  if (!s) return null;
  return BLDG_MAP[bldgKey(s)] ?? s;
}

/** 화면·계산용 정규화 행 */
export type Row = {
  id: number;
  no: string | null;
  slot: string;
  dept: string;
  bldg: string | null;
  bldgRaw: string | null;
  room: string | null;
  scope: string | null;
  ms: string | null;
  sub: string | null;
  act: string;
  unit: string | null;
  done: number | null;
  tot: number | null;
  /** 기준일 기준 재계산된 계획 진도율 */
  pl: number | null;
  /** 엑셀 원문 계획 진도율 (화면 미표시) */
  plRaw: number | null;
  pc: number | null;
  pred: string | null;
  succ: string | null;
  s: string | null;
  e: string | null;
};


export function toRow(a: ActivityRow): Row {
  const bldg = normBldg(a.building);
  return {
    id: a.id,
    no: normMS(a.activity_no),
    slot: a.source_file,
    dept: a.discipline,
    bldg,
    bldgRaw: flat(a.building) !== flat(bldg) ? flat(a.building) : null,
    room: a.room,
    scope: a.work_scope,
    ms: normMS(a.milestone),
    sub: a.subcontractor,
    act: flat(a.activity),
    unit: a.unit,
    done: a.done_quantity,
    tot: a.total_quantity,
    pl: a.planned_progress,
    plRaw: a.planned_progress,
    pc: a.actual_progress,

    pred: a.predecessor,
    succ: a.successor,
    s: a.start_date,
    e: a.finish_date,
  };
}

/**
 * 기준일 기준 계획 진도율(선형).
 * 기준일 < 시작일 → 0, 기준일 >= 종료일 → 1, 그 사이는 경과일 비율.
 * 시작/종료일이 없으면 엑셀 원문값을 사용한다.
 */
export function planAt(r: { s: string | null; e: string | null; plRaw: number | null }, base: string): number | null {
  const s = r.s, e = r.e;
  if (!s || !e) return r.plRaw;
  if (base >= e) return 1;
  if (base < s) return 0;
  const span = Date.parse(e) - Date.parse(s);
  if (!(span > 0)) return base >= e ? 1 : 0;
  const v = (Date.parse(base) - Date.parse(s)) / span;
  return Math.max(0, Math.min(1, v));
}

/** 기준일을 적용해 계획 진도율을 재계산한 행 목록 */
export const applyBaseline = (rows: Row[], base: string): Row[] =>
  rows.map((r) => ({ ...r, pl: planAt(r, base) }));

/** 기준일 하루 전 날짜 (yyyy-mm-dd) */
export const prevDay = (base: string) => new Date(Date.parse(base) - 864e5).toISOString().slice(0, 10);

/** 당일 계획 진도율 증분 = 기준일 계획 - (기준일-1일) 계획 */
export function dailyPlan(r: Row, base: string): number | null {
  if (!r.s || !r.e) return null;
  const a = planAt(r, base);
  const b = planAt(r, prevDay(base));
  return a == null || b == null ? null : a - b;
}

/** 스냅샷 매칭용 항목 키 (업로드 시 기록되는 키와 동일 규칙) */
export const itemKeyOf = (discipline: string, activityNo: string | null, activity: string) =>
  `${discipline}|${normMS(activityNo) ?? ""}|${flat(activity)}`;

/** 당일 실적 진도율 증분 = 기준일 실적 - 직전 스냅샷 실적 */
export function dailyActual(r: Row, prev: Map<string, number> | undefined): number | null {
  if (!prev || r.pc == null) return null;
  const p = prev.get(`${r.dept}|${r.no ?? ""}|${r.act}`);
  return p == null ? null : r.pc - p;
}



export const isLate = (r: Row) => r.pl != null && r.pc != null && r.pc < r.pl;
export const isDone = (r: Row) => r.pc != null && r.pc >= 1;
export const hasProgress = (r: Row) => r.pl != null || r.pc != null;

export function stOf(pl: number | null, pc: number | null, late: boolean) {
  if (pc != null && pc >= 0.995) return "done";
  if (late) return "delay";
  if (pc != null && pc > 0) return "ongoing";
  return "plan";
}

export function bandOf(r: Row) {
  if (["Arch", "Elec", "Mech", "Int"].includes(r.dept)) return 0;
  if (r.scope === "HMMME" || r.scope === "발주처" || /생산설비/.test(String(r.bldg ?? ""))) return 2;
  return 1;
}

export const avgOf = (rows: Row[], key: "pl" | "pc") =>
  rows.length ? rows.reduce((s, r) => s + (r[key] ?? 0), 0) / rows.length : 0;

export const pct1 = (v: number | null | undefined) =>
  v == null || !isFinite(v) ? "—" : (Math.round(v * 1000) / 10).toFixed(1);

export const fmtDate = (v: string | null) => (v ? v.replace(/-/g, ".") : "—");

const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** dd-mmm 형식 (예: 05-Sep). 리스트 테이블 날짜 표시용. */
export const fmtShortDate = (v: string | null) => {
  if (!v) return "—";
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m || !m[2] || !m[3]) return v;
  return `${m[3]}-${MON3[parseInt(m[2], 10) - 1] ?? ""}`;
};
export const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

/** 인허가 파일의 M1~M8 행에서 마일스톤 목표일을 읽는다. */
export function milestoneDates(rows: Row[]): Record<string, string> {
  const out: Record<string, string> = {};
  rows.forEach((r) => {
    if (r.slot === "Permit" && r.no && /^M\d+$/.test(r.no) && r.e) out[r.no] = r.e;
  });
  return out;
}

export function statusOfRow(r: Row) {
  const late = isLate(r);
  return stOf(r.pl, r.pc, late);
}
