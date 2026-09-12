import * as XLSX from "xlsx";

export type ImportRow = {
  activity_no: string | null;
  discipline: string;
  building: string | null;
  room: string | null;
  work_scope: string | null;
  milestone: string | null;
  subcontractor: string | null;
  manager: string | null;
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

/** 공정표 담당자 이름 → CMS 사용자 이름 교정표 (불일치 발견 시 여기에 추가) */
export const MANAGER_ALIAS: Record<string, string> = {
  "황태언": "황태연",
};

/** 담당자 이름을 CMS 사용자 이름으로 통일합니다. */
export function normalizeManager(v: string | null): string | null {
  if (!v) return null;
  const s = v.replace(/\s+/g, " ").trim();
  if (!s) return null;
  return MANAGER_ALIAS[s] ?? s;
}

/** 파일명에서 공종 키(Arch/Elec/Int/Mech/Permit)를 추출합니다. */
export function sourceKeyFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "");
  const hit = KNOWN.find((k) => new RegExp(`(^|[_\\-\\s])${k}($|[_\\-\\s])`, "i").test(base));
  return hit ?? base.slice(0, 64);
}

/** 파일명의 YYYYMMDD → ISO 날짜 */
export function dateFromFileName(fileName: string): string | null {
  const m = fileName.match(/(20\d{2})[-._]?(\d{2})[-._]?(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** 통합공정표 시트를 파싱해 activities 행과 파일 기준일을 반환합니다. */
export function parseScheduleWorkbook(buffer: ArrayBuffer, fileName: string): ImportRow[] {
  return parseScheduleFile(buffer, fileName).rows;
}

export function parseScheduleFile(buffer: ArrayBuffer, fileName: string): { rows: ImportRow[]; fileDate: string | null } {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames.find((n) => n.includes("통합공정표")) ?? wb.SheetNames[0]!;
  const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName]!, { header: 1, blankrows: false, raw: true });

  let headerRow = -1;
  for (let i = 0; i < Math.min(grid.length, 20); i += 1) {
    if (grid[i]?.some((c) => text(c) === "No.")) { headerRow = i; break; }
  }
  if (headerRow < 0) throw new Error(`"${fileName}"에서 공정표 표 머리글(No.)을 찾지 못했습니다.`);

  // 시트 상단의 「기준일」 셀 → 오른쪽 첫 날짜값
  let sheetDate: string | null = null;
  for (let i = 0; i < Math.min(grid.length, headerRow + 1); i += 1) {
    const r = grid[i] ?? [];
    const at = r.findIndex((c) => /기준일/.test(String(text(c) ?? "")));
    if (at >= 0) {
      for (let j = at + 1; j < r.length; j += 1) {
        const d = date(r[j]);
        if (d) { sheetDate = d; break; }
      }
    }
    if (sheetDate) break;
  }
  const fileDate = sheetDate ?? dateFromFileName(fileName);

  // 머리글(2~3행)에 「담당」/「담당자」 컬럼이 있으면 그 위치를 찾아 함께 읽습니다.
  // 「담당부서」(공종) 컬럼은 제외합니다.
  let managerCol = -1;
  for (let i = headerRow; i < Math.min(grid.length, headerRow + 3); i += 1) {
    const at = (grid[i] ?? []).findIndex((c) => {
      const s = String(text(c) ?? "");
      if (!s) return false;
      if (/부서|dept|department|division|팀/i.test(s)) return false;
      return /^담당\s*자?$/.test(s) || /manager|in\s*charge/i.test(s);
    });
    if (at >= 0) { managerCol = at; break; }
  }

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
      manager: managerCol >= 0 ? normalizeManager(text(r[managerCol])) : null,
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
  return { rows, fileDate };
}
