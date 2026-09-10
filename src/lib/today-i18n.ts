import type { TcStage } from "./tc-model";

export type Lang = "ko" | "en";

/** 공종(팀) 영문 표기 — 건설 표준 용어 */
export const SLOT_LABEL_EN: Record<string, string> = {
  Arch: "Architecture",
  Elec: "Electrical",
  Mech: "Mechanical",
  Int: "Interior Finishes",
  Permit: "Permit & Approval",
  MS: "Permit & Approval",
  Gas: "Gas",
};

export const TC_STAGE_SUB_EN: Record<TcStage, string> = {
  T0: "Delivery & Installation Check",
  T1: "Internal T&C",
  Report: "Inspection Report",
  RFI: "Request for Inspection",
  T2: "Consultant Inspection",
  Response: "Comment Close-out",
};

export const T = {
  ko: {
    pageTitle: "오늘의 주요 작업",
    pageDesc: "사우디아라비아 제다 현지(UTC+3) 기준 · 기준일 설정과 무관",
    loadingDate: "날짜를 확인하는 중…",
    cards: {
      all: ["금일 전체 작업", "착수 · 진행 · 종결 합계"],
      start: ["금일 신규 착수", "시작일 = 오늘"],
      ongoing: ["금일 지속 진행", "진행 중"],
      finish: ["금일 종결", "종료일 = 오늘"],
      tc: ["금일 T&C 계획", "당일 계획 단계"],
    },
    tabTeam: "팀별",
    tabBldg: "건물별",
    unitClick: "건 · 클릭 시 목록",
    noDetail: "세부 항목 없음",
    drill: "드릴다운",
    team: "팀",
    bldg: "건물",
    clearFilter: "필터 해제",
    safety: "Safety Focused Activities",
    reanalyze: "다시 분석",
    analyze: "안전 위험 분석",
    activities: "Today's Activities",
    tcSection: "Today's T&C",
    groups: {
      start: ["금일 신규 착수", "시작일 = 오늘"],
      ongoing: ["금일 지속 진행", "시작일 < 오늘 < 종료일"],
      finish: ["금일 종결", "종료일 = 오늘"],
    },
    noRows: "해당 항목이 없습니다.",
    noTc: "금일 계획된 T&C 단계가 없습니다.",
    actCols: ["공종", "건물", "Room", "Activity", "MS", "협력사", "수량", "계획%", "실적%", "시작", "종료", "상태"],
    tcCols: ["공종", "건물", "Group", "Item", "Equipment", "수량", "공급사", "상태"],
    st: { done: "완료", late: "지연", wip: "진행", ns: "미착수", incomplete: "미완료" },
    unassigned: "(미지정)",
    analyzing: "당일 작업을 분석하는 중입니다…",
    noTarget: "금일 해당하는 작업이 없어 분석할 대상이 없습니다.",
    preparing: "금일 안전 위험 분석을 준비하는 중입니다. 잠시 후 자동으로 표시됩니다.",
    noRisk: "특별히 주의가 필요한 고위험 작업이 확인되지 않았습니다.",
    hazard: "위험 요인",
    action: "권고 조치",
    aiAt: "AI 분석",
  },
  en: {
    pageTitle: "Today's Main Activities",
    pageDesc: "Based on Jeddah, Saudi Arabia local date (UTC+3) · independent of the data cut-off date",
    loadingDate: "Checking today's date…",
    cards: {
      all: ["Total Activities Today", "Start + Ongoing + Completion"],
      start: ["Commencing Today", "Start date = today"],
      ongoing: ["Ongoing Today", "Work in progress"],
      finish: ["Completing Today", "Finish date = today"],
      tc: ["T&C Scheduled Today", "Stages planned for today"],
    },
    tabTeam: "By Trade",
    tabBldg: "By Building",
    unitClick: "nos. · click to list",
    noDetail: "No breakdown",
    drill: "Drill-down",
    team: "Trade",
    bldg: "Building",
    clearFilter: "Clear filter",
    safety: "Safety Focused Activities",
    reanalyze: "Re-analyse",
    analyze: "Run Safety Analysis",
    activities: "Today's Activities",
    tcSection: "Today's T&C",
    groups: {
      start: ["Commencing Today", "Start date = today"],
      ongoing: ["Ongoing Today", "Start < today < Finish"],
      finish: ["Completing Today", "Finish date = today"],
    },
    noRows: "No activities in this category.",
    noTc: "No T&C stage is scheduled for today.",
    actCols: ["Trade", "Building", "Room", "Activity", "MS", "Subcontractor", "Qty", "Plan %", "Actual %", "Start", "Finish", "Status"],
    tcCols: ["Discipline", "Building", "Group", "Item", "Equipment", "Qty", "Supplier", "Status"],
    st: { done: "Completed", late: "Behind", wip: "In Progress", ns: "Not Started", incomplete: "Open" },
    unassigned: "(Unassigned)",
    analyzing: "Analysing today's activities…",
    noTarget: "No activity is scheduled today, so there is nothing to analyse.",
    preparing: "Today's safety risk analysis is being prepared. It will appear shortly.",
    noRisk: "No high-risk activity requiring special attention was identified.",
    hazard: "Hazard",
    action: "Control Measure",
    aiAt: "AI analysis",
  },
} as const;

const WD_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const fmtTodayEn = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  return `${day} (${WD_EN[d.getUTCDay()]})`;
};
