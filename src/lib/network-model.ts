import { bandOf, isLate, MSDEF, refList, SLOT_LABEL, stOf, type Row } from "./schedule-model";

export type NetNode = {
  id: string;
  label: string;
  sub: string;
  band: number;
  slot: string;
  bldg: string | null;
  ms: string | null;
  s: string | null;
  e: string | null;
  pl: number | null;
  pc: number | null;
  st: string;
  count: number;
  rowIds: number[];
  x?: number;
  y?: number;
  w?: number;
  lane?: number;
};
export type NetEdge = { from: string; to: string; ty: string };

export type NetOptions = {
  view: "net" | "bldg";
  bands: number[];
  depts: string[];
  ms: string | null;
  bldg: string | null;
  onlyLate: boolean;
};

const avg = (a: (number | null)[]) => {
  const v = a.filter((x): x is number => x != null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};
const minD = (a: (string | null)[]) => a.filter(Boolean).sort()[0] ?? null;
const maxD = (a: (string | null)[]) => a.filter(Boolean).sort().slice(-1)[0] ?? null;

function nodeOf(id: string, label: string, sub: string, band: number, group: Row[]): NetNode {
  const pl = avg(group.map((r) => r.pl));
  const pc = avg(group.map((r) => r.pc));
  const late = group.some(isLate);
  return {
    id,
    label,
    sub,
    band,
    slot: group[0]!.slot,
    bldg: group[0]!.bldg,
    ms: group[0]!.ms,
    s: minD(group.map((r) => r.s)),
    e: maxD(group.map((r) => r.e)),
    pl,
    pc,
    st: stOf(pl, pc, late),
    count: group.length,
    rowIds: group.map((r) => r.id),
  };
}

/** 원본 HTML의 네트워크 모델: 건설은 마일스톤 집계, 인허가·생산설비는 개별 활동 */
export function buildNetwork(rows: Row[], opt: NetOptions) {
  const kept = rows.filter((r) => {
    if (!opt.bands.includes(bandOf(r))) return false;
    if (opt.depts.length && !opt.depts.includes(r.dept)) return false;
    if (opt.ms && r.ms !== opt.ms) return false;
    if (opt.bldg && r.bldg !== opt.bldg) return false;
    if (opt.onlyLate && !isLate(r)) return false;
    return !!(r.e || r.s);
  });

  const nodes: NetNode[] = [];
  const byRowId = new Map<number, string>();
  const byNo = new Map<string, string>();

  const push = (id: string, label: string, sub: string, band: number, group: Row[]) => {
    const n = nodeOf(id, label, sub, band, group);
    nodes.push(n);
    group.forEach((r) => {
      byRowId.set(r.id, id);
      if (r.no) byNo.set(r.no, id);
    });
  };

  const groups = new Map<string, Row[]>();
  const addTo = (k: string, r: Row) => {
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  };

  kept.forEach((r) => {
    const band = bandOf(r);
    if (opt.view === "bldg") addTo(`B\u0000${r.bldg ?? "(미지정)"}\u0000${r.room ?? "-"}\u0000${band}`, r);
    else if (band === 0) addTo(`C\u0000${r.dept}\u0000${r.ms ?? "기타"}\u0000${r.bldg ?? "-"}`, r);
    else addTo(`A\u0000${r.id}`, r);
  });

  groups.forEach((group, key) => {
    const p = key.split("\u0000");
    if (p[0] === "B") push(key, `${p[1]} · ${p[2]}`, `${group.length}개 활동`, Number(p[3]), group);
    else if (p[0] === "C")
      push(key, `${SLOT_LABEL[p[1]!] ?? p[1]} · ${p[2]}`, `${p[3]} · ${group.length}개 활동`, 0, group);
    else {
      const r = group[0]!;
      push(key, r.act, [r.bldg, r.room, r.sub].filter(Boolean).join(" · ") || (r.ms ? MSDEF[r.ms] ?? r.ms : "-"), bandOf(r), group);
    }
  });

  const edges: NetEdge[] = [];
  const missing = new Set<string>();
  const seen = new Set<string>();
  kept.forEach((r) => {
    const to = byRowId.get(r.id)!;
    refList(r.pred).forEach((ref) => {
      const from = byNo.get(ref.id);
      if (!from) {
        missing.add(ref.id);
        return;
      }
      if (from === to) return;
      const k = `${from}>${to}`;
      if (seen.has(k)) return;
      seen.add(k);
      edges.push({ from, to, ty: ref.ty });
    });
  });

  return { nodes, edges, missing: [...missing] };
}

/** 선택 노드의 선행·후행 전체 체인 */
export function chainOf(id: string, edges: NetEdge[]) {
  const up = new Map<string, string[]>();
  const dn = new Map<string, string[]>();
  edges.forEach((e) => {
    (up.get(e.to) ?? up.set(e.to, []).get(e.to)!).push(e.from);
    (dn.get(e.from) ?? dn.set(e.from, []).get(e.from)!).push(e.to);
  });
  const walk = (m: Map<string, string[]>) => {
    const out = new Set<string>();
    const st = [id];
    while (st.length) {
      const c = st.pop()!;
      (m.get(c) ?? []).forEach((n) => {
        if (!out.has(n)) {
          out.add(n);
          st.push(n);
        }
      });
    }
    return out;
  };
  const nodes = new Set<string>([id, ...walk(up), ...walk(dn)]);
  return { nodes, edges: edges.filter((e) => nodes.has(e.from) && nodes.has(e.to)) };
}

export const NODE_W = 168;
export const NODE_H = 44;
const LANE_H = 62;
const BAND_PAD = 34;

/** 종료일 기준 시간축 배치 + 밴드별 레인 패킹 */
export function layout(nodes: NetNode[], zoom: number) {
  const dates = nodes.flatMap((n) => [n.s, n.e]).filter(Boolean) as string[];
  const min = dates.sort()[0] ?? "2026-09-01";
  const max = dates.slice(-1)[0] ?? "2026-12-31";
  const span = Math.max(1, (Date.parse(max) - Date.parse(min)) / 864e5);
  const pxPerDay = (1400 / span) * zoom;
  const xOf = (d: string) => 120 + ((Date.parse(d) - Date.parse(min)) / 864e5) * pxPerDay;

  const bandOrder = [...new Set(nodes.map((n) => n.band))].sort();
  let y = BAND_PAD;
  const bandTops: Record<number, { top: number; lanes: number }> = {};
  bandOrder.forEach((b) => {
    const list = nodes.filter((n) => n.band === b).sort((a, c) => String(a.e ?? a.s).localeCompare(String(c.e ?? c.s)));
    const laneEnd: number[] = [];
    list.forEach((n) => {
      const x = xOf(n.e ?? n.s ?? min);
      let lane = laneEnd.findIndex((end) => x > end + 12);
      if (lane < 0) {
        lane = laneEnd.length;
        laneEnd.push(0);
      }
      laneEnd[lane] = x + NODE_W;
      n.lane = lane;
      n.x = x;
      n.w = NODE_W;
      n.y = y + lane * LANE_H;
    });
    const lanes = Math.max(1, laneEnd.length);
    bandTops[b] = { top: y - 22, lanes };
    y += lanes * LANE_H + BAND_PAD;
  });

  const width = Math.max(1200, ...nodes.map((n) => (n.x ?? 0) + NODE_W + 80));
  return { width, height: y, min, max, xOf, bandTops, bandOrder, pxPerDay };
}
