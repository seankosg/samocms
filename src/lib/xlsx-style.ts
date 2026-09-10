import XLSXS from "xlsx-js-style";

/** 공통 엑셀 서식 (컬럼 너비 / 행 높이 / 헤더 디자인 / 제목 행) */
const NAVY = "1E3A5F";
const HEADER_STYLE = {
  font: { name: "Arial", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
  fill: { patternType: "solid", fgColor: { rgb: NAVY } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: thin("D0D7E2"),
};
const BODY_STYLE = {
  font: { name: "Arial", sz: 10 },
  alignment: { vertical: "center" },
  border: thin("E3E8EF"),
};
const TITLE_STYLE = {
  font: { name: "Arial", sz: 14, bold: true, color: { rgb: NAVY } },
  alignment: { horizontal: "left", vertical: "center" },
};
const SUB_STYLE = { font: { name: "Arial", sz: 9, color: { rgb: "667085" } }, alignment: { vertical: "center" } };

function thin(rgb: string) {
  const s = { style: "thin", color: { rgb } } as const;
  return { top: s, bottom: s, left: s, right: s };
}

const dispLen = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // 한글/CJK는 2칸으로 계산
  return [...s].reduce((n, ch) => n + (/[\u1100-\u11FF\u3000-\u9FFF\uAC00-\uD7AF\uFF00-\uFF60]/.test(ch) ? 2 : 1), 0);
};

export type SheetOptions = { title?: string | undefined; subtitle?: string | undefined };

/** 레코드 배열 -> 서식이 적용된 워크시트 */
export function styledSheet(recs: Record<string, unknown>[], opts: SheetOptions = {}) {
  const headers = [...new Set(recs.flatMap((r) => Object.keys(r)))];
  const titleRows = (opts.title ? 1 : 0) + (opts.subtitle ? 1 : 0) + (opts.title || opts.subtitle ? 1 : 0);
  const aoa: unknown[][] = [];
  if (opts.title) aoa.push([opts.title]);
  if (opts.subtitle) aoa.push([opts.subtitle]);
  if (titleRows) aoa.push([]);
  aoa.push(headers);
  recs.forEach((r) => aoa.push(headers.map((h) => (r[h] ?? "") as unknown)));

  const ws = XLSXS.utils.aoa_to_sheet(aoa);
  const headerRow = titleRows;

  // 셀 스타일
  for (let r = headerRow; r < aoa.length; r++) {
    for (let c = 0; c < headers.length; c++) {
      const addr = XLSXS.utils.encode_cell({ r, c });
      const cell = (ws as Record<string, any>)[addr] ?? ((ws as Record<string, any>)[addr] = { t: "s", v: "" });
      const numeric = r > headerRow && typeof cell.v === "number";
      cell.s = r === headerRow
        ? HEADER_STYLE
        : { ...BODY_STYLE, alignment: { ...BODY_STYLE.alignment, horizontal: numeric ? "right" : "left" }, ...(r % 2 === 0 ? { fill: { patternType: "solid", fgColor: { rgb: "F6F8FB" } } } : {}) };
      if (numeric) cell.z = "#,##0";
    }
  }
  if (opts.title) {
    const a1 = (ws as Record<string, any>)["A1"];
    if (a1) a1.s = TITLE_STYLE;
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(headers.length - 1, 1) } }];
  }
  if (opts.subtitle) {
    const a2 = (ws as Record<string, any>)[XLSXS.utils.encode_cell({ r: opts.title ? 1 : 0, c: 0 })];
    if (a2) a2.s = SUB_STYLE;
    (ws["!merges"] ??= []).push({ s: { r: opts.title ? 1 : 0, c: 0 }, e: { r: opts.title ? 1 : 0, c: Math.max(headers.length - 1, 1) } });
  }

  // 컬럼 너비: 내용 기준 자동 (최소 8, 최대 40)
  ws["!cols"] = headers.map((h, c) => ({
    wch: Math.min(40, Math.max(8, Math.max(dispLen(h) + 2, ...recs.map((r) => dispLen(r[headers[c]!]) + 2)))),
  }));
  // 행 높이
  ws["!rows"] = aoa.map((_, r) => (r === 0 && opts.title ? { hpt: 24 } : r === headerRow ? { hpt: 26 } : { hpt: 18 }));
  ws["!freeze"] = { xSplit: 0, ySplit: headerRow + 1 };
  (ws as Record<string, any>)["!autofilter"] = {
    ref: XLSXS.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: aoa.length - 1, c: Math.max(headers.length - 1, 0) } }),
  };
  return ws;
}

/** 2차원 배열 -> 서식이 적용된 워크시트 (헤더 행 수 지정) */
export function styledAoaSheet(aoa: unknown[][], headerRows = 1, opts: SheetOptions = {}) {
  const lead: unknown[][] = [];
  if (opts.title) lead.push([opts.title]);
  if (opts.subtitle) lead.push([opts.subtitle]);
  if (lead.length) lead.push([]);
  const all = [...lead, ...aoa];
  const ws = XLSXS.utils.aoa_to_sheet(all);
  const width = Math.max(...all.map((r) => r.length));
  for (let r = lead.length; r < all.length; r++) {
    for (let c = 0; c < width; c++) {
      const addr = XLSXS.utils.encode_cell({ r, c });
      const cell = (ws as Record<string, any>)[addr] ?? ((ws as Record<string, any>)[addr] = { t: "s", v: "" });
      const isHead = r < lead.length + headerRows;
      const numeric = !isHead && typeof cell.v === "number";
      cell.s = isHead
        ? HEADER_STYLE
        : { ...BODY_STYLE, alignment: { ...BODY_STYLE.alignment, horizontal: numeric || c > 0 ? "right" : "left" } };
      if (numeric) cell.z = "#,##0";
    }
  }
  if (opts.title) {
    const a1 = (ws as Record<string, any>)["A1"];
    if (a1) a1.s = TITLE_STYLE;
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(width - 1, 1) } }];
  }
  if (opts.subtitle) {
    const cell = (ws as Record<string, any>)[XLSXS.utils.encode_cell({ r: opts.title ? 1 : 0, c: 0 })];
    if (cell) cell.s = SUB_STYLE;
    (ws["!merges"] ??= []).push({ s: { r: opts.title ? 1 : 0, c: 0 }, e: { r: opts.title ? 1 : 0, c: Math.max(width - 1, 1) } });
  }
  ws["!cols"] = Array.from({ length: width }, (_, c) => ({
    wch: Math.min(40, Math.max(8, ...all.map((r) => dispLen(r[c]) + 2))),
  }));
  ws["!rows"] = all.map((_, r) => (r === 0 && opts.title ? { hpt: 24 } : r < lead.length + headerRows ? { hpt: 24 } : { hpt: 18 }));
  ws["!freeze"] = { xSplit: 1, ySplit: lead.length + headerRows };
  return ws;
}

export { XLSXS };
