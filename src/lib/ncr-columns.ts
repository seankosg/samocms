/** NCR 리스트 컬럼 정의 — 임포트 엑셀(Master(NCR+OR+SOR))의 컬럼 순서와 1:1로 일치합니다. */
import { PS_NUMS, planField, actualField, type SlotKey } from "./ncr-model";

/** 엑셀 1단 헤더(단계명) — 파일 표기 그대로 */
export const STAGE_EN: Record<number, string> = {
  1: "Notification to Subcon",
  2: "Subcon's MST Submission",
  3: "MST Submission to Consultant",
  4: "MST Approval",
  5: "Remedial Work",
  6: "Inspection",
  7: "Close-out Request Submission",
  8: "Response",
};

export type NcrFilterKind = "multi" | "text" | "date" | null;

export type NcrCol = {
  key: string;
  label: string;
  /** 2단 헤더(PS 코드) 그룹 라벨 — 기본 컬럼은 없음 */
  group?: string;
  groupId?: string;
  width: number;
  kind: "text" | "date" | "num" | "status" | "stage";
  filter: NcrFilterKind;
  editable?: boolean;
};

const base: NcrCol[] = [
  { key: "ser_no", label: "SerNo", width: 64, kind: "num", filter: "text" },
  { key: "doc_type", label: "Doc Type", width: 84, kind: "text", filter: "multi" },
  { key: "doc_no", label: "Doc No.", width: 190, kind: "text", filter: "text" },
  { key: "description", label: "Description", width: 320, kind: "text", filter: "text" },
  { key: "location", label: "Location", width: 150, kind: "text", filter: "multi" },
  { key: "issued_by", label: "Issued By", width: 120, kind: "text", filter: "multi" },
  { key: "issued_date", label: "Issue Date", width: 102, kind: "date", filter: "date" },
  { key: "team", label: "Team", width: 78, kind: "text", filter: "multi" },
  { key: "mic", label: "MIC", width: 92, kind: "text", filter: "multi", editable: true },
  { key: "pic", label: "PIC", width: 92, kind: "text", filter: "multi", editable: true },
  { key: "subcontractor", label: "Subcontractor", width: 140, kind: "text", filter: "multi" },
  { key: "status", label: "Status", width: 88, kind: "status", filter: "multi" },
  { key: "current_stage", label: "Current Stage", width: 116, kind: "stage", filter: "multi" },
];

const stageCols: NcrCol[] = PS_NUMS.flatMap((n) => {
  const s = `ps${n}s` as SlotKey;
  const f = `ps${n}f` as SlotKey;
  const group = `${STAGE_EN[n]} [PS${n}]`;
  const groupId = `PS${n}`;
  const col = (key: string, label: string): NcrCol => ({ key, label, group, groupId, width: 96, kind: "date", filter: "date", editable: true });
  return [
    col(planField(s), "Plan Start"),
    col(actualField(s), "Actual Start"),
    col(planField(f), "Plan Finish"),
    col(actualField(f), "Actual Finish"),
  ];
});

export const NCR_COLUMNS: NcrCol[] = [
  ...base,
  ...stageCols,
  { key: "response_status", label: "Response Status", width: 130, kind: "text", filter: "multi" },
];

export const NCR_COL_MAP = new Map(NCR_COLUMNS.map((c) => [c.key, c]));
export const NCR_DEFAULT_ORDER = NCR_COLUMNS.map((c) => c.key);
export const NCR_DEFAULT_FROZEN = ["doc_no"];
