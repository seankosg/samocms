/** 출면 화면 문구 — 다음 단계에서 en 사전을 추가해 토글할 수 있도록 한곳에 모아둡니다. */
import type { Trade } from "./manpower-model";

export const MP = {
  group: "출면 Manpower",
  daily: "출면 현황",
  compare: "검증 대조",
  trend: "추이",
  members: "출면기록 관리자 설정",
  sub: "협력사 보고",
  hdec: "HDEC 재집계",
  company: "협력사",
  location: "장소",
  shift: "조",
  day: "주간",
  ot: "연장",
  night: "야간",
  total: "계",
  reported: "협력사 보고",
  verified: "HDEC 재집계",
  diff: "차이",
  result: "판정",
  reporter: "보고자",
  counter: "HDEC 확인자",
  firstSubmit: "첫 보고시각",
  notReported: "미보고",
  compliance: "보고 준수율",
  coverage: "검증 커버리지",
  hdecOnly: "미보고 발견",
  headcount: "총원",
} as const;

export const TRADE_LABEL: Record<Trade, string> = {
  staff: "Staff",
  safety_officer: "Safety",
  operator: "Operator",
  worker: "Worker",
  electrician: "Elec",
  scaffolder: "Scaf",
  plumber: "Plumb",
};

export const RESULT_LABEL: Record<string, string> = {
  MATCH: "일치",
  DIFF: "차이",
  "HDEC ONLY": "HDEC 단독",
  "NOT COUNTED": "미집계",
};
