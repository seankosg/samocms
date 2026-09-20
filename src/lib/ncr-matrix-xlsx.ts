import { XLSXS } from "@/lib/xlsx-style";
import { PS_LABEL, PS_LABEL_EN, PS_NUMS } from "@/lib/ncr-model";
import { buildNcrListSheet, type ListExportInput } from "@/lib/ncr-list-xlsx";

/** NCR 대시보드 매트릭스 → 서식이 적용된 엑셀 (영문/한글 연동, 기준일·필터 반영) */

export type MatrixStat = {
  n: number; sPlan: number; sAct: number; fPlan: number; fAct: number;
  sDelay: number; fDelay: number; cur: number; noPlan: number;
  ongoing: number; ongoingDelay: number; upS: number; upF: number;
};

export type MatrixExportInput = {
  lang: "ko" | "en";
  asOf: string;
  within: number;
  total: number;
  closed: number;
  noPlanTotal: number;
  stats: MatrixStat[];
  filters: { docType?: string | undefined; team?: string | undefined; sub?: string | undefined };
  /** 지정 시 동일 파일에 NCR 리스트 시트를 추가 */
  list?: Omit<ListExportInput, "asOf" | "filters"> | undefined;
};

const NAVY = "1E3A5F";
const PLAN = "1D4ED8";
const ACTUAL = "15803D";
const DELAY = "B91C1C";
const UPCOMING = "B45309";
const GREY = "667085";
const SOFT = { plan: "EAF1FE", actual: "E9F7EE", delay: "FDEAEA", upcoming: "FDF3E4", zebra: "F6F8FB" };
const STAGE_FILL = ["F1F5F9", "DBEAFE", "BFDBFE", "93C5FD", "60A5FA"];
const SUB_HDR_FILL = "FACC15"; // 협력사 담당 단계(PS2/PS5/PS6/PS7) — 노란 음영 + 검정 글씨
const SUB_HDR_TEXT = "111827";
const SUB_STAGES = new Set([2, 5, 6, 7]);

const thin = (rgb: string) => {
  const s = { style: "thin", color: { rgb } } as const;
  return { top: s, bottom: s, left: s, right: s };
};

const T = {
  ko: {
    title: "NCR 단계별 진행 매트릭스",
    asOf: "기준일", filters: "필터", none: "전체", docType: "문서종류", team: "팀", sub: "협력사",
    summary: "대상", closed: "종결", remain: "잔여", upcomingNote: (n: number) => `Upcoming 임계치 ${n}일`,
    sheet: "매트릭스", file: "NCR_매트릭스",
    col: "구분", closedCol: "종결", unit: "건",
    rows: {
      startP: "Start 계획(P)", startA: "Start 실적(A)", startR: "Start 달성률",
      ongoing: "진행 중(시작 후 미완료)", ongoingDelay: "완료계획 경과",
      finishP: "Finish 계획(P)", finishA: "Finish 실적(A)", finishR: "Finish 달성률",
      remain: "잔여(대상 − Finish 실적)",
      delayS: "지연 Start", delayF: "지연 Finish", delayT: "지연 합계",
      upS: "임박 Start", upF: "임박 Finish", upT: "임박 합계",
      cur: "현재단계 건수", noPlan: "계획일 없음",
    },
  },
  en: {
    title: "NCR Operational Progress Matrix",
    asOf: "As of", filters: "Filters", none: "All", docType: "Doc Type", team: "Team", sub: "Subcontractor",
    summary: "Scope", closed: "Closed", remain: "Remain", upcomingNote: (n: number) => `Upcoming threshold ${n} days`,
    sheet: "Matrix", file: "NCR_Matrix",
    col: "Category", closedCol: "Closed", unit: "ea",
    rows: {
      startP: "Start Plan (P)", startA: "Start Actual (A)", startR: "Start Achievement",
      ongoing: "In Progress (started, open)", ongoingDelay: "Finish plan overdue",
      finishP: "Finish Plan (P)", finishA: "Finish Actual (A)", finishR: "Finish Achievement",
      remain: "Remain (Scope − Finish Actual)",
      delayS: "Delay Start", delayF: "Delay Finish", delayT: "Delay Total",
      upS: "Upcoming Start", upF: "Upcoming Finish", upT: "Upcoming Total",
      cur: "Current Stage", noPlan: "No Plan",
    },
  },
} as const;

type Tone = "plan" | "actual" | "delay" | "upcoming" | "neutral" | "stage";
type Row = { label: string; tone: Tone; values: number[]; closed?: number | null; percent?: boolean; group?: boolean };

export function exportNcrMatrix(input: MatrixExportInput) {
  const t = T[input.lang];
  const L = input.lang === "en" ? PS_LABEL_EN : PS_LABEL;
  const s = input.stats;
  const pct = (v: number) => (input.total > 0 ? Math.round((v / input.total) * 100) : 0);
  const at = (n: number) => s.find((x) => x.n === n)!;
  const col = (pick: (st: MatrixStat) => number) => PS_NUMS.map((n) => pick(at(n)));

  const rows: Row[] = [
    { label: t.rows.startP, tone: "plan", values: col((x) => x.sPlan), group: true },
    { label: t.rows.startA, tone: "actual", values: col((x) => x.sAct) },
    { label: t.rows.startR, tone: "neutral", values: col((x) => pct(x.sAct)), percent: true },
    { label: t.rows.ongoing, tone: "plan", values: col((x) => x.ongoing), group: true },
    { label: t.rows.ongoingDelay, tone: "delay", values: col((x) => x.ongoingDelay) },
    { label: t.rows.finishP, tone: "plan", values: col((x) => x.fPlan), group: true },
    { label: t.rows.finishA, tone: "actual", values: col((x) => x.fAct), closed: input.closed },
    { label: t.rows.finishR, tone: "neutral", values: col((x) => pct(x.fAct)), percent: true },
    { label: t.rows.remain, tone: "delay", values: col((x) => input.total - x.fAct), closed: input.total - input.closed, group: true },
    { label: t.rows.delayS, tone: "delay", values: col((x) => x.sDelay), group: true },
    { label: t.rows.delayF, tone: "delay", values: col((x) => x.fDelay) },
    { label: t.rows.delayT, tone: "delay", values: col((x) => x.sDelay + x.fDelay) },
    { label: t.rows.upS, tone: "upcoming", values: col((x) => x.upS), group: true },
    { label: t.rows.upF, tone: "upcoming", values: col((x) => x.upF) },
    { label: t.rows.upT, tone: "upcoming", values: col((x) => x.upS + x.upF) },
    { label: t.rows.cur, tone: "stage", values: col((x) => x.cur), closed: input.closed, group: true },
    { label: t.rows.noPlan, tone: "neutral", values: col((x) => x.noPlan), closed: input.noPlanTotal, group: true },
  ];

  const filterText = [
    `${t.docType}: ${input.filters.docType || t.none}`,
    `${t.team}: ${input.filters.team || t.none}`,
    `${t.sub}: ${input.filters.sub || t.none}`,
  ].join("  ·  ");
  const summaryText = `${t.summary} ${input.total}${input.lang === "ko" ? "건" : ""}  ·  ${t.closed} ${input.closed}  ·  ${t.remain} ${input.total - input.closed}  ·  ${t.upcomingNote(input.within)}`;

  const width = 1 + PS_NUMS.length + 1;
  const aoa: unknown[][] = [
    [t.title],
    [`${t.asOf}: ${input.asOf.replace(/-/g, ".")}`],
    [`${t.filters} — ${filterText}`],
    [summaryText],
    [],
    [t.col, ...PS_NUMS.map((n) => `PS${n}`), t.closedCol],
    ["", ...PS_NUMS.map((n) => L[n] ?? ""), ""],
    ...rows.map((r) => [r.label, ...r.values, r.closed ?? ""]),
  ];

  const ws = XLSXS.utils.aoa_to_sheet(aoa);
  const cellAt = (r: number, c: number) => {
    const addr = XLSXS.utils.encode_cell({ r, c });
    const w = ws as Record<string, any>;
    return (w[addr] ??= { t: "s", v: "" });
  };

  // 제목 영역
  cellAt(0, 0).s = { font: { name: "Arial", sz: 15, bold: true, color: { rgb: NAVY } }, alignment: { vertical: "center" } };
  for (const r of [1, 2, 3]) cellAt(r, 0).s = { font: { name: "Arial", sz: 10, bold: r === 1, color: { rgb: r === 1 ? NAVY : GREY } }, alignment: { vertical: "center" } };
  ws["!merges"] = [0, 1, 2, 3].map((r) => ({ s: { r, c: 0 }, e: { r, c: width - 1 } }));

  // 헤더 2행
  const headTop = 5;
  for (let c = 0; c < width; c++) {
    const isSub = c >= 1 && c <= PS_NUMS.length && SUB_STAGES.has(PS_NUMS[c - 1]!);
    cellAt(headTop, c).s = {
      font: { name: "Arial", sz: 11, bold: true, color: { rgb: isSub ? SUB_HDR_TEXT : "FFFFFF" } },
      fill: { patternType: "solid", fgColor: { rgb: isSub ? SUB_HDR_FILL : NAVY } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: thin("D0D7E2"),
    };
    cellAt(headTop + 1, c).s = {
      font: { name: "Arial", sz: 9, color: { rgb: isSub ? SUB_HDR_TEXT : "FFFFFF" } },
      fill: { patternType: "solid", fgColor: { rgb: isSub ? SUB_HDR_FILL : "2F5480" } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: thin("D0D7E2"),
    };
  }

  const maxCur = Math.max(0, ...rows.find((r) => r.tone === "stage")!.values);
  const bodyTop = headTop + 2;
  rows.forEach((row, i) => {
    const r = bodyTop + i;
    cellAt(r, 0).s = {
      font: { name: "Arial", sz: 10, bold: true, color: { rgb: NAVY } },
      fill: { patternType: "solid", fgColor: { rgb: row.group ? "EEF2F7" : "FFFFFF" } },
      alignment: { vertical: "center", wrapText: true },
      border: thin("D5DCE5"),
    };
    for (let c = 1; c < width; c++) {
      const cell = cellAt(r, c);
      const v = typeof cell.v === "number" ? cell.v : null;
      let fg = "FFFFFF";
      let color = "1F2937";
      if (row.tone === "plan") { color = PLAN; if (v) fg = SOFT.plan; }
      else if (row.tone === "actual") { color = ACTUAL; if (v) fg = SOFT.actual; }
      else if (row.tone === "delay") { color = v ? DELAY : GREY; if (v) fg = SOFT.delay; }
      else if (row.tone === "upcoming") { color = v ? UPCOMING : GREY; if (v) fg = SOFT.upcoming; }
      else if (row.tone === "stage") {
        const idx = !v || maxCur === 0 ? 0 : Math.min(4, Math.ceil((v / maxCur) * 4));
        fg = STAGE_FILL[idx]!;
        color = idx >= 4 ? "0B3A79" : "1F2937";
      } else { color = v ? "1F2937" : GREY; fg = i % 2 === 0 ? SOFT.zebra : "FFFFFF"; }
      cell.s = {
        font: { name: "Arial", sz: 11, bold: (v ?? 0) > 0, color: { rgb: color } },
        fill: { patternType: "solid", fgColor: { rgb: fg } },
        alignment: { horizontal: "center", vertical: "center" },
        border: thin("D5DCE5"),
      };
      if (v !== null) cell.z = row.percent ? '0"%"' : "#,##0";
    }
  });

  ws["!cols"] = [{ wch: 30 }, ...PS_NUMS.map(() => ({ wch: 11 })), { wch: 12 }];
  ws["!rows"] = aoa.map((_, r) =>
    r === 0 ? { hpt: 26 } : r < 4 ? { hpt: 16 } : r === 4 ? { hpt: 8 } : r === headTop ? { hpt: 24 } : r === headTop + 1 ? { hpt: 30 } : { hpt: 22 },
  );
  ws["!freeze"] = { xSplit: 1, ySplit: bodyTop };

  const wb = XLSXS.utils.book_new();
  XLSXS.utils.book_append_sheet(wb, ws, t.sheet);
  // 대시보드 필터 기준의 NCR 리스트를 두 번째 시트로 추가
  if (input.list) {
    const listWs = buildNcrListSheet({
      ...input.list,
      asOf: input.asOf,
      filters: { docType: input.filters.docType, team: input.filters.team, sub: input.filters.sub },
    });
    XLSXS.utils.book_append_sheet(wb, listWs, "NCR List");
  }
  const subTag = (input.filters.sub ?? "").trim() || "All";
  XLSXS.writeFile(wb, `${t.file}_${subTag}_${input.asOf.replace(/-/g, "")}.xlsx`);
}
