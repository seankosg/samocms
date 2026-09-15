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
  /** 발주처 내부 부서 (발주처 업역 행만) */
  owner_dept?: string | null;
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

/** 진도율: 0~1 비율 저장. 1 초과 값(예: 100)은 퍼센트 입력으로 보고 100으로 나눈 뒤 0~1로 제한 */
const pctNum = (v: unknown): number | null => {
  const n = num(v);
  if (n == null) return null;
  const r = n > 1 ? n / 100 : n;
  return Math.min(1, Math.max(0, r));
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
/** 발주처 취합본 파일명 토큰 */
const OWNER_TOKENS = ["발주처", "HMMME"];

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

/**
 * 파일명에서 공종 키(Arch/Elec/Int/Mech/Permit/HMMME)를 추출합니다.
 * 판별할 수 없으면 null — 업로드 확인창에서 사용자가 공종을 고릅니다.
 */
export function sourceKeyFromFileName(fileName: string): string | null {
  const base = fileName.replace(/\.[^.]+$/, "");
  if (OWNER_TOKENS.some((t) => base.toUpperCase().includes(t.toUpperCase()))) return "HMMME";
  return KNOWN.find((k) => new RegExp(`(^|[_\\-\\s])${k}($|[_\\-\\s])`, "i").test(base)) ?? null;
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
      planned_progress: pctNum(r[12]),
      actual_progress: pctNum(r[13]),
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

/** Activity No 충돌(중복·빈 값) 한 건 — 업로드 확인창에서 사용자가 번호를 지정해 해소합니다. */
export type NoConflict = {
  /** 파싱된 rows 배열 내 위치 */
  index: number;
  /** 파일 안의 원래 번호(빈 값이면 null) */
  originalNo: string | null;
  activity: string;
  building: string | null;
  room: string | null;
  kind: "duplicate" | "missing";
};

/** 같은 파일 안에서 Activity No 중복·빈 값을 찾아냅니다. */
export function findNoConflicts(rows: ImportRow[]): NoConflict[] {
  const byNo = new Map<string, number[]>();
  const out: NoConflict[] = [];
  rows.forEach((r, index) => {
    const no = (r.activity_no ?? "").trim();
    if (!no) {
      out.push({ index, originalNo: null, activity: r.activity, building: r.building, room: r.room, kind: "missing" });
      return;
    }
    const list = byNo.get(no) ?? [];
    list.push(index);
    byNo.set(no, list);
  });
  byNo.forEach((idxs, no) => {
    if (idxs.length < 2) return;
    idxs.forEach((index) => {
      const r = rows[index]!;
      out.push({ index, originalNo: no, activity: r.activity, building: r.building, room: r.room, kind: "duplicate" });
    });
  });
  return out.sort((a, b) => a.index - b.index);
}

/** 입력된 번호가 파일 안과 DB(해당 공종)에서 모두 유일한지 검사합니다. */
export function validateNoOverrides(
  rows: ImportRow[],
  overrides: Record<number, string>,
  existingNos: string[],
): string | null {
  const taken = new Set(existingNos.map((s) => s.trim()).filter(Boolean));
  const fixed = rows.map((r, i) => (overrides[i] ?? r.activity_no ?? "").trim());
  const seen = new Set<string>();
  for (let i = 0; i < fixed.length; i += 1) {
    const no = fixed[i]!;
    if (!no) return `${i + 1}번째 행의 번호가 비어 있습니다.`;
    if (seen.has(no)) return `번호 "${no}"가 파일 안에서 중복됩니다.`;
    seen.add(no);
    if (overrides[i] !== undefined && taken.has(no)) return `번호 "${no}"는 이미 등록된 항목입니다. 다른 번호를 지정해 주세요.`;
  }
  return null;
}

