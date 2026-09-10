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
  reminderSettings: "미보고 알림 설정",
  reminderEnabled: "미보고 알림",
  remindTimes: "알림 시각",
  cutoffTime: "보고 마감",
  reminderGuide:
    "1차는 알림, 2차부터는 독촉 문구로 발송됩니다. 근무일 달력에 비근무일로 등록된 날에만 보내지 않습니다(현장은 휴일 없음). 최근 10일간 보고가 없는 회사는 휴면으로 보아 경고를 생략하고 직원 목록에만 표시합니다. 담당자가 등록되지 않은 회사는 경고를 보낼 수 없어 직원 목록에 '담당자 미등록'으로 표시됩니다.",
  reminderSent: "알림 발송",
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
