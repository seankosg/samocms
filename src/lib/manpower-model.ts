/** 출면(Daily Manpower) 집계 — 모든 화면이 이 파일의 순수 함수만 사용합니다. */

export const TRADES = [
  "staff",
  "safety_officer",
  "operator",
  "worker",
  "electrician",
  "scaffolder",
  "plumber",
] as const;
export type Trade = (typeof TRADES)[number];

export const SHIFTS = ["Day Shift", "Overtime", "Night Shift"] as const;
export type Shift = (typeof SHIFTS)[number];

export type Source = "SUB" | "HDEC";

export type Card = {
  source: Source;
  company: string;
  report_date: string;
  location: string;
  shift: string;
  staff: number;
  safety_officer: number;
  operator: number;
  worker: number;
  electrician: number;
  scaffolder: number;
  plumber: number;
  subtotal: number;
  reporter_name: string | null;
  submitted_at: string | null;
  n_rows: number;
};

export type CompareRow = {
  company: string;
  report_date: string;
  location: string;
  shift: string;
  reported: number | null;
  verified: number | null;
  diff: number | null;
  result: "MATCH" | "DIFF" | "HDEC ONLY" | "NOT COUNTED";
  sub_reporter: string | null;
  hdec_counter: string | null;
};

export type CompanyMaster = {
  name: string;
  short_name: string | null;
  discipline: string | null;
  contract_no: string | null;
  sort_order: number;
  is_active: boolean;
};
export type LocationMaster = {
  name: string;
  bldg_code: string | null;
  zone: string | null;
  sort_order: number;
  is_active: boolean;
};
export type CalendarDay = { day: string; is_workday: boolean; note: string | null };
export type PlanRow = { company: string; plan_date: string; granularity: string; planned_total: number };

/** 사우디아라비아 제다 현지(UTC+3) 기준 오늘 yyyy-mm-dd */
export const riyadhToday = (d: Date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** 제다 현지 시각 HH:mm */
export const riyadhTime = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

export const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const dateRange = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
};

const WD = ["일", "월", "화", "수", "목", "금", "토"];
export const fmtDay = (day: string) => `${day} (${WD[new Date(`${day}T00:00:00Z`).getUTCDay()]})`;

/** 근무일 판정 — 달력에 등록된 날은 그 값, 없으면 금요일만 비근무일 */
export function makeIsWorkday(calendar: CalendarDay[]) {
  const map = new Map(calendar.map((c) => [c.day, c.is_workday]));
  return (day: string) => {
    const hit = map.get(day);
    if (hit !== undefined) return hit;
    return new Date(`${day}T00:00:00Z`).getUTCDay() !== 5;
  };
}

export type DailyRow = {
  source: Source;
  company: string;
  report_date: string;
  day_total: number;
  ot_total: number;
  night_total: number;
  total: number;
  cards: number;
  first_submitted_at: string | null;
} & Record<Trade, number>;

const emptyTrades = () => Object.fromEntries(TRADES.map((t) => [t, 0])) as Record<Trade, number>;

/** 카드 → 회사·날짜·source 단위 일별 집계 (모든 화면의 공통 단위) */
export function toDaily(cards: Card[]): DailyRow[] {
  const map = new Map<string, DailyRow>();
  cards.forEach((c) => {
    const key = `${c.source}|${c.company}|${c.report_date}`;
    let row = map.get(key);
    if (!row) {
      row = {
        source: c.source, company: c.company, report_date: c.report_date,
        day_total: 0, ot_total: 0, night_total: 0, total: 0, cards: 0, first_submitted_at: null,
        ...emptyTrades(),
      };
      map.set(key, row);
    }
    if (c.shift === "Day Shift") row.day_total += c.subtotal;
    else if (c.shift === "Overtime") row.ot_total += c.subtotal;
    else if (c.shift === "Night Shift") row.night_total += c.subtotal;
    TRADES.forEach((t) => { row![t] += Number(c[t] ?? 0); });
    row.total += c.subtotal;
    row.cards += 1;
    if (c.submitted_at && (!row.first_submitted_at || c.submitted_at < row.first_submitted_at)) row.first_submitted_at = c.submitted_at;
  });
  return [...map.values()];
}

/** 직종 합과 소계가 다른 카드 (봇이 남긴 경고를 화면에서도 표시) */
export const cardMismatch = (c: Card) => TRADES.reduce((s, t) => s + Number(c[t] ?? 0), 0) !== c.subtotal;

/** 날짜별 총원 (source 별) */
export function totalsByDate(daily: DailyRow[], source: Source): Map<string, number> {
  const m = new Map<string, number>();
  daily.filter((d) => d.source === source).forEach((d) => m.set(d.report_date, (m.get(d.report_date) ?? 0) + d.total));
  return m;
}

/** 근무일 기준 7일(기본) 이동평균 */
export function movingAverage(days: string[], totals: Map<string, number>, isWorkday: (d: string) => boolean, window = 7) {
  const work = days.filter(isWorkday);
  const idx = new Map(work.map((d, i) => [d, i]));
  return days.map((d) => {
    const i = idx.get(d);
    if (i === undefined) return null;
    const slice = work.slice(Math.max(0, i - window + 1), i + 1);
    if (!slice.length) return null;
    return slice.reduce((s, x) => s + (totals.get(x) ?? 0), 0) / slice.length;
  });
}

/** 보고 준수율 — 마감 전에 Day Shift 카드가 들어온 활성 회사 ÷ 활성 회사 */
export function compliance(cards: Card[], companies: CompanyMaster[], day: string, cutoff: string) {
  const active = companies.filter((c) => c.is_active);
  const onTime = new Set<string>();
  const reported = new Set<string>();
  cards.forEach((c) => {
    if (c.source !== "SUB" || c.report_date !== day) return;
    reported.add(c.company);
    if (c.shift !== "Day Shift") return;
    if (!c.submitted_at) return;
    if (riyadhTime(c.submitted_at) <= cutoff) onTime.add(c.company);
  });
  return {
    n: onTime.size,
    total: active.length,
    rate: active.length ? onTime.size / active.length : 0,
    missing: active.filter((c) => !reported.has(c.name)).map((c) => c.name),
  };
}

/** 검증 커버리지 · 일치율 · 평균 절대차 · 미보고 발견 */
export function verificationStats(rows: CompareRow[]) {
  const subCards = rows.filter((r) => r.reported != null).length;
  const covered = rows.filter((r) => r.reported != null && r.verified != null).length;
  const match = rows.filter((r) => r.result === "MATCH").length;
  const diff = rows.filter((r) => r.result === "DIFF");
  const hdecOnly = rows.filter((r) => r.result === "HDEC ONLY").length;
  return {
    coverage: subCards ? covered / subCards : 0,
    coveredCards: covered,
    subCards,
    matchRate: match + diff.length ? match / (match + diff.length) : 0,
    avgAbsDiff: diff.length ? diff.reduce((s, r) => s + Math.abs(r.diff ?? 0), 0) / diff.length : 0,
    hdecOnly,
  };
}

export const RESULT_ORDER: Record<CompareRow["result"], number> = {
  "HDEC ONLY": 0,
  DIFF: 1,
  "NOT COUNTED": 2,
  MATCH: 3,
};

/** 회사 × 장소 매트릭스 (조 합산) */
export function locationMatrix(cards: Card[], source: Source) {
  const m = new Map<string, Map<string, { total: number } & Record<string, number>>>();
  cards.filter((c) => c.source === source).forEach((c) => {
    let row = m.get(c.company);
    if (!row) { row = new Map(); m.set(c.company, row); }
    let cell = row.get(c.location);
    if (!cell) { cell = { total: 0, "Day Shift": 0, Overtime: 0, "Night Shift": 0 }; row.set(c.location, cell); }
    cell.total += c.subtotal;
    cell[c.shift] = (cell[c.shift] ?? 0) + c.subtotal;
  });
  return m;
}

/** 직종별 현장 전체 총계 */
export function tradeTotals(cards: Card[], source: Source) {
  const out = { ...emptyTrades(), total: 0 };
  cards.filter((c) => c.source === source).forEach((c) => {
    TRADES.forEach((t) => { out[t] += Number(c[t] ?? 0); });
    out.total += c.subtotal;
  });
  return out;
}
