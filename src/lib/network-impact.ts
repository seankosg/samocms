/**
 * 선행 영향(밀림) 계산
 * 선행이 끝나야 후행이 시작한다는 규칙으로 네트워크를 전진 계산해
 * 각 노드가 며칠 밀리는지(pushDays)와 그 원인 선행을 구합니다.
 */
import type { NetEdge, NetNode } from "./network-model";

const dnum = (d: string) => Date.parse(`${d}T00:00:00Z`);
const addDays = (d: string, n: number) => new Date(dnum(d) + n * 864e5).toISOString().slice(0, 10);
const diff = (a: string, b: string) => Math.round((dnum(b) - dnum(a)) / 864e5);

export type PushInfo = {
  /** 밀린 일수 */
  push: number;
  /** 밀림을 유발한 직접 선행 노드 id */
  cause: string | null;
  /** 발주처 업역에서 시작된 밀림인지 */
  fromOwner: boolean;
};

/**
 * 전진 패스로 밀림을 계산합니다. 완료된 노드는 밀리지 않습니다.
 * FS = 선행 종료 다음 날 착수, SS = 선행 착수일, FF = 선행 종료일 기준.
 */
export function computePush(N: NetNode[], edges: NetEdge[]): Map<string, PushInfo> {
  const byId = new Map(N.map((n) => [n.id, n]));
  const preds = new Map<string, NetEdge[]>();
  const succs = new Map<string, NetEdge[]>();
  const indeg = new Map<string, number>(N.map((n) => [n.id, 0]));
  edges.forEach((e) => {
    if (!byId.has(e.a) || !byId.has(e.b)) return;
    if (!preds.has(e.b)) preds.set(e.b, []);
    preds.get(e.b)!.push(e);
    if (!succs.has(e.a)) succs.set(e.a, []);
    succs.get(e.a)!.push(e);
    indeg.set(e.b, (indeg.get(e.b) ?? 0) + 1);
  });

  // 위상 정렬 (순환은 남은 노드를 뒤에 붙여 처리)
  const order: string[] = [];
  const q = [...indeg.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  const deg = new Map(indeg);
  while (q.length) {
    const id = q.shift()!;
    order.push(id);
    (succs.get(id) ?? []).forEach((e) => {
      const d = (deg.get(e.b) ?? 0) - 1;
      deg.set(e.b, d);
      if (d === 0) q.push(e.b);
    });
  }
  N.forEach((n) => { if (!order.includes(n.id)) order.push(n.id); });

  const out = new Map<string, PushInfo>();
  const pushOf = (id: string) => out.get(id)?.push ?? 0;

  order.forEach((id) => {
    const n = byId.get(id);
    if (!n) return;
    const done = n.pc != null && n.pc >= 0.995;
    let best = 0;
    let cause: string | null = null;
    let fromOwner = false;
    if (!done) {
      (preds.get(id) ?? []).forEach((e) => {
        const p = byId.get(e.a);
        if (!p) return;
        const pPush = pushOf(e.a);
        let need = 0;
        if (e.ty === "FF") {
          if (p.e && n.e) need = diff(n.e, addDays(p.e, pPush));
        } else if (e.ty === "SS") {
          if (p.s && n.s) need = diff(n.s, addDays(p.s, pPush));
        } else if (p.e && n.s) {
          need = diff(n.s, addDays(p.e, pPush + 1));
        }
        if (need > best) {
          best = need;
          cause = e.a;
          fromOwner = !!p.owner || (out.get(e.a)?.fromOwner ?? false);
        }
      });
    }
    if (best > 0 && cause) out.set(id, { push: best, cause, fromOwner });
  });

  return out;
}

/** 밀림 정보를 노드에 얹습니다 (원래 종료일 보관 후 종료일을 밀린 날짜로 교체). */
export function applyPush(N: NetNode[], push: Map<string, PushInfo>) {
  return N.map((n) => {
    const p = push.get(n.id);
    if (!p || !n.e) return n;
    return { ...n, _push: p.push, _origE: n.e, _cause: p.cause, e: addDays(n.e, p.push) };
  });
}

/** 발주처 변경이 당사 업역에 주는 영향 요약 */
export function ownerImpactSummary(N: NetNode[], push: Map<string, PushInfo>) {
  const byId = new Map(N.map((n) => [n.id, n]));
  let hdec = 0;
  let maxDays = 0;
  const ms = new Set<string>();
  push.forEach((p, id) => {
    const n = byId.get(id);
    if (!n || !p.fromOwner || n.owner) return;
    hdec += 1;
    maxDays = Math.max(maxDays, p.push);
    if (n.mile && n.ms) ms.add(n.ms);
    else if (n.ms) ms.add(n.ms);
  });
  return { hdec, maxDays, ms: [...ms].sort() };
}

/** 한 노드에서 시작되는 밀림 파급 경로 (후행 방향) */
export function pushChain(push: Map<string, PushInfo>, id: string) {
  const set = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    push.forEach((p, k) => {
      if (!set.has(k) && p.cause && set.has(p.cause)) { set.add(k); grew = true; }
    });
  }
  return set;
}
