/** 대시보드 → 리스트 드릴다운용 URL 검색 파라미터 */
export type ListSearch = {
  dept?: string;
  bldg?: string;
  ms?: string;
  sub?: string;
  status?: string;
  /** 기준일 내 종료 예정만 보기 */
  duebyBase?: boolean;
  q?: string;
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);

export function validateListSearch(raw: Record<string, unknown>): ListSearch {
  const out: ListSearch = {};
  const dept = str(raw["dept"]); if (dept) out.dept = dept;
  const bldg = str(raw["bldg"]); if (bldg) out.bldg = bldg;
  const ms = str(raw["ms"]); if (ms) out.ms = ms;
  const sub = str(raw["sub"]); if (sub) out.sub = sub;
  const status = str(raw["status"]); if (status) out.status = status;
  const q = str(raw["q"]); if (q) out.q = q;
  if (raw["duebyBase"] === true || raw["duebyBase"] === "true") out.duebyBase = true;
  return out;
}

/** 검색 파라미터 → 테이블 초기 필터 */
export const toInitial = (s: ListSearch) => ({
  ...(s.dept ? { dept: s.dept } : {}),
  ...(s.bldg ? { bldg: s.bldg } : {}),
  ...(s.ms ? { ms: s.ms } : {}),
  ...(s.sub ? { sub: s.sub } : {}),
  ...(s.status ? { status: s.status } : {}),
  ...(s.q ? { q: s.q } : {}),
});

export const searchKey = (s: ListSearch) => JSON.stringify(s);

export type TcSearch = {
  disc?: string;
  only?: string;
  bldg?: string;
  item?: string;
  grp?: string;
  supplier?: string;
  /** 단계명 (T0·T1·Report·RFI·T2·Response) */
  stage?: string;
  /** done | remain | late | pass | fail */
  cell?: string;
  /** 날짜 드릴다운 (field=계획/실적 컬럼명) */
  field?: string;
  from?: string;
  to?: string;
};

export function validateTcSearch(raw: Record<string, unknown>): TcSearch {
  const out: TcSearch = {};
  const disc = str(raw["disc"]); if (disc) out.disc = disc;
  const only = str(raw["only"]); if (only) out.only = only;
  const bldg = str(raw["bldg"]); if (bldg) out.bldg = bldg;
  const item = str(raw["item"]); if (item) out.item = item;
  const grp = str(raw["grp"]); if (grp) out.grp = grp;
  const supplier = str(raw["supplier"]); if (supplier) out.supplier = supplier;
  const stage = str(raw["stage"]); if (stage) out.stage = stage;
  const cell = str(raw["cell"]); if (cell) out.cell = cell;
  const field = str(raw["field"]); if (field) out.field = field;
  const from = str(raw["from"]); if (from) out.from = from;
  const to = str(raw["to"]); if (to) out.to = to;
  return out;
}
