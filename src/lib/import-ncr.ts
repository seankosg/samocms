import * as XLSX from "xlsx";
import { planField, actualField, PS_NUMS, type DateField } from "./ncr-model";

export type NcrImportRow = {
  ser_no: string | null;
  doc_type: string | null;
  doc_no: string;
  description: string | null;
  location: string | null;
  issued_by: string | null;
  issued_date: string | null;
  team: string | null;
  mic: string | null;
  pic: string | null;
  subcontractor: string | null;
  status: string | null;
  current_stage_file: string | null;
  response_status: string | null;
} & Record<DateField, string | null>;

const text = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s.length ? s : null;
};

const iso = (v: unknown): string | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}` : null;
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const m = String(v).match(/(20\d{2})[-./](\d{1,2})[-./](\d{1,2})/);
  return m ? `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}` : null;
};

/** NCR 마스터 워크북 여부 — 시트에 「Current Stage」 + 「PS1S」 헤더가 있으면 NCR로 인식 */
export function isNcrWorkbook(wb: XLSX.WorkBook): boolean {
  return wb.SheetNames.some((name) => {
    const sheet = wb.Sheets[name];
    if (!sheet) return false;
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, raw: true });
    const cells = grid.slice(0, 12).flatMap((row) => (row ?? []).map((c) => String(c ?? "").trim()));
    return cells.includes("Current Stage") && cells.includes("PS1S");
  });
}

/** Master(NCR+OR+SOR) 시트 파싱 — 3단 헤더(단계명 → PS1S… → Plan/Actual) */
export function parseNcrWorkbook(buffer: ArrayBuffer, fileName: string): { rows: NcrImportRow[]; fileDate: string | null } {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName =
    wb.SheetNames.find((n) => {
      const sheet = wb.Sheets[n];
      if (!sheet) return false;
      const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, raw: true });
      const cells = grid.slice(0, 12).flatMap((row) => (row ?? []).map((c) => String(c ?? "").trim()));
      return cells.includes("Current Stage") && cells.includes("PS1S");
    }) ?? wb.SheetNames[0]!;
  const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName]!, { header: 1, blankrows: false, raw: true });

  let head = -1;
  for (let i = 0; i < Math.min(grid.length, 12); i += 1) {
    if ((grid[i] ?? []).some((c) => String(c ?? "").trim() === "SerNo")) { head = i; break; }
  }
  if (head < 0) throw new Error(`"${fileName}"에서 NCR 표 머리글(SerNo)을 찾지 못했습니다.`);

  // Data Date — 상단 「Data Date」 셀 오른쪽 첫 날짜값
  let fileDate: string | null = null;
  for (let i = 0; i < head; i += 1) {
    const r = grid[i] ?? [];
    const at = r.findIndex((c) => /data\s*date|기준일/i.test(String(c ?? "")));
    if (at >= 0) {
      for (let j = at + 1; j < r.length; j += 1) {
        const d = iso(r[j]);
        if (d) { fileDate = d; break; }
      }
    }
    if (fileDate) break;
  }
  if (!fileDate) {
    const m = fileName.match(/(20\d{2})[-._]?(\d{2})[-._]?(\d{2})/);
    fileDate = m ? `${m[1]}-${m[2]}-${m[3]}` : null;
  }

  // 기본 13열 + PS1~PS8 × (Plan Start, Actual Start, Plan Finish, Actual Finish) = 45열, 그 다음 Response Status
  const respCol = 13 + PS_NUMS.length * 4;
  const rows: NcrImportRow[] = [];
  for (let i = head + 3; i < grid.length; i += 1) {
    const r = grid[i] ?? [];
    const docNo = text(r[2]);
    const desc = text(r[3]);
    if (!docNo && !desc) continue;
    if (!docNo) continue; // 문서번호 없는 행은 식별 불가 — 건너뜀
    // 단계별 4열 = [Start Plan, Start Actual, Finish Plan, Finish Actual]
    const stage: Partial<Record<DateField, string | null>> = {};
    PS_NUMS.forEach((n, idx) => {
      const base = 13 + idx * 4;
      stage[planField(`ps${n}s`)] = iso(r[base]);
      stage[actualField(`ps${n}s`)] = iso(r[base + 1]);
      stage[planField(`ps${n}f`)] = iso(r[base + 2]);
      stage[actualField(`ps${n}f`)] = iso(r[base + 3]);
    });
    rows.push({
      ser_no: text(r[0]),
      doc_type: text(r[1]),
      doc_no: docNo,
      description: desc,
      location: text(r[4]),
      issued_by: text(r[5]),
      issued_date: iso(r[6]),
      team: text(r[7]),
      mic: text(r[8]),
      pic: text(r[9]),
      subcontractor: text(r[10]),
      status: text(r[11]),
      current_stage_file: text(r[12]),
      response_status: text(r[respCol]),
      ...(stage as Record<DateField, string | null>),
    });
  }
  if (!rows.length) throw new Error(`"${fileName}"에서 읽을 수 있는 NCR 데이터가 없습니다.`);
  return { rows, fileDate };
}
