import type { Row } from "./schedule-model";
import { flat } from "./schedule-model";
import { TC_STAGES, type TcItem, type TcStage, stageDone } from "./tc-model";

/** 카타르 현지(UTC+3) 기준 오늘 날짜 yyyy-mm-dd */
export const qatarToday = (d: Date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

const WD = ["일", "월", "화", "수", "목", "금", "토"];
export const fmtToday = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  return `${day} (${WD[d.getUTCDay()]})`;
};

export type TodayGroupKey = "start" | "ongoing" | "finish";
export const TODAY_GROUPS: { key: TodayGroupKey; label: string; desc: string }[] = [
  { key: "start", label: "금일 신규 착수", desc: "시작일 = 오늘" },
  { key: "ongoing", label: "금일 지속 진행", desc: "시작일 < 오늘 < 종료일" },
  { key: "finish", label: "금일 종결", desc: "종료일 = 오늘" },
];

/** 오늘 날짜 기준 공정 항목 분류 */
export function splitToday(rows: Row[], today: string): Record<TodayGroupKey, Row[]> {
  const out: Record<TodayGroupKey, Row[]> = { start: [], ongoing: [], finish: [] };
  rows.forEach((r) => {
    if (r.s === today) out.start.push(r);
    if (r.e === today) out.finish.push(r);
    if (r.s && r.e && r.s < today && today < r.e) out.ongoing.push(r);
  });
  const by = (a: Row, b: Row) => (a.dept + (a.bldg ?? "")).localeCompare(b.dept + (b.bldg ?? ""));
  out.start.sort(by);
  out.ongoing.sort(by);
  out.finish.sort(by);
  return out;
}

const PLAN_COL: Record<TcStage, keyof TcItem> = {
  T0: "t0_p", T1: "t1_p", Report: "rp_p", RFI: "rfi_p", T2: "t2_p", Response: "resp_p",
};

export type TodayTc = { stage: TcStage; item: TcItem; done: boolean };

/** 오늘이 계획일인 T&C 단계 목록 */
export function todayTc(items: TcItem[], today: string): TodayTc[] {
  const out: TodayTc[] = [];
  TC_STAGES.forEach((st) => {
    items.forEach((it) => {
      if ((it[PLAN_COL[st]] as string | null) === today) out.push({ stage: st, item: it, done: stageDone(it, st) });
    });
  });
  return out;
}

/** AI 안전 분석에 전달할 작업 요약 텍스트 */
export function safetyFacts(groups: Record<TodayGroupKey, Row[]>, tc: TodayTc[], today: string) {
  const line = (r: Row, tag: string) =>
    `${tag}|${r.dept}|${flat(r.bldg) || "-"}|${flat(r.room) || "-"}|${r.act}|협력사:${flat(r.sub) || "-"}|수량:${r.done ?? "-"}/${r.tot ?? "-"}${r.unit ? r.unit : ""}|실적:${r.pc == null ? "-" : Math.round(r.pc * 100) + "%"}`;
  const parts: string[] = [`기준 날짜: ${today}`, "", "[공정 작업]"];
  TODAY_GROUPS.forEach((g) => groups[g.key].slice(0, 120).forEach((r) => parts.push(line(r, g.label))));
  parts.push("", "[T&C 시운전 계획]");
  tc.slice(0, 120).forEach((t) =>
    parts.push(
      `${t.stage}|${t.item.discipline}|${flat(t.item.bldg) || "-"}|${flat(t.item.item) || "-"}|${flat(t.item.equip) || "-"}|수량:${t.item.qty}|공급사:${flat(t.item.supplier) || "-"}|${t.done ? "완료" : "미완료"}`,
    ),
  );
  return parts.join("\n").slice(0, 11500);
}
