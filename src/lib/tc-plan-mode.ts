// T&C Progress 계획 기준(Baseline / Remaining) 공통 규칙.
// - baseline : 원계획일 그대로 집계
// - remaining: 기준일 시점 완료된 단계의 계획을 "실적일 위치로 이월"
//   (계획을 삭제하지 않으므로 계획 누계선이 100%에 수렴하고 계획·실적 모수가 같다)

import type { TcItem, TcStage } from "./tc-model";

// tc-progress-utils 와 동일 매핑 (순환 import 방지를 위해 로컬 정의)
const PLAN_COL: Record<TcStage, keyof TcItem> = {
  T0: "t0_p", T1: "t1_p", Report: "rp_p", RFI: "rfi_p", T2: "t2_p", Response: "resp_p",
};
const ACT_COL: Record<TcStage, keyof TcItem> = {
  T0: "t0_a", T1: "t1_a", Report: "rp_a", RFI: "rfi_a", T2: "t2_a", Response: "resp_a",
};

export type TcPlanMode = "baseline" | "remaining";

export const PLAN_MODE_LABEL: Record<TcPlanMode, string> = {
  baseline: "Baseline",
  remaining: "Remaining",
};

export const PLAN_MODE_NOTE: Record<TcPlanMode, string> = {
  baseline: "계획 기준: Baseline (원계획일 그대로)",
  remaining: "계획 기준: Remaining (완료분은 실적일로 이월)",
};

/** 전 화면 공통 완료 판정 — 실적일이 있고 기준일 이하 */
export function isStageDoneAsOf(item: TcItem, stage: TcStage, base: string): boolean {
  const a = item[ACT_COL[stage]] as string | null;
  return !!a && a <= base;
}

/** 모드에 따른 유효 계획일 */
export function effectivePlanDate(
  item: TcItem,
  stage: TcStage,
  mode: TcPlanMode,
  base: string,
): string | null {
  const plan = (item[PLAN_COL[stage]] as string | null) ?? null;
  if (mode === "baseline") return plan;
  const actual = (item[ACT_COL[stage]] as string | null) ?? null;
  if (actual && actual <= base) return actual;
  return plan;
}

/**
 * tc_items 와 tc_daily_progress 를 잇는 조인 키.
 * tc_daily_progress.item_key 의 grp/equip 표기는 tc_items 와 다르므로
 * (예: items "Elec|MRMU|GRD||5" vs daily "Elec|MRMU|Grounding Test||5")
 * 유일성이 보장되는 discipline + row_no 로만 맞춘다.
 */
export function tcItemKey(item: TcItem): string {
  return `${item.discipline}|${item.row_no}`;
}

/** tc_daily_progress 행에서 동일한 조인 키를 만든다. */
export function dailyItemKey(discipline: string, itemKey: string): string {
  const parts = itemKey.split("|");
  return `${discipline}|${parts[parts.length - 1] ?? ""}`;
}

/**
 * remaining 모드에서 계획을 이월할 대상 맵.
 * `${item_key}|${stage}` → 실적일 (기준일 시점 완료 항목만 수록)
 */
export function buildShiftMap(items: TcItem[], stages: TcStage[], base: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const it of items) {
    const key = tcItemKey(it);
    for (const st of stages) {
      const a = it[ACT_COL[st]] as string | null;
      if (a && a <= base) map.set(`${key}|${st}`, a);
    }
  }
  return map;
}
