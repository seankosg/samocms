import type { Row } from "./schedule-model";
import { flat } from "./schedule-model";
import { TC_STAGES, type TcItem, type TcStage, stageDone } from "./tc-model";
import { SLOT_LABEL_EN, activityLabel, type Lang } from "./today-i18n";

/** 사우디아라비아 제다 현지(UTC+3) 기준 오늘 날짜 yyyy-mm-dd */
export const jeddahToday = (d: Date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

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

/** 팀(dept/discipline)별 건수 집계 */
export function byTeam(items: { dept: string }[] | { item: { discipline: string } }[]): { label: string; v: number }[] {
  const map = new Map<string, number>();
  items.forEach((x) => {
    const t = "dept" in x ? x.dept : x.item.discipline;
    map.set(t, (map.get(t) ?? 0) + 1);
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([label, v]) => ({ label, v }));
}

/** 건물별 건수 집계 */
export function byBldg(items: { bldg: string | null }[] | { item: { bldg: string | null } }[]): { label: string; v: number }[] {
  const map = new Map<string, number>();
  items.forEach((x) => {
    const b = "bldg" in x ? x.bldg : x.item.bldg;
    const k = b ?? "(미지정)";
    map.set(k, (map.get(k) ?? 0) + 1);
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([label, v]) => ({ label, v }));
}
export function safetyFacts(groups: Record<TodayGroupKey, Row[]>, tc: TodayTc[], today: string, lang: Lang = "ko") {
  const en = lang === "en";
  const groupLabel: Record<TodayGroupKey, string> = en
    ? { start: "Commencing Today", ongoing: "Ongoing Today", finish: "Completing Today" }
    : Object.fromEntries(TODAY_GROUPS.map((g) => [g.key, g.label])) as Record<TodayGroupKey, string>;
  const team = (value: string) => en ? SLOT_LABEL_EN[value] ?? value : value;
  const line = (r: Row, tag: string) =>
    `${tag}|${team(r.dept)}|${flat(r.bldg) || "-"}|${flat(r.room) || "-"}|${activityLabel(r.act, lang)}|${en ? "Subcontractor" : "협력사"}:${flat(r.sub) || "-"}|${en ? "Quantity" : "수량"}:${r.done ?? "-"}/${r.tot ?? "-"}${r.unit ? r.unit : ""}|${en ? "Actual" : "실적"}:${r.pc == null ? "-" : Math.round(r.pc * 100) + "%"}`;
  const parts: string[] = [`${en ? "Reference date" : "기준 날짜"}: ${today}`, "", `[${en ? "Construction Activities" : "공정 작업"}]`];
  TODAY_GROUPS.forEach((g) => groups[g.key].slice(0, 120).forEach((r) => parts.push(line(r, groupLabel[g.key]))));
  parts.push("", `[${en ? "T&C Schedule" : "T&C 시운전 계획"}]`);
  tc.slice(0, 120).forEach((t) =>
    parts.push(
      `${t.stage}|${team(t.item.discipline)}|${flat(t.item.bldg) || "-"}|${flat(t.item.item) || "-"}|${flat(t.item.equip) || "-"}|${en ? "Quantity" : "수량"}:${t.item.qty}|${en ? "Supplier" : "공급사"}:${flat(t.item.supplier) || "-"}|${t.done ? (en ? "Completed" : "완료") : (en ? "Open" : "미완료")}`,
    ),
  );
  return parts.join("\n").slice(0, 11500);
}
