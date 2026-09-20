import { XLSXS } from "@/lib/xlsx-style";
import { NCR_COLUMNS, STAGE_EN, type NcrCol } from "@/lib/ncr-columns";
import { PS_NUMS, planField, actualField, currentStage, type SlotKey, type DateField, type NcrDates } from "@/lib/ncr-model";
import type { NcrItem } from "@/lib/ncr.functions";

/** NCR 리스트 → 서식이 적용된 엑셀 (필터·기준일 반영, 지연/임박 색상 표시) */

export type ListExportInput = {
  rows: NcrItem[];
  asOf: string;
  filters: { docType?: string | undefined; team?: string | undefined; sub?: string | undefined; status?: string | undefined; stage?: string | undefined; q?: string | undefined };
  drillLabel?: string | null;
};

const NAVY = "1E3A5F";
const NAVY2 = "2F5480";
const PLAN = "1D4ED8";
const ACTUAL = "15803D";
const DELAY = "B91C1C";
const UPCOMING = "B45309";
const GREY = "667085";
const SUB_HDR_FILL = "FACC15"; // 협력사 담당 단계(PS2/PS5/PS6/PS7) 헤더 — 노란 음영 + 검정 글씨
const SUB_HDR_TEXT = "111827";
const SUB_STAGES = new Set([2, 5, 6, 7]);
const SOFT = { plan: "EAF1FE", actual: "E9F7EE", delay: "FDEAEA", upcoming: "FDF3E4", zebra: "F6F8FB", group: "EEF2F7" };

const thin = (rgb: string) => {
  const s = { style: "thin", color: { rgb } } as const;
  return { top: s, bottom: s, left: s, right: s };
};

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const datesOf = (r: NcrItem) => r as unknown as NcrDates;

const fmtDate = (v: unknown) => {
  if (v == null || v === "") return "";
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
};

export function buildNcrListSheet(input: ListExportInput) {
  const { rows, asOf } = input;
  const upcomingLimit = addDays(asOf, 7);

  // 컬럼 레이아웃: 기본 컬럼 + PS1~PS8(각 4열) + Response Status
  const baseCols = NCR_COLUMNS.filter((c) => !c.groupId);
  const trailing = baseCols.filter((c) => c.key === "response_status");
  const leading = baseCols.filter((c) => c.key !== "response_status");
  const colIndex = new Map<string, number>();
  let ci = 0;
  for (const c of leading) colIndex.set(c.key, ci++);
  const stageStart = ci;
  for (const n of PS_NUMS) {
    colIndex.set(planField(`ps${n}s` as SlotKey), ci++);
    colIndex.set(actualField(`ps${n}s` as SlotKey), ci++);
    colIndex.set(planField(`ps${n}f` as SlotKey), ci++);
    colIndex.set(actualField(`ps${n}f` as SlotKey), ci++);
  }
  for (const c of trailing) colIndex.set(c.key, ci++);
  const width = ci;

  const filterText = [
    input.filters.docType && `문서종류: ${input.filters.docType}`,
    input.filters.status && `상태: ${input.filters.status}`,
    input.filters.stage && `현재단계: ${input.filters.stage}`,
    input.filters.sub && `협력사: ${input.filters.sub}`,
    input.filters.team && `팀: ${input.filters.team}`,
    input.filters.q && `검색: "${input.filters.q}"`,
  ].filter(Boolean).join("  ·  ") || "필터 없음(전체)";

  const meta: string[] = [`기준일 ${asOf.replace(/-/g, ".")}  ·  ${rows.length.toLocaleString()}건  ·  ${filterText}`];
  if (input.drillLabel) meta.push(`대시보드 상세조건 — ${input.drillLabel}`);

  const titleRows = 2 + meta.length; // 제목 + 빈줄 + 메타
  const aoa: unknown[][] = [];
  aoa.push(["HMMME NCR 리스트"]);
  for (const m of meta) aoa.push([m]);
  aoa.push([]);

  // 헤더 2행
  const head1: string[] = new Array(width).fill("");
  const head2: string[] = new Array(width).fill("");
  for (const c of [...leading, ...trailing]) head1[colIndex.get(c.key)!] = c.label;
  for (const n of PS_NUMS) {
    const s = colIndex.get(planField(`ps${n}s` as SlotKey))!;
    head1[s] = `PS${n} ${STAGE_EN[n]}`;
    head2[s] = "Plan Start";
    head2[s + 1] = "Actual Start";
    head2[s + 2] = "Plan Finish";
    head2[s + 3] = "Actual Finish";
  }
  aoa.push(head1, head2);

  // 데이터
  const dateVal = (r: NcrItem, key: string) => fmtDate((r as unknown as Record<string, unknown>)[key]);
  for (const r of rows) {
    const row: unknown[] = new Array(width).fill("");
    for (const c of leading) {
      const v = c.key === "current_stage" ? currentStage(datesOf(r)) : (r as unknown as Record<string, unknown>)[c.key];
      row[colIndex.get(c.key)!] = (v ?? "") as string;
    }
    for (const n of PS_NUMS) {
      const s = colIndex.get(planField(`ps${n}s` as SlotKey))!;
      row[s] = dateVal(r, planField(`ps${n}s` as SlotKey));
      row[s + 1] = dateVal(r, actualField(`ps${n}s` as SlotKey));
      row[s + 2] = dateVal(r, planField(`ps${n}f` as SlotKey));
      row[s + 3] = dateVal(r, actualField(`ps${n}f` as SlotKey));
    }
    for (const c of trailing) row[colIndex.get(c.key)!] = ((r as unknown as Record<string, unknown>)[c.key] ?? "") as string;
    aoa.push(row);
  }

  const ws = XLSXS.utils.aoa_to_sheet(aoa);
  const cellAt = (r: number, c: number) => {
    const addr = XLSXS.utils.encode_cell({ r, c });
    const w = ws as Record<string, any>;
    return (w[addr] ??= { t: "s", v: "" });
  };

  // 제목·메타
  cellAt(0, 0).s = { font: { name: "Arial", sz: 14, bold: true, color: { rgb: NAVY } }, alignment: { vertical: "center" } };
  for (let i = 0; i < meta.length; i++) {
    cellAt(1 + i, 0).s = { font: { name: "Arial", sz: 10, bold: i === 0, color: { rgb: i === 0 ? NAVY : GREY } }, alignment: { vertical: "center" } };
  }
  ws["!merges"] = [];
  for (let i = 0; i < 1 + meta.length; i++) {
    ws["!merges"].push({ s: { r: i, c: 0 }, e: { r: i, c: width - 1 } });
  }

  const headTop = titleRows;
  // 헤더 스타일 + 병합 (협력사 담당 단계 PS2/PS5/PS6/PS7은 노란 음영·검정 글씨)
  const subStageCol = (c: number) => {
    for (const n of PS_NUMS) {
      const s = colIndex.get(planField(`ps${n}s` as SlotKey))!;
      if (c >= s && c <= s + 3) return SUB_STAGES.has(n);
    }
    return false;
  };
  for (let c = 0; c < width; c++) {
    const isSub = subStageCol(c);
    cellAt(headTop, c).s = {
      font: { name: "Arial", sz: 10, bold: true, color: { rgb: isSub ? SUB_HDR_TEXT : "FFFFFF" } },
      fill: { patternType: "solid", fgColor: { rgb: isSub ? SUB_HDR_FILL : NAVY } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: thin("D0D7E2"),
    };
    cellAt(headTop + 1, c).s = {
      font: { name: "Arial", sz: 9, bold: true, color: { rgb: isSub ? SUB_HDR_TEXT : "FFFFFF" } },
      fill: { patternType: "solid", fgColor: { rgb: isSub ? SUB_HDR_FILL : NAVY2 } },
      alignment: { horizontal: "center", vertical: "center" },
      border: thin("D0D7E2"),
    };
  }
  for (const c of [...leading, ...trailing]) {
    const idx = colIndex.get(c.key)!;
    ws["!merges"].push({ s: { r: headTop, c: idx }, e: { r: headTop + 1, c: idx } });
  }
  for (const n of PS_NUMS) {
    const s = colIndex.get(planField(`ps${n}s` as SlotKey))!;
    ws["!merges"].push({ s: { r: headTop, c: s }, e: { r: headTop, c: s + 3 } });
  }

  // 바디 스타일
  const bodyTop = headTop + 2;
  const isDelay = (plan: string, actual: string) => !!plan && !actual && plan < asOf;
  const isUpcoming = (plan: string, actual: string) => !!plan && !actual && plan >= asOf && plan <= upcomingLimit;

  rows.forEach((r, ri) => {
    const rr = bodyTop + ri;
    const zebra = ri % 2 === 1;
    const baseFill = zebra ? SOFT.zebra : "FFFFFF";
    const put = (c: number, opts: { color?: string; fg?: string; bold?: boolean; align?: string }) => {
      cellAt(rr, c).s = {
        font: { name: "Arial", sz: 9, bold: !!opts.bold, color: { rgb: opts.color ?? "1F2937" } },
        fill: { patternType: "solid", fgColor: { rgb: opts.fg ?? baseFill } },
        alignment: { horizontal: opts.align ?? "left", vertical: "center" },
        border: thin("E3E8EF"),
      };
    };
    for (const c of leading) {
      const idx = colIndex.get(c.key)!;
      if (c.key === "status") {
        const v = String((r as unknown as Record<string, unknown>)["status"] ?? "").toLowerCase();
        const closed = v.includes("close");
        put(idx, { bold: true, align: "center", color: closed ? ACTUAL : NAVY, fg: closed ? SOFT.actual : baseFill });
      } else if (c.key === "current_stage") {
        const v = currentStage(datesOf(r));
        const closed = v === "Closed";
        put(idx, { bold: true, align: "center", color: closed ? ACTUAL : NAVY, fg: closed ? SOFT.actual : SOFT.group });
      } else if (c.key === "ser_no") {
        put(idx, { align: "center", color: GREY });
      } else if (c.key === "doc_no") {
        put(idx, { bold: true, color: NAVY });
      } else if (c.kind === "date") {
        put(idx, { align: "center" });
      } else {
        put(idx, {});
      }
    }
    for (const n of PS_NUMS) {
      for (const part of ["s", "f"] as const) {
        const slot = `ps${n}${part}` as SlotKey;
        const pk: DateField = planField(slot);
        const ak: DateField = actualField(slot);
        const pIdx = colIndex.get(pk)!;
        const aIdx = colIndex.get(ak)!;
        const plan = dateVal(r, pk);
        const actual = dateVal(r, ak);
        // 계획: 파랑 / 지연: 빨강 배경 / 임박: 주황 배경
        if (isDelay(plan, actual)) put(pIdx, { align: "center", bold: true, color: DELAY, fg: SOFT.delay });
        else if (isUpcoming(plan, actual)) put(pIdx, { align: "center", bold: true, color: UPCOMING, fg: SOFT.upcoming });
        else put(pIdx, { align: "center", color: plan ? PLAN : GREY, fg: plan ? SOFT.plan : baseFill });
        // 실적: 초록
        put(aIdx, { align: "center", bold: !!actual, color: actual ? ACTUAL : GREY, fg: actual ? SOFT.actual : baseFill });
      }
    }
    for (const c of trailing) put(colIndex.get(c.key)!, {});
  });

  // 컬럼 너비: NCR_COLUMNS width(px) → wch 환산, description은 고정 폭
  ws["!cols"] = Array.from({ length: width }, (_, c) => {
    const entry = [...colIndex.entries()].find(([, i]) => i === c);
    const def: NcrCol | undefined = entry ? NCR_COLUMNS.find((x) => x.key === entry[0]) : undefined;
    if (!def) return { wch: 11 };
    if (def.key === "description") return { wch: 46 };
    if (def.groupId) return { wch: 11.5 };
    return { wch: Math.max(7, Math.round(def.width / 8)) };
  });

  ws["!rows"] = aoa.map((_, r) =>
    r === 0 ? { hpt: 24 } : r < titleRows - 1 ? { hpt: 15 } : r === titleRows - 1 ? { hpt: 6 } : r === headTop ? { hpt: 26 } : r === headTop + 1 ? { hpt: 18 } : { hpt: 17 },
  );
  ws["!freeze"] = { xSplit: colIndex.get("doc_no")! + 1, ySplit: bodyTop };
  (ws as Record<string, any>)["!autofilter"] = {
    ref: XLSXS.utils.encode_range({ s: { r: headTop + 1, c: 0 }, e: { r: aoa.length - 1, c: width - 1 } }),
  };

  return ws;
}

/** NCR 리스트 단독 파일보내기 */
export function exportNcrList(input: ListExportInput) {
  const wb = XLSXS.utils.book_new();
  XLSXS.utils.book_append_sheet(wb, buildNcrListSheet(input), "NCR List");
  XLSXS.writeFile(wb, `HMMME_NCR_List_${input.asOf.replace(/-/g, "")}.xlsx`);
}
