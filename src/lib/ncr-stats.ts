import { PS_NUMS, SLOT_ORDER, planField, actualField, currentStage, isStartDelayed, type SlotKey, type NcrDates } from "@/lib/ncr-model";
import type { MatrixStat } from "@/lib/ncr-matrix-xlsx";

export const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** 임계치(일) 안에 계획일이 도래하지만 아직 실적이 없는 슬롯 */
const isUpcoming = (d: NcrDates, slot: SlotKey, asOf: string, limit: string) => {
  const planned = d[planField(slot)];
  if (!planned || d[actualField(slot)]) return false;
  return planned > asOf && planned <= limit;
};

/** 주어진 행 집합의 PS1~PS8 매트릭스 통계 (화면·엑셀 공통 기준) */
export function computeNcrStats(rows: NcrDates[], asOf: string, within: number) {
  const upLimit = addDays(asOf, Math.max(1, within));
  const stats: MatrixStat[] = PS_NUMS.map((n) => {
    const s = `ps${n}s` as SlotKey;
    const f = `ps${n}f` as SlotKey;
    let sPlan = 0, sAct = 0, fPlan = 0, fAct = 0, sDelay = 0, fDelay = 0, cur = 0, noPlan = 0, ongoing = 0, ongoingDelay = 0, upS = 0, upF = 0;
    for (const r of rows) {
      const d = r;
      if (!d[planField(s)] && !d[planField(f)]) noPlan += 1;
      if (d[planField(s)] && d[planField(s)]! <= asOf) sPlan += 1;
      if (d[actualField(s)]) sAct += 1;
      if (d[planField(f)] && d[planField(f)]! <= asOf) fPlan += 1;
      if (d[actualField(f)]) fAct += 1;
      if (isStartDelayed(d, s, asOf)) sDelay += 1;
      if (isStartDelayed(d, f, asOf)) fDelay += 1;
      if (d[actualField(s)] && !d[actualField(f)]) {
        ongoing += 1;
        const fp = d[planField(f)];
        if (fp && fp < asOf) ongoingDelay += 1;
      }
      if (isUpcoming(d, s, asOf, upLimit)) upS += 1;
      if (isUpcoming(d, f, asOf, upLimit)) upF += 1;
      const c = currentStage(d);
      if (c.startsWith(`PS${n}`)) cur += 1;
    }
    return { n, sPlan, sAct, fPlan, fAct, sDelay, fDelay, cur, noPlan, ongoing, ongoingDelay, upS, upF };
  });
  const closed = rows.filter((r) => currentStage(r) === "Closed").length;
  const noPlanTotal = rows.filter((d) => SLOT_ORDER.every((s) => !d[planField(s)])).length;
  return { stats, closed, noPlanTotal, total: rows.length };
}
