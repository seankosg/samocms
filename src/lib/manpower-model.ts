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
  reporter_tg_id?: string | null;
  superseded_count?: number;
  /** 재집계(HDEC) 카드의 작성 주체 — 안전팀(HSE) 또는 수행팀(EXE). 협력사 보고(SUB)는 null */
  grp?: "HSE" | "EXE" | null;
};

/** 화면에 보여주는 재집계 숫자는 수행팀(EXE) 기준 — SUB 카드는 항상 통과 */
export const isExeRecheck = (c: Pick<Card, "source" | "grp">) => c.source !== "HDEC" || c.grp === "EXE";

export type MemberInfo = { telegram_id: string; name: string; dept: string | null; position: string | null };
export type MemberMap = Map<string, MemberInfo>;
export const toMemberMap = (members: MemberInfo[]): MemberMap => new Map(members.map((m) => [m.telegram_id, m]));

/** 입력자 표기 — 텔레그램 ID로 명부를 찾아 「이름 · 부서」, 없으면 기록 원문 + 미등록 표시 */
export function reporterLabel(members: MemberMap, tgId: string | null | undefined, rawName: string | null | undefined) {
  const hit = tgId ? members.get(tgId) : undefined;
  if (hit) return { text: hit.dept ? `${hit.name} · ${hit.dept}` : hit.name, registered: true, member: hit };
  return { text: rawName ?? "—", registered: false, member: undefined };
}

/** 부서별 색 점 클래스 */
export const DEPT_DOT: Record<string, string> = {
  "건축 (Arch)": "bg-sky-500",
  "내장 (Int)": "bg-cyan-500",
  "전기 (Elec)": "bg-amber-500",
  "설비 (Mech)": "bg-emerald-500",
  "안전 (HSE)": "bg-rose-500",
};
export const deptDot = (dept: string | null | undefined) => (dept && DEPT_DOT[dept]) || "bg-muted-foreground/50";

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
  sub_reporter_tg_id?: string | null;
  hdec_counter_tg_id?: string | null;
  sub_superseded?: number;
  hdec_superseded?: number;
  // HSE / EXE 그룹 분리
  hse_verified?: number | null;
  hse_diff?: number | null;
  hse_result?: "MATCH" | "DIFF" | "HDEC ONLY" | null;
  hse_counter?: string | null;
  hse_counter_tg_id?: string | null;
  hse_superseded?: number | null;
  exe_verified?: number | null;
  exe_diff?: number | null;
  exe_result?: "MATCH" | "DIFF" | "HDEC ONLY" | null;
  exe_counter?: string | null;
  exe_counter_tg_id?: string | null;
  exe_superseded?: number | null;
};

/** 한 그룹의 차이를 화면용으로 정리 — verified가 없으면 null */
export const groupDiff = (verified: number | null | undefined, reported: number | null) =>
  verified == null || reported == null ? null : verified - reported;

/**
 * 모든 화면의 재집계 기준을 「수행팀(EXE)」 하나로 통일.
 * verified/diff/result를 EXE 값으로 다시 계산해 대시보드·검증 대조·차트가 같은 숫자를 씁니다.
 * (안전팀(HSE) 값은 열로만 남겨 참고용으로 표시)
 */
export function toExeBasis(rows: CompareRow[]): CompareRow[] {
  return rows.map((r) => {
    const verified = r.exe_verified ?? null;
    const diff = groupDiff(verified, r.reported);
    const result: CompareRow["result"] =
      // 협력사 보고가 없으면 현장에서만 확인된 칸(HDEC 단독), 보고가 있는데 EXE 재집계가 없으면 미확인
      r.reported == null ? "HDEC ONLY"
        : verified == null ? "NOT COUNTED"
          : diff === 0 ? "MATCH" : "DIFF";
    return { ...r, verified, diff, result, hdec_counter: r.exe_counter ?? null, hdec_counter_tg_id: r.exe_counter_tg_id ?? null };
  });
}

export type CompanyMaster = {
  name: string;
  short_name: string | null;
  discipline: string | null;
  contract_no: string | null;
  sort_order: number;
  is_active: boolean;
  active_from?: string | null;
  active_to?: string | null;
};

/** 해당 날짜 기준 활성 회사인지 (is_active + 활성 기간) */
export const isActiveOn = (c: CompanyMaster, day: string) =>
  c.is_active && (c.active_from == null || c.active_from <= day) && (c.active_to == null || c.active_to >= day);
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

/** 보고 준수율 — 마감 전에 Day Shift 카드가 들어온 활성 회사 ÷ 활성 회사 (비활성 회사 보고는 대상 외로 분리) */
export function compliance(cards: Card[], companies: CompanyMaster[], day: string, cutoff: string) {
  const active = companies.filter((c) => isActiveOn(c, day));
  const activeNames = new Set(active.map((c) => c.name));
  const onTime = new Set<string>();
  const reported = new Set<string>();
  const outOfScope = new Set<string>();
  cards.forEach((c) => {
    if (c.source !== "SUB" || c.report_date !== day) return;
    if (!activeNames.has(c.company)) { outOfScope.add(c.company); return; }
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
    /** 비활성(대상 외) 회사가 보고한 경우 그 회사명 목록 */
    outOfScope: [...outOfScope].sort(),
  };
}

/** 검증 커버리지 · 일치율 · 평균 절대차 · 미보고 발견 */
export function verificationStats(rows: CompareRow[]) {
  const subCards = rows.filter((r) => r.reported != null).length;
  const covered = rows.filter((r) => r.reported != null && r.verified != null).length;
  const match = rows.filter((r) => r.result === "MATCH").length;
  const diff = rows.filter((r) => r.result === "DIFF");
  const hdecOnly = rows.filter((r) => r.result === "HDEC ONLY").length;
  const pending = rows.filter((r) => r.reported != null && r.verified == null);
  return {
    coverage: subCards ? covered / subCards : 0,
    coveredCards: covered,
    subCards,
    /** 아직 재집계가 없는 칸 수와 그 인원 합 (차이가 아니라 미확인) */
    pendingCards: pending.length,
    pendingHeadcount: pending.reduce((s, r) => s + (r.reported ?? 0), 0),
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
