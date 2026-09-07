import * as XLSX from "xlsx";
import { normBldg, flat } from "./schedule-model";

export type TcImportRow = {
  row_no: number | null;
  bldg: string | null;
  bldg_raw: string | null;
  grp: string | null;
  item: string | null;
  equip: string | null;
  qty: number;
  supplier: string | null;
  t0_p: string | null; t0_a: string | null; t0_d: number | null; t0_rem: number | null;
  t1_p: string | null; t1_a: string | null; t1_d: number | null; t1_rem: number | null;
  rp_p: string | null; rp_a: string | null; rp_d: number | null; rp_rem: number | null;
  rfi_p: string | null; rfi_a: string | null; rfi_d: number | null; rfi_rem: number | null;
  t2_p: string | null; t2_a: string | null;
  resp_p: string | null; resp_a: string | null;
  status: string | null;
  docref: string | null;
};

const TC_SHRE = /T\s*&?\s*C|Commission|시운전/i;
export const tcSheetOf = (wb: XLSX.WorkBook) => wb.SheetNames.find((n) => TC_SHRE.test(n)) ?? null;
export const isTcWorkbook = (wb: XLSX.WorkBook) => !!tcSheetOf(wb);

const LBL: [keyof TcImportRow | "disc", RegExp][] = [
  ["disc", /^(공종|Discipline|Disc)$/i],
  ["row_no", /^No\.?$/i],
  ["bldg", /^Bldg/i],
  ["grp", /^Group$/i],
  ["item", /^Item$/i],
  ["equip", /^Equipment$/i],
  ["qty", /Q'?ty/i],
  ["t0_p", /^T0\s*Plan/i], ["t0_a", /^T0\s*Actual/i], ["t0_d", /^T0\s*Done/i], ["t0_rem", /^T0\s*Remain/i],
  ["t1_p", /^T1\s*Plan/i], ["t1_a", /^T1\s*Actual/i], ["t1_d", /^T1\s*Done/i], ["t1_rem", /^T1\s*Remain/i],
  ["rp_p", /^Report\s*Plan/i], ["rp_a", /^Report\s*Actual/i], ["rp_d", /^Report\s*Done/i], ["rp_rem", /^Report\s*Remain/i],
  ["rfi_p", /^RFI\s*Plan/i], ["rfi_a", /^RFI\s*Actual/i], ["rfi_d", /^RFI\s*Done/i], ["rfi_rem", /^RFI\s*Remain/i],
  ["t2_p", /^T2\s*Plan/i], ["t2_a", /^T2\s*Actual/i],
  ["resp_p", /^Response\s*Plan/i], ["resp_a", /^Response\s*Actual/i],
  ["supplier", /^(Subcon|Supplier)$/i],
  ["status", /^Status$/i],
  ["docref", /Doc\s*Reference/i],
];

const iso = (v: unknown): string | null => {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}` : null;
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const m = String(v).match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  return m ? `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}` : null;
};
const numV = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[,\s]/g, ""));
  return isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => flat(v) || null;
const normStatus = (v: unknown): string | null => {
  const s = flat(v);
  if (!s) return null;
  const l = s.toLowerCase();
  if (l === "pass") return "Pass";
  if (l === "fail") return "Fail";
  return s;
};

/** T&C 워크북(Equipment / Q'ty / T0 Plan 헤더)을 파싱 */
export function parseTcWorkbook(buffer: ArrayBuffer, fileName: string) {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = tcSheetOf(wb);
  if (!sheet) throw new Error(`"${fileName}"에서 T&C 시트를 찾지 못했습니다.`);
  const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet]!, { header: 1, blankrows: false, raw: true });

  let head = -1;
  for (let i = 0; i < Math.min(grid.length, 12); i += 1) {
    const cells = (grid[i] ?? []).map((c) => flat(c));
    if (cells.some((c) => /^Equipment$/i.test(c)) && cells.some((c) => /Q'?ty/i.test(c))) {
      head = i;
      break;
    }
  }
  if (head < 0) throw new Error(`"${fileName}"에서 T&C 표 머리글을 찾지 못했습니다.`);

  const map: Partial<Record<string, number>> = {};
  (grid[head] ?? []).forEach((c, idx) => {
    const s = flat(c);
    if (!s) return;
    const hit = LBL.find(([, re]) => re.test(s));
    if (hit && map[hit[0]] === undefined) map[hit[0]] = idx;
  });

  const at = (r: unknown[], k: string) => (map[k] === undefined ? null : r[map[k]!]);
  const rows: TcImportRow[] = [];
  for (let i = head + 1; i < grid.length; i += 1) {
    const r = grid[i] ?? [];
    const equip = str(at(r, "equip"));
    const item = str(at(r, "item"));
    if (!equip && !item) continue;
    if (/^total$/i.test(equip ?? "") || /^sub\s*total$/i.test(equip ?? "")) continue;
    const rawB = str(at(r, "bldg"));
    rows.push({
      row_no: numV(at(r, "row_no")),
      bldg: normBldg(rawB),
      bldg_raw: rawB,
      grp: str(at(r, "grp")),
      item,
      equip,
      qty: numV(at(r, "qty")) ?? 0,
      supplier: str(at(r, "supplier")),
      t0_p: iso(at(r, "t0_p")), t0_a: iso(at(r, "t0_a")), t0_d: numV(at(r, "t0_d")), t0_rem: numV(at(r, "t0_rem")),
      t1_p: iso(at(r, "t1_p")), t1_a: iso(at(r, "t1_a")), t1_d: numV(at(r, "t1_d")), t1_rem: numV(at(r, "t1_rem")),
      rp_p: iso(at(r, "rp_p")), rp_a: iso(at(r, "rp_a")), rp_d: numV(at(r, "rp_d")), rp_rem: numV(at(r, "rp_rem")),
      rfi_p: iso(at(r, "rfi_p")), rfi_a: iso(at(r, "rfi_a")), rfi_d: numV(at(r, "rfi_d")), rfi_rem: numV(at(r, "rfi_rem")),
      t2_p: iso(at(r, "t2_p")), t2_a: iso(at(r, "t2_a")),
      resp_p: iso(at(r, "resp_p")), resp_a: iso(at(r, "resp_a")),
      status: normStatus(at(r, "status")),
      docref: str(at(r, "docref")),
    });
  }
  if (!rows.length) throw new Error(`"${fileName}"에서 읽을 수 있는 T&C 데이터가 없습니다.`);
  return rows;
}

/** 파일명에서 공종 · 기준일 · Rev 인식 (예: TC_Mech_260905_R1.xlsx) */
export function metaFromFileName(fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, "");
  const disc = /mech|기계/i.test(base) ? "Mech" : /elec|전기/i.test(base) ? "Elec" : /arch|건축/i.test(base) ? "Arch" : /int|내장/i.test(base) ? "Int" : /permit|인허가/i.test(base) ? "Permit" : null;
  const d6 = base.match(/(?:^|[_\-\s])(\d{2})(\d{2})(\d{2})(?:[_\-\s]|$)/);
  const d8 = base.match(/(20\d{2})[-._]?(\d{2})[-._]?(\d{2})/);
  const date = d8 ? `${d8[1]}-${d8[2]}-${d8[3]}` : d6 ? `20${d6[1]}-${d6[2]}-${d6[3]}` : null;
  const rev = base.match(/[_\-\s]R(?:ev)?\.?\s*(\d+)/i);
  return { disc, date, rev: rev ? Number(rev[1]) : null };
}
