import * as XLSX from "xlsx";

export type ImportRow = {
  activity_no: string | null;
  discipline: string;
  building: string | null;
  room: string | null;
  work_scope: string | null;
  milestone: string | null;
  subcontractor: string | null;
  activity: string;
  unit: string | null;
  done_quantity: number | null;
  total_quantity: number | null;
  planned_progress: number | null;
  actual_progress: number | null;
  predecessor: string | null;
  successor: string | null;
  start_date: string | null;
  finish_date: string | null;
  source_file: string;
};

const text = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s.length ? s : null;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[%,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const date = (v: unknown): string | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  const m = s.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  return m ? `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}` : null;
};

const KNOWN = ["Arch", "Elec", "Int", "Mech", "Permit"];

/** 파일명에서 공종 키(Arch/Elec/Int/Mech/Permit)를 추출합니다. */
export function sourceKeyFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "");
  const hit = KNOWN.find((k) => new RegExp(`(^|[_\\-\\s])${k}($|[_\\-\\s])`, "i").test(base));
  return hit ?? base.slice(0, 64);
}

/** 통합공정표 시트를 파싱해 activities 행으로 변환합니다. */
export function parseScheduleWorkbook(buffer: ArrayBuffer, fileName: string): ImportRow[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames.find((n) => n.includes("통합공정표")) ?? wb.SheetNames[0]!;
  const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName]!, { header: 1, blankrows: false, raw: true });

  let headerRow = -1;
  for (let i = 0; i < Math.min(grid.length, 20); i += 1) {
    if (grid[i]?.some((c) => text(c) === "No.")) { headerRow = i; break; }
  }
  if (headerRow < 0) throw new Error(`"${fileName}"에서 공정표 표 머리글(No.)을 찾지 못했습니다.`);

  const rows: ImportRow[] = [];
  for (let i = headerRow + 3; i < grid.length; i += 1) {
    const r = grid[i] ?? [];
    const activity = text(r[7]);
    const discipline = text(r[1]);
    if (!activity || !discipline) continue;
    if (activity === "Activity") continue;
    rows.push({
      activity_no: text(r[0]),
      discipline,
      building: text(r[2]),
      room: text(r[3]),
      work_scope: text(r[4]),
      milestone: text(r[5]),
      subcontractor: text(r[6]),
      activity,
      unit: text(r[8]),
      done_quantity: num(r[9]),
      total_quantity: num(r[11]),
      planned_progress: num(r[12]),
      actual_progress: num(r[13]),
      predecessor: text(r[14]),
      successor: text(r[15]),
      start_date: date(r[16]),
      finish_date: date(r[17]),
      source_file: fileName,
    });
  }
  if (!rows.length) throw new Error(`"${fileName}"에서 읽을 수 있는 공정 데이터가 없습니다.`);
  return rows;
}
