import type { Activity } from "./activities.functions";

export const pct = (value: number | null) => Math.round((value ?? 0) * 1000) / 10;
export const disciplineName = (name: string) => ({ Arch: "건축", Elec: "전기", Int: "인테리어", Mech: "기계", MS: "인허가", Gas: "가스" }[name] ?? name);
export const average = (rows: Activity[], key: "planned_progress" | "actual_progress") => {
  const values = rows.map((r) => r[key]).filter((v): v is number => v !== null);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
};
export const statusOf = (row: Activity) => {
  const actual = row.actual_progress ?? 0;
  if (actual >= 1) return "완료";
  if (actual > 0) return "진행";
  return "미착수";
};