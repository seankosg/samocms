import { bandOf, flat, isDone, isLate, refList, stOf, type Row } from "./schedule-model";

export type NetNode = {
  id: string;
  band: number;
  nm: string;
  sub: string;
  s: string | null;
  e: string | null;
  pl: number | null;
  pc: number | null;
  st: string;
  late: boolean;
  lateN: number;
  cnt: number;
  done: number;
  roll?: boolean;
  grp?: boolean;
  mile?: boolean;
  ms: string | null;
  dept?: string;
  depts?: string;
  bldg?: string | null;
  room?: string | null;
  subc?: string | null;
  scope?: string | null;
  rmk?: string | null;
  predRaw?: string | null;
  succRaw?: string | null;
  pred: { id: string; ty: string }[];
  gb?: string;
  grm?: string;
  rowIds: number[];
  /* layout */
  _w?: number;
  _t?: number;
  _x?: number;
  _y?: number;
  _bx?: number;
};
export type NetEdge = { a: string; b: string; ty: string };
export type NetMode = "net" | "group";
export type NetFilter = { band: string; dept: string; bldg: string; ms: string; late: boolean };

const dnum = (d: string) => Date.parse(`${d}T00:00:00Z`);
const days = (a: string, b: string) => Math.round((dnum(b) - dnum(a)) / 864e5);
const minD = (a: (string | null)[]) => a.filter(Boolean).sort()[0] ?? null;
const maxD = (a: (string | null)[]) => a.filter(Boolean).sort().slice(-1)[0] ?? null;

/** 네트워크 보기 — 건설은 마일스톤 롤업, 인허가·생산설비는 개별 활동 */
export function netNodes(rows: Row[]): NetNode[] {
  const N: NetNode[] = [];
  const con = rows.filter((r) => bandOf(r) === 0);
  const g = new Map<string, Row[]>();
  con.forEach((r) => {
    const k = r.ms ?? "미분류";
    if (!g.has(k)) g.set(k, []);
    g.get(k)!.push(r);
  });
  [...g.entries()].sort((x, y) => x[0].localeCompare(y[0])).forEach(([k, a]) => {
    const w = a.filter((r) => r.pl != null || r.pc != null);
    const pc = w.length ? w.reduce((x, r) => x + (r.pc ?? 0), 0) / w.length : null;
    const pl = w.length ? w.reduce((x, r) => x + (r.pl ?? 0), 0) / w.length : null;
    const lateN = a.filter(isLate).length;
    const depts = [...new Set(a.map((r) => r.dept))].join("/");
    N.push({
      id: `C:${k}`, band: 0, nm: `건설 ${k}`, sub: `${a.length}건 · ${depts}`,
      s: minD(a.map((r) => r.s)), e: maxD(a.map((r) => r.e)), pl, pc,
      st: stOf(pl, pc, lateN > 0), late: lateN > 0, lateN, cnt: a.length,
      done: a.filter(isDone).length, roll: true, ms: k, pred: [], depts,
      rowIds: a.map((r) => r.id),
    });
  });
  rows.filter((r) => bandOf(r) > 0).forEach((r) => {
    if (!r.no) return;
    const late = isLate(r);
    N.push({
      id: flat(r.no), band: bandOf(r), nm: flat(r.act), sub: flat(r.no), s: r.s, e: r.e,
      pl: r.pl, pc: r.pc, st: stOf(r.pl, r.pc, late), late, lateN: late ? 1 : 0,
      cnt: 1, done: isDone(r) ? 1 : 0, ms: r.ms, dept: r.dept, depts: r.dept,
      bldg: r.bldg, room: r.room, subc: r.sub, scope: r.scope,
      predRaw: r.pred, succRaw: r.succ, pred: refList(r.pred),
      mile: /^M\d+$/.test(String(r.no)), rowIds: [r.id],
    });
  });
  return N;
}

/** 건물 · 룸 보기 — 건물이 레인, Room이 노드 */
export function groupNodes(rows: Row[]) {
  const map = new Map<string, { b: string; rm: string; rows: Row[] }>();
  rows.forEach((r) => {
    const b = flat(r.bldg) || "(미지정)";
    const rm = flat(r.room) || "ALL";
    const k = `${b}\u0000${rm}`;
    if (!map.has(k)) map.set(k, { b, rm, rows: [] });
    map.get(k)!.rows.push(r);
  });
  const gs = [...map.values()];
  const bcnt = new Map<string, number>();
  gs.forEach((g) => bcnt.set(g.b, (bcnt.get(g.b) ?? 0) + g.rows.length));
  const lanes = [...bcnt.keys()].sort((x, y) => (bcnt.get(y)! - bcnt.get(x)!) || x.localeCompare(y, "ko"));
  const laneIx = new Map(lanes.map((b, i) => [b, i]));
  const N = gs.map((g) => {
    const dd = g.rows.filter((r) => r.e);
    let tot = 0, ap = 0, aa = 0;
    dd.forEach((r) => {
      const du = r.s && r.e ? Math.max(1, days(r.s, r.e) + 1) : 1;
      tot += du; ap += du * (r.pl ?? 0); aa += du * (r.pc ?? 0);
    });
    const pl = tot ? ap / tot : null, pc = tot ? aa / tot : null;
    const lateN = g.rows.filter(isLate).length;
    const depts = [...new Set(g.rows.map((r) => r.dept).filter(Boolean))].join("/");
    return {
      id: `G|${g.b}|${g.rm}`, band: laneIx.get(g.b)!, gb: g.b, grm: g.rm, grp: true,
      nm: g.rm === "ALL" ? "(건물 전체)" : g.rm, sub: depts,
      s: minD(g.rows.map((r) => r.s)), e: maxD(dd.map((r) => r.e)), pl, pc,
      st: stOf(pl, pc, lateN > 0), late: lateN > 0, lateN, cnt: g.rows.length,
      done: g.rows.filter(isDone).length, ms: null, depts, pred: [],
      bldg: g.b, room: g.rm, rowIds: g.rows.map((r) => r.id),
    } as NetNode;
  }).filter((n) => n.e);
  return { N, lanes };
}

export function buildModel(rows: Row[], mode: NetMode, bandDefs: { label: string; color: string }[]) {
  let N: NetNode[];
  let lanes: { label: string; color: string }[];
  if (mode === "group") {
    const g = groupNodes(rows);
    N = g.N;
    lanes = g.lanes.map((b) => ({ label: b, color: "#1f4e79" }));
  } else {
    N = netNodes(rows);
    lanes = bandDefs;
  }
  const byId = new Map<string, NetNode>();
  N.forEach((n) => byId.set(n.id, n));
  const edges: NetEdge[] = [];
  const miss: string[] = [];
  N.forEach((n) =>
    n.pred.forEach((p) => {
      if (byId.has(p.id)) edges.push({ a: p.id, b: n.id, ty: p.ty });
      else if (!/[가-힣]/.test(p.id)) miss.push(`${n.id} ← ${p.id}`);
    }),
  );
  return { N, lanes, edges, byId, miss: [...new Set(miss)] };
}

export function nodeVisible(n: NetNode, f: NetFilter, mode: NetMode) {
  if (mode === "net" && f.band !== "" && n.band !== Number(f.band)) return false;
  if (f.late && !n.late) return false;
  if (mode === "group") return !f.bldg || n.gb === f.bldg;
  if (f.dept && !(n.roll ? String(n.depts).includes(f.dept) : n.dept !== f.dept ? false : true)) return false;
  if (f.bldg && !n.roll && String(n.bldg) !== f.bldg) return false;
  if (f.ms && String(n.ms) !== f.ms) return false;
  return true;
}

export function chainOf(edges: NetEdge[], id: string) {
  const pm = new Map<string, string[]>(), sm = new Map<string, string[]>();
  edges.forEach((e) => {
    if (!sm.has(e.a)) sm.set(e.a, []);
    sm.get(e.a)!.push(e.b);
    if (!pm.has(e.b)) pm.set(e.b, []);
    pm.get(e.b)!.push(e.a);
  });
  const set = new Set([id]);
  const walk = (m: Map<string, string[]>) => {
    const q = [id];
    while (q.length) {
      const c = q.pop()!;
      (m.get(c) ?? []).forEach((p) => { if (!set.has(p)) { set.add(p); q.push(p); } });
    }
  };
  walk(pm); walk(sm);
  return set;
}

export const BH = 34;
const BG = 7;
export const AXH = 42;
const PADL = 124;
const PADR = 46;
const BASE_W = 1560;

const tw = (s: string, f: number) =>
  String(s).split("").reduce((a, c) => a + (c.charCodeAt(0) > 127 ? f : f * 0.56), 0);

/** 원본 HTML과 동일한 종료일 기준 배치 + 티어 패킹 */
export function layout(N: NetNode[], laneCount: number, zoom: number, fmt: (d: string | null) => string) {
  const nodes = N.filter((n) => n.e);
  const ds = nodes.map((n) => dnum(n.e!));
  const a0 = new Date((ds.length ? Math.min(...ds) : Date.now()) - 5 * 864e5);
  const a1 = new Date((ds.length ? Math.max(...ds) : Date.now()) + 7 * 864e5);
  const A0 = a0.toISOString().slice(0, 10), A1 = a1.toISOString().slice(0, 10);
  const W = Math.round(BASE_W * zoom);
  const PW = W - PADL - PADR;
  const SPAN = days(A0, A1) || 1;
  const PPD = PW / SPAN;
  const X = (d: string) => PADL + (PW * days(A0, d)) / SPAN;

  const rows: NetNode[][] = Array.from({ length: laneCount }, () => []);
  nodes.forEach((n) => rows[n.band]?.push(n));
  rows.forEach((a) => a.sort((x, y) => String(x.e).localeCompare(String(y.e))));

  const pack = (list: NetNode[]) => {
    const tiers: [number, number][][] = [];
    list.forEach((n) => {
      const w = Math.max(tw(n.nm, 10), tw(n.sub ?? "", 9), tw(fmt(n.e), 10.5)) + 20;
      n._w = w;
      const xe = X(n.e!);
      const a = Math.min(xe - w / 2, n.s ? X(n.s) : xe) - BG;
      const b = xe + w / 2 + BG;
      let i = 0;
      for (;;i++) {
        if (!tiers[i]) { tiers[i] = [[a, b]]; break; }
        if (tiers[i]!.every(([s, e]) => b <= s || a >= e)) { tiers[i]!.push([a, b]); break; }
      }
      n._t = i;
    });
    return tiers.length;
  };

  const tierN: number[] = [];
  const laneY: number[] = [];
  let y = 26;
  rows.forEach((list) => {
    const t = Math.max(1, pack(list));
    laneY.push(y);
    tierN.push(t);
    y += 42 + t * (BH + 18) + 20;
  });
  const TOT = y + 16;
  rows.forEach((list, i) => list.forEach((n) => {
    n._x = X(n.e!);
    n._y = laneY[i]! + 42 + n._t! * (BH + 18);
    n._bx = Math.min(Math.max(n._x - n._w! / 2, 4), W - PADR - n._w!);
  }));

  return { nodes, rows, laneY, tierN, W, H: TOT, X, PPD, A0, A1, PADL };
}

export const dayList = (A0: string, A1: string) => {
  const out: Date[] = [];
  for (let t = dnum(A0); t <= dnum(A1); t += 864e5) out.push(new Date(t));
  return out;
};
