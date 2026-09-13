/** NCR/OR/SOR 단계별(Progress Stage) 관리 공용 모델 — 화면·파서·서버가 같은 규칙을 공유합니다. */

export const PS_NUMS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** 슬롯 순서: PS1S → PS1F → … → PS9S → PS9F */
export const SLOT_ORDER = PS_NUMS.flatMap((n) => [`ps${n}s`, `ps${n}f`] as const);
export type SlotKey = (typeof SLOT_ORDER)[number];
export type DateField = `${SlotKey}_p` | `${SlotKey}_a`;

export const PS_LABEL: Record<number, string> = {
  1: "협력사 통보",
  2: "MST 제출(협력사)",
  3: "MST 제출(감리)",
  4: "MST 승인",
  5: "시정작업 착수",
  6: "시정작업 완료",
  7: "검사",
  8: "종결요청 제출",
  9: "회신",
};

/** 슬롯 코드 → 표시 코드 (ps3s → PS3S) */
export const slotCode = (s: SlotKey) => s.toUpperCase();
/** 슬롯이 속한 PS 번호 (ps3f → 3) */
export const psOfSlot = (s: SlotKey) => Number(s.match(/^ps(\d)/)![1]);
/** 슬롯의 계획/실적 컬럼명 */
export const planField = (s: SlotKey) => `${s}_p` as DateField;
export const actualField = (s: SlotKey) => `${s}_a` as DateField;

export type NcrDates = Record<DateField, string | null>;

/** 현재단계 자동 산출: 실적일이 채워진 마지막 슬롯의 다음 슬롯. 전부 비면 PS1S, PS9F까지 채워지면 Closed */
export function currentStage(row: NcrDates): string {
  let last = -1;
  SLOT_ORDER.forEach((s, i) => {
    if (row[actualField(s)]) last = i;
  });
  if (last === SLOT_ORDER.length - 1) return "Closed";
  return slotCode(SLOT_ORDER[last + 1]!);
}

export type SeqViolation = {
  slot: SlotKey;
  prevSlot: SlotKey;
  kind: "plan" | "actual";
  /** 한글/영문 병기 사유 */
  reason: string;
};

/**
 * 슬롯 순서 검증 — 계획일·실적일 각각의 사슬에서, 앞 슬롯 날짜보다 뒤 슬롯 날짜가 이르면 위반.
 * 비어 있는 슬롯(건너뛰기)은 건너뛰고 채워진 날짜끼리만 비교합니다.
 */
export function sequenceViolations(row: NcrDates): SeqViolation[] {
  const out: SeqViolation[] = [];
  for (const kind of ["plan", "actual"] as const) {
    const field = kind === "plan" ? planField : actualField;
    const label = kind === "plan" ? "계획일" : "실적일";
    let prev: { slot: SlotKey; date: string } | null = null;
    for (const s of SLOT_ORDER) {
      const d = row[field(s)];
      if (!d) continue;
      if (prev && d < prev.date) {
        out.push({
          slot: s,
          prevSlot: prev.slot,
          kind,
          reason: `${slotCode(s)} ${label}(${d})이(가) ${slotCode(prev.slot)} ${label}(${prev.date})보다 빠릅니다 / ${slotCode(s)} ${kind} date precedes ${slotCode(prev.slot)}`,
        });
      } else {
        prev = { slot: s, date: d };
      }
    }
  }
  return out;
}

/** 건너뛴 단계: 실적이 비어 있는 슬롯인데 뒤 슬롯에 실적이 있는 경우 (현재는 경고만) */
export function skippedSlots(row: NcrDates): SlotKey[] {
  const out: SlotKey[] = [];
  SLOT_ORDER.forEach((s, i) => {
    if (row[actualField(s)]) return;
    if (SLOT_ORDER.slice(i + 1).some((n) => row[actualField(n)])) out.push(s);
  });
  return out;
}

/** 지연 판정 — 기준일(asOf)이 계획일을 지났는데 실적이 없으면 지연 */
export const isStartDelayed = (row: NcrDates, s: SlotKey, asOf: string) =>
  !!row[planField(s)] && row[planField(s)]! < asOf && !row[actualField(s)];

/** 협력사 표기 정규화 키 (공백·특수문자·대소문자 제거) */
export const normCompanyKey = (v: string | null | undefined) =>
  (v ?? "").toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
