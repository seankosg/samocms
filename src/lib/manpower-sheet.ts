/** 구글 시트(봇 장부) 행 → 출면 카드 레코드 변환 (순수 함수) */
import type { Source } from "./manpower-model";

export type SheetEntry = {
  source: Source;
  sheet_row: number;
  submission_id: string;
  status: "ACTIVE" | "SUPERSEDED";
  reporter_name: string | null;
  reporter_tg_id: string | null;
  company: string;
  report_date: string;
  report_time: string | null;
  location: string;
  shift: string;
  staff: number;
  safety_officer: number;
  operator: number;
  worker: number;
  electrician: number;
  scaffolder: number;
  plumber: number;
  subtotal: number;
  submitted_at: string | null;
};

export type ParseResult = { rows: SheetEntry[]; errors: { row: number; reason: string }[] };

const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
};

const str = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
};

/** "2026-09-09 22:10:52" (제다 현지) → ISO */
export function parseTimestamp(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}+03:00`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** yyyy-mm-dd 로 정규화 (dd/mm/yyyy, mm/dd/yyyy 는 지원하지 않고 오류로 남김) */
export function parseDate(v: unknown): string | null {
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
}

const SHIFTS = new Set(["Day Shift", "Overtime", "Night Shift"]);

/**
 * 시트 탭의 values(헤더 포함)를 카드 레코드로 변환.
 * sheet_row = 시트의 실제 행 번호(헤더가 1행이므로 데이터는 2행부터).
 */
export function parseSheet(values: unknown[][] | undefined, source: Source): ParseResult {
  const rows: SheetEntry[] = [];
  const errors: { row: number; reason: string }[] = [];
  const body = (values ?? []).slice(1);

  body.forEach((raw, i) => {
    const rowNo = i + 2;
    const cells = raw ?? [];
    if (cells.every((c) => String(c ?? "").trim() === "")) return;

    const company = str(cells[5]);
    const report_date = parseDate(cells[6]);
    const location = str(cells[8]);
    const shift = str(cells[9]);
    const statusRaw = (str(cells[2]) ?? "ACTIVE").toUpperCase();

    if (!company) return void errors.push({ row: rowNo, reason: "협력사 없음" });
    if (!report_date) return void errors.push({ row: rowNo, reason: `보고일 형식 오류 (${String(cells[6] ?? "")})` });
    if (!location) return void errors.push({ row: rowNo, reason: "장소 없음" });
    if (!shift || !SHIFTS.has(shift)) return void errors.push({ row: rowNo, reason: `조 구분 오류 (${shift ?? ""})` });
    if (statusRaw !== "ACTIVE" && statusRaw !== "SUPERSEDED") {
      return void errors.push({ row: rowNo, reason: `상태 값 오류 (${statusRaw})` });
    }

    rows.push({
      source,
      sheet_row: rowNo,
      submission_id: str(cells[1]) ?? `${source}-${rowNo}`,
      status: statusRaw,
      reporter_name: str(cells[3]),
      reporter_tg_id: str(cells[4]),
      company,
      report_date,
      report_time: str(cells[7]),
      location,
      shift,
      staff: num(cells[10]),
      safety_officer: num(cells[11]),
      operator: num(cells[12]),
      worker: num(cells[13]),
      electrician: num(cells[14]),
      scaffolder: num(cells[15]),
      plumber: num(cells[16]),
      subtotal: num(cells[17]),
      submitted_at: parseTimestamp(cells[0]),
    });
  });

  return { rows, errors };
}

/** 기존 DB 행과 비교해 신규/변경 건수 산출 */
export function diffAgainstExisting(
  parsed: SheetEntry[],
  existing: { source: string; sheet_row: number; submission_id: string; status: string; subtotal: number; company: string; report_date: string }[],
) {
  const map = new Map(existing.map((e) => [`${e.source}|${e.sheet_row}`, e]));
  let added = 0;
  let changed = 0;
  parsed.forEach((r) => {
    const cur = map.get(`${r.source}|${r.sheet_row}`);
    if (!cur) added += 1;
    else if (
      cur.status !== r.status || cur.subtotal !== r.subtotal ||
      cur.company !== r.company || cur.report_date !== r.report_date
    ) changed += 1;
  });
  return { added, changed, unchanged: parsed.length - added - changed };
}

/** 스프레드시트 주소 또는 ID 문자열에서 ID 추출 */
export function sheetIdFrom(input: string): string | null {
  const s = input.trim();
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1]!;
  return /^[a-zA-Z0-9-_]{20,}$/.test(s) ? s : null;
}
