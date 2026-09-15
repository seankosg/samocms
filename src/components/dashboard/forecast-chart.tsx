import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { TrendingDown, TrendingUp } from "lucide-react";
import { useProgressForecast } from "@/lib/use-project";
import { isOwnerRow, KPI_SLOTS, planAt, pct1, SLOT_LABEL, type Row } from "@/lib/schedule-model";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TcItem } from "@/lib/tc-model";
import {
  TC_FORECAST_STAGES, TC_F_STAGE_LABEL,
  buildTcForecast, buildTcForecastSummary,
  type TcForecastStage, type TcForecastModel,
} from "@/lib/tc-forecast";

const DAY = 864e5;
const toTs = (d: string) => Date.parse(d);
const toDate = (t: number) => new Date(t).toISOString().slice(0, 10);
const fmtD = (d: string) => d.slice(5).replace("-", ".");

type Hist = { date: string; planned: number; actual: number };

/** 최근 최대 14일치 실적에 최소자승 직선을 맞춰 하루당 증가율(fraction/day) 반환 */
function slopeOf(hist: Hist[]): number | null {
  const pts = hist.slice(-14);
  if (pts.length < 2) return null;
  const t0 = toTs(pts[0]!.date);
  const xs = pts.map((p) => (toTs(p.date) - t0) / DAY);
  const ys = pts.map((p) => p.actual);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0, den = 0;
  xs.forEach((x, i) => { num += (x - mx) * (ys[i]! - my); den += (x - mx) ** 2; });
  if (den === 0) return null;
  return num / den;
}

/** 선택 범위의 계획 곡선 (planAt 기준, 대시보드 계획값과 동일 로직) */
function planCurveOf(rows: Row[], dates: string[]): Map<string, number> {
  const m = new Map<string, number>();
  const dated = rows.filter((r) => r.s && r.e);
  for (const d of dates) {
    if (dated.length === 0) break;
    let sum = 0;
    for (const r of dated) sum += planAt(r, d) ?? 0;
    m.set(d, sum / dated.length);
  }
  return m;
}

type Mode = "discipline" | "milestone" | "tc";

export function ForecastChart({ rows, tcItems, base }: { rows: Row[]; tcItems: TcItem[]; base: string }) {
  const { data, isLoading } = useProgressForecast();
  const [mode, setMode] = useState<Mode>("discipline");
  const [tab, setTab] = useState<string>("ALL");
  const [milestone, setMilestone] = useState<string>("ALL");
  const [milestoneDisc, setMilestoneDisc] = useState<string>("ALL");
  const [tcStage, setTcStage] = useState<TcForecastStage | "ALL">("ALL");
  const [tcTeam, setTcTeam] = useState<"ALL" | "Mech" | "Elec">("ALL");
  const [tcBldg, setTcBldg] = useState<string>("ALL");
  const [hover, setHover] = useState<number | null>(null);

  // 인허가(Permit)는 예측 대상에서 제외 (목록·계산 모두)
  const FC_SLOTS = KPI_SLOTS.filter((s) => s !== "Permit");
  const eligibleRows = useMemo(() => rows.filter((r) => !isOwnerRow(r) && r.slot !== "Permit"), [rows]);
  const milestones = useMemo(() => {
    const values = new Set(eligibleRows.map((r) => r.ms ?? "미지정"));
    return [...values].sort((a, b) => {
      const an = /^M(\d+)$/.exec(a), bn = /^M(\d+)$/.exec(b);
      if (an && bn) return Number(an[1]) - Number(bn[1]);
      if (an) return -1;
      if (bn) return 1;
      return a.localeCompare(b, "ko");
    });
  }, [eligibleRows]);
  const milestoneDiscs = useMemo(() => {
    const scoped = milestone === "ALL" ? eligibleRows : eligibleRows.filter((r) => (r.ms ?? "미지정") === milestone);
    return KPI_SLOTS.filter((disc) => scoped.some((r) => r.slot === disc));
  }, [eligibleRows, milestone]);

  // T&C 예측: 팀 선택에 따라 건물 목록 갱신
  const tcBuildings = useMemo(() => {
    const scoped = tcTeam === "ALL" ? tcItems : tcItems.filter((r) => r.discipline === tcTeam);
    return [...new Set(scoped.map((r) => r.bldg ?? "(미지정)"))].sort((a, b) => a.localeCompare(b, "ko"));
  }, [tcItems, tcTeam]);

  const model = useMemo(() => {
    if (mode === "tc") {
      const m = buildTcForecast(tcItems, { stage: tcStage, team: tcTeam, bldg: tcBldg, base });
      if (!m) return null;
      // 팀 또는 건물이 「전체」이면 완료 전망은 하위 그룹(팀별/건물별) 예측 완료일 중 가장 늦은 날
      let forecastEndBy: string | null = null;
      if (!m.actualDoneDate && (tcTeam === "ALL" || tcBldg === "ALL")) {
        const srows = buildTcForecastSummary(tcItems, { stage: tcStage, team: tcTeam, base });
        const ends = srows.filter((r) => r.itemCount > 0 && r.forecastEnd).map((r) => ({ key: r.label, end: r.forecastEnd! }));
        if (ends.length > 0) {
          const latest = ends.reduce((a, b) => (b.end > a.end ? b : a));
          m.forecastEnd = latest.end;
          m.diffDays = Math.round((toTs(latest.end) - toTs(m.planDoneDate)) / DAY);
          forecastEndBy = latest.key;
          // 가로축이 새 완료일보다 짧으면 연장 (계획 곡선은 완료 이후 100% 유지)
          const lastDay = m.days[m.days.length - 1]!;
          if (latest.end > lastDay) {
            for (let t = toTs(lastDay) + DAY; t <= toTs(latest.end); t += DAY) {
              const d = toDate(t);
              m.days.push(d);
              m.planCurve.set(d, 1);
            }
          }
        }
      }
      return { ...m, hmPlanDoneDate: null as string | null, forecastEndBy };
    }
    const series = data?.series ?? [];
    if (series.length === 0) return null;
    const baseRows = eligibleRows; // 발주처(현대자동차) 담당 항목 제외
    const sel = mode === "discipline"
      ? (tab === "ALL" ? baseRows : baseRows.filter((r) => r.slot === tab))
      : baseRows.filter((r) => (milestone === "ALL" || (r.ms ?? "미지정") === milestone) && (milestoneDisc === "ALL" || r.slot === milestoneDisc));

    // 기록 이력 (선택 공종, 전체는 가중평균)
    const byDate = new Map<string, { p: number; a: number; n: number }>();
    for (const s of series) {
      if (s.disc === "Permit") continue; // 인허가 제외
      if (mode === "discipline" && tab !== "ALL" && s.disc !== tab) continue;
      if (mode === "milestone" && milestone !== "ALL" && s.ms !== milestone) continue;
      if (mode === "milestone" && milestoneDisc !== "ALL" && s.disc !== milestoneDisc) continue;
      const cur = byDate.get(s.date) ?? { p: 0, a: 0, n: 0 };
      cur.p += s.planned * s.count; cur.a += s.actual * s.count; cur.n += s.count;
      byDate.set(s.date, cur);
    }
    const hist: Hist[] = [...byDate.entries()].sort((x, y) => x[0].localeCompare(y[0]))
      .map(([date, v]) => ({ date, planned: v.p / v.n, actual: v.a / v.n }));
    if (hist.length === 0) return null;

    const firstDate = hist[0]!.date;
    const lastDate = hist[hist.length - 1]!.date;
    const lastActual = hist[hist.length - 1]!.actual;

    // 실적 최초 100% 도달일 — 도달 후에는 예측을 중단하고 완료일을 고정
    const actualDoneDate = hist.find((h) => h.actual >= 0.999)?.date ?? null;

    const planEndRow = sel.reduce<string | null>((acc, r) => (r.e && (!acc || r.e > acc) ? r.e : acc), null);
    const planEnd = planEndRow ?? lastDate;

    const slope = slopeOf(hist);
    let forecastEnd: string | null = null;
    if (!actualDoneDate && slope != null && slope > 1e-6 && lastActual < 0.999) {
      const days = Math.min(365, (1 - lastActual) / slope);
      forecastEnd = toDate(toTs(lastDate) + Math.ceil(days) * DAY);
    } else if (actualDoneDate) {
      forecastEnd = actualDoneDate;
    }

    // 전체 보기: 완료 전망은 하위 공종별 예측 완료일 중 가장 늦은 날 (평균 속도가 느린 공종을 과소평가하는 것 방지)
    let forecastEndBy: string | null = null;
    const groupSlots: string[] | null =
      mode === "discipline" && tab === "ALL" ? [...FC_SLOTS]
      : mode === "milestone" && milestoneDisc === "ALL"
        ? FC_SLOTS.filter((disc) => series.some((s) => s.disc === disc && (milestone === "ALL" || s.ms === milestone)))
        : null;
    if (groupSlots && !actualDoneDate) {
      const ends: { slot: string; end: string }[] = [];
      for (const slot of groupSlots) {
        const bd = new Map<string, { a: number; n: number }>();
        for (const s of series) {
          if (s.disc !== slot) continue;
          if (mode === "milestone" && milestone !== "ALL" && s.ms !== milestone) continue;
          const cur = bd.get(s.date) ?? { a: 0, n: 0 };
          cur.a += s.actual * s.count; cur.n += s.count;
          bd.set(s.date, cur);
        }
        const h: Hist[] = [...bd.entries()].sort((x, y) => x[0].localeCompare(y[0]))
          .map(([date, v]) => ({ date, planned: 0, actual: v.a / v.n }));
        if (h.length === 0) continue;
        const last = h[h.length - 1]!;
        const done = h.find((x) => x.actual >= 0.999)?.date ?? null;
        const sl = slopeOf(h);
        let end: string | null = null;
        if (done) end = done;
        else if (sl != null && sl > 1e-6 && last.actual < 0.999) {
          end = toDate(toTs(last.date) + Math.ceil(Math.min(365, (1 - last.actual) / sl)) * DAY);
        }
        if (end) ends.push({ slot, end });
      }
      if (ends.length > 0) {
        const latest = ends.reduce((a, b) => (b.end > a.end ? b : a));
        forecastEnd = latest.end;
        forecastEndBy = latest.slot;
      }
    }

    const endDate = [planEnd, forecastEnd].filter((d): d is string => !!d).reduce((a, b) => (b > a ? b : a), lastDate);
    const days: string[] = [];
    for (let t = toTs(firstDate); t <= toTs(endDate); t += DAY) days.push(toDate(t));
    const planCurve = planCurveOf(sel, days);

    // 계획 완료일 = 당사 담당 업무 중 가장 늦은 계획완료일
    const planDoneDate = planEnd;

    // 발주처(HM) 항목의 계획 완료일 — 집계에서는 제외하되 참조용 세로선으로 표시
    const hmRows = rows.filter((r) => isOwnerRow(r) && r.s && r.e);
    const hmPlanEnd = hmRows.reduce<string | null>((acc, r) => (r.e && (!acc || r.e > acc) ? r.e : acc), null);
    const hmPlanDoneDate = hmPlanEnd ? (days.find((d) => (planCurveOf(hmRows, days).get(d) ?? 0) >= 0.999) ?? hmPlanEnd) : null;

    // 예측 곡선 (마지막 기록 이후) — 완료 확정 시 생성하지 않음
    const forecastCurve = new Map<string, number>();
    if (!actualDoneDate && slope != null && slope > 1e-6) {
      for (const d of days) {
        if (d <= lastDate) continue;
        const v = lastActual + slope * ((toTs(d) - toTs(lastDate)) / DAY);
        forecastCurve.set(d, Math.min(1, v));
      }
    }

    const diffDays = forecastEnd ? Math.round((toTs(forecastEnd) - toTs(planDoneDate)) / DAY) : null;
    return { hist, days, planCurve, forecastCurve, slope, planDoneDate, hmPlanDoneDate, forecastEnd, forecastEndBy, actualDoneDate, diffDays, lastDate, lastActual, itemCount: sel.length };
  }, [data, eligibleRows, milestone, milestoneDisc, mode, rows, tab, tcItems, tcStage, tcTeam, tcBldg, base]);

  // 공종별 요약 표 데이터
  const summary = useMemo(() => {
    if (mode === "tc") {
      const rows = buildTcForecastSummary(tcItems, { stage: tcStage, team: tcTeam, base });
      return rows.map((r) => ({
        disc: r.key,
        slope: r.slope,
        forecastEnd: r.forecastEnd,
        actualDone: r.actualDoneDate,
        diffDays: r.diffDays,
        planDone: r.planDone,
        actual: r.actual,
      }));
    }
    const series = data?.series ?? [];
    const summaryDiscs = mode === "milestone" ? (["ALL", ...milestoneDiscs] as string[]) : (["ALL", ...FC_SLOTS] as string[]);
    return summaryDiscs.map((disc) => {
      const byDate = new Map<string, { a: number; n: number }>();
      for (const s of series) {
        if (s.disc === "Permit") continue; // 인허가 제외
        if (disc !== "ALL" && s.disc !== disc) continue;
        if (mode === "milestone" && milestone !== "ALL" && s.ms !== milestone) continue;
        const cur = byDate.get(s.date) ?? { a: 0, n: 0 };
        cur.a += s.actual * s.count; cur.n += s.count;
        byDate.set(s.date, cur);
      }
      const hist: Hist[] = [...byDate.entries()].sort((x, y) => x[0].localeCompare(y[0]))
        .map(([date, v]) => ({ date, planned: 0, actual: v.a / v.n }));
      const scopedRows = mode === "milestone"
        ? eligibleRows.filter((r) => milestone === "ALL" || (r.ms ?? "미지정") === milestone)
        : eligibleRows;
      const sel = disc === "ALL" ? scopedRows : scopedRows.filter((r) => r.slot === disc);
      if (hist.length === 0 || sel.length === 0) return { disc, slope: null, forecastEnd: null, actualDone: null, diffDays: null, planDone: null as string | null, actual: null as number | null };
      const last = hist[hist.length - 1]!;
      const slope = slopeOf(hist);
      // 실적 최초 100% 도달일 — 도달 시 예측 완료일을 실제 완료일로 고정
      const actualDone = hist.find((h) => h.actual >= 0.999)?.date ?? null;
      let forecastEnd: string | null = null;
      if (!actualDone && slope != null && slope > 1e-6 && last.actual < 0.999) {
        forecastEnd = toDate(toTs(last.date) + Math.ceil(Math.min(365, (1 - last.actual) / slope)) * DAY);
      } else if (actualDone) forecastEnd = actualDone;
      const end = sel.reduce<string | null>((acc, r) => (r.e && (!acc || r.e > acc) ? r.e : acc), null) ?? last.date;
      const days: string[] = [];
      for (let t = toTs(hist[0]!.date); t <= toTs(end); t += DAY) days.push(toDate(t));
      const planDone = end;
      const diffDays = forecastEnd ? Math.round((toTs(forecastEnd) - toTs(planDone)) / DAY) : null;
      return { disc, slope, forecastEnd, actualDone, diffDays, planDone, actual: last.actual };
    });
  }, [data, eligibleRows, milestone, milestoneDiscs, mode, tcItems, tcStage, tcTeam, base]);

  const W = 960, H = 260;
  const padL = 40, padR = 14, padT = 26, padB = 26;
  const iw = W - padL - padR, ih = H - padT - padB;

  const xi = (d: string) => model ? padL + (iw * (toTs(d) - toTs(model.days[0]!))) / Math.max(1, (model.days.length - 1) * DAY) : 0;
  const yi = (v: number) => padT + ih * (1 - v);

  const pt = (d: string, v: number) => `${xi(d).toFixed(1)},${yi(v).toFixed(1)}`;
  const actualPts = model?.hist.map((h) => pt(h.date, h.actual)).join(" ") ?? "";
  const planPts = model?.days.map((d) => pt(d, model.planCurve.get(d) ?? 0)).join(" ") ?? "";
  const fcDays = model ? [...model.forecastCurve.keys()].sort() : [];
  const fcPts = model && fcDays.length > 0
    ? [pt(model.lastDate, model.lastActual), ...fcDays.map((d) => pt(d, model.forecastCurve.get(d) ?? 0))].join(" ")
    : "";

  // 미래 구간 계획↔예측 사이 음영
  const shadePts = (() => {
    if (!model || fcDays.length === 0) return "";
    const top = fcDays.map((d) => pt(d, model.forecastCurve.get(d) ?? 0));
    const bot = [...fcDays].reverse().map((d) => pt(d, model.planCurve.get(d) ?? 0));
    return `${xi(model.lastDate)},${yi(model.lastActual)} ` + [...top, ...bot].join(" ");
  })();

  const behind = model?.forecastEnd && model?.diffDays != null ? model.diffDays > 0 : model ? (model.lastActual < (model.planCurve.get(model.lastDate) ?? 0)) : false;

  const hoverInfo = hover != null && model ? (() => {
    const d = model.days[hover]!;
    const plan = model.planCurve.get(d);
    const h = model.hist.find((x) => x.date === d);
    const fc = model.forecastCurve.get(d);
    return { d, plan, actual: h?.actual, fc };
  })() : null;

  return (
    <div className="min-w-0 rounded-md border border-border bg-card p-4 shadow-sm">
      <div className="mb-3">
        <Tabs value={mode} onValueChange={(value) => { setMode(value as Mode); setHover(null); }}>
          <TabsList className="h-9">
            <TabsTrigger value="discipline" className="px-4 text-xs">공종별 예측</TabsTrigger>
            <TabsTrigger value="milestone" className="px-4 text-xs">마일스톤별 예측</TabsTrigger>
            <TabsTrigger value="tc" className="px-4 text-xs">T&C 예측</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="text-xs font-bold text-muted-foreground">
          {mode === "discipline" ? "공종별 진행도 예측" : mode === "milestone" ? "마일스톤별 진행도 예측" : "T&C 진행도 예측"}
          {mode === "tc" ? " (단계별 계획/실적일 기반)" : " (스냅샷 기록 기반)"}
        </p>
        {mode !== "tc" && (
          <div className="ml-auto flex flex-wrap gap-1">
            {(mode === "discipline" ? (["ALL", ...FC_SLOTS] as string[]) : (["ALL", ...milestones] as string[])).map((d) => {
              const active = mode === "discipline" ? tab === d : milestone === d;
              return (
                <button key={d} type="button" data-active={active} className="ui-filter h-7 cursor-pointer rounded-full px-2.5 text-[11px] transition-colors"
                  onClick={() => { if (mode === "discipline") setTab(d); else { setMilestone(d); setMilestoneDisc("ALL"); } setHover(null); }}>
                  {d === "ALL" ? "전체" : (mode === "discipline" ? (SLOT_LABEL[d] ?? d) : d)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {mode === "milestone" && (
        <div className="mb-3 flex flex-wrap items-center gap-1 border-b border-border/60 pb-2">
          <span className="mr-1 text-[11px] font-semibold text-muted-foreground">공종</span>
          {(["ALL", ...milestoneDiscs] as string[]).map((disc) => (
            <button key={disc} type="button" data-active={milestoneDisc === disc} className="ui-filter h-7 cursor-pointer rounded-full px-2.5 text-[11px] transition-colors"
              onClick={() => { setMilestoneDisc(disc); setHover(null); }}>
              {disc === "ALL" ? "전체 공종" : (SLOT_LABEL[disc] ?? disc)}
            </button>
          ))}
        </div>
      )}

      {mode === "tc" && (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-1 border-b border-border/60 pb-2">
            <span className="mr-1 text-[11px] font-semibold text-muted-foreground">단계</span>
            {(["ALL", ...TC_FORECAST_STAGES] as const).map((st) => (
              <button key={st} type="button" data-active={tcStage === st} className="ui-filter h-7 cursor-pointer rounded-full px-2.5 text-[11px] transition-colors"
                onClick={() => { setTcStage(st); setTcBldg("ALL"); setHover(null); }}>
                {st === "ALL" ? "전체(4단계 합산)" : TC_F_STAGE_LABEL[st]}
              </button>
            ))}
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-1 border-b border-border/60 pb-2">
            <span className="mr-1 text-[11px] font-semibold text-muted-foreground">팀</span>
            {(["ALL", "Mech", "Elec"] as const).map((tm) => (
              <button key={tm} type="button" data-active={tcTeam === tm} className="ui-filter h-7 cursor-pointer rounded-full px-2.5 text-[11px] transition-colors"
                onClick={() => { setTcTeam(tm); setTcBldg("ALL"); setHover(null); }}>
                {tm === "ALL" ? "전체 팀" : tm === "Mech" ? "MECH" : "ELEC"}
              </button>
            ))}
            <span className="ml-2 mr-1 text-[11px] font-semibold text-muted-foreground">건물</span>
            <Select value={tcBldg} onValueChange={(v) => { setTcBldg(v); setHover(null); }}>
              <SelectTrigger data-active={tcBldg !== "ALL"} className="ui-filter h-7 w-[180px] rounded-full px-3 text-[11px]">
                <SelectValue placeholder="전체 건물" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="ALL" className="text-xs">전체 건물</SelectItem>
                {tcBuildings.map((b) => (
                  <SelectItem key={b} value={b} className="text-xs">{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {mode !== "tc" && isLoading ? (
        <p className="text-xs text-muted-foreground">불러오는 중…</p>
      ) : !model || model.hist.length < 2 ? (
        <p className="text-xs text-muted-foreground">예측에 필요한 기록이 부족합니다. {mode === "tc" ? "선택한 단계·팀·건물의 계획/실적일 데이터가 부족합니다." : "스냅샷이 2일 이상 쌓이면 표시됩니다."}</p>
      ) : (
        <>
          {/* 요약 지표 카드 */}
          {(() => {
            const planNow = model.planCurve.get(model.lastDate) ?? 0;
            const gap = model.lastActual - planNow;
            const late = gap < 0;
            const done = model.actualDoneDate;
            const doneDiff = done ? Math.round((toTs(done) - toTs(model.planDoneDate)) / DAY) : null;
            return (
              <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                <div className="rounded-lg border bg-card px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">실적</p>
                  <p className="text-lg font-bold leading-tight text-primary">{pct1(model.lastActual)}%</p>
                </div>
                <div className="rounded-lg border bg-card px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">계획</p>
                  <p className="text-lg font-bold leading-tight">{pct1(planNow)}%</p>
                </div>
                <div className={`rounded-lg border px-3 py-2 ${late ? "border-destructive/40 bg-destructive/10" : "border-chart-2/40 bg-chart-2/10"}`}>
                  <p className="text-[11px] text-muted-foreground">계획 대비</p>
                  <p className={`flex items-center gap-1 text-lg font-bold leading-tight ${late ? "text-destructive" : "text-chart-2"}`}>
                    {late ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
                    {late ? "−" : "+"}{pct1(Math.abs(gap))}%p
                  </p>
                  <span className={`mt-0.5 inline-block rounded-full px-1.5 py-px text-[10px] font-semibold ${late ? "bg-destructive/15 text-destructive" : "bg-chart-2/15 text-chart-2"}`}>
                    {late ? "지연" : "선행"}
                  </span>
                </div>
                {done ? (
                  <div className="rounded-lg border border-chart-2/40 bg-chart-2/10 px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">실제 완료일</p>
                    <p className="text-lg font-bold leading-tight text-chart-2">{fmtD(done)}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      계획 대비{" "}
                      {doneDiff == null || doneDiff === 0 ? "동일" : doneDiff > 0 ? <b className="text-destructive">{doneDiff}일 지연</b> : <b className="text-chart-2">{Math.abs(doneDiff)}일 선행</b>}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border bg-card px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">최근 속도</p>
                    <p className="text-lg font-bold leading-tight">{model.slope != null ? `${(model.slope * 100).toFixed(1)}%p/일` : "—"}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">최근 {Math.min(14, model.hist.length)}개 기록</p>
                  </div>
                )}
                <div className="col-span-2 rounded-lg border bg-card px-3 py-2 sm:col-span-1">
                  <p className="text-[11px] text-muted-foreground">{done ? "완료 확정" : "완료 전망"}</p>
                  {done ? (
                    <>
                      <p className="text-lg font-bold leading-tight text-chart-2">{fmtD(done)}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        예측 완료 {model.forecastEnd ? fmtD(model.forecastEnd) : "—"} · 계획 완료 {fmtD(model.planDoneDate)}
                      </p>
                    </>
                  ) : model.forecastEnd ? (
                    <>
                      <p className="text-lg font-bold leading-tight text-primary">{fmtD(model.forecastEnd)}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        계획 완료 {fmtD(model.planDoneDate)}
                        {model.diffDays != null && model.diffDays !== 0 && (
                          <b className={model.diffDays > 0 ? "ml-1 text-destructive" : "ml-1 text-chart-2"}>
                            · {model.diffDays > 0 ? `${model.diffDays}일 지연` : `${Math.abs(model.diffDays)}일 선행`}
                          </b>
                        )}
                      </p>
                      {model.forecastEndBy && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {mode === "tc" ? "팀·건물별 최종 완료일 기준" : "공종별 최종 완료일 기준"} · {SLOT_LABEL[model.forecastEndBy] ?? model.forecastEndBy}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-1 text-xs font-semibold text-destructive">현재 속도로는 완료 예측 불가</p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 범례 */}
          <div className="mb-1 flex flex-wrap gap-x-4 text-[11px] text-muted-foreground">
            <span><i className="mr-1 inline-block h-0.5 w-4 align-middle bg-primary" />실적</span>
            {!model.actualDoneDate && (
              <span><i className="mr-1 inline-block h-0.5 w-4 border-t-2 border-dashed border-primary align-middle" />예측</span>
            )}
            <span><i className="mr-1 inline-block h-0.5 w-4 align-middle bg-muted-foreground" />계획</span>
            {model.actualDoneDate && (
              <span><i className="mr-1 inline-block h-0.5 w-4 align-middle bg-chart-2" />실제 완료</span>
            )}
          </div>

          <div className="overflow-x-auto">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="h-[220px] w-full min-w-[640px] lg:h-[260px]"
              onMouseMove={(e) => {
                const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
                const px = ((e.clientX - rect.left) / rect.width) * W;
                const idx = Math.round(((px - padL) / iw) * (model.days.length - 1));
                setHover(Math.max(0, Math.min(model.days.length - 1, idx)));
              }}
              onMouseLeave={() => setHover(null)}
            >
              {/* 가로 격자선 (20% 간격) */}
              {[0, 0.2, 0.4, 0.6, 0.8, 1].map((v) => (
                <g key={v}>
                  <line x1={padL} x2={W - padR} y1={yi(v)} y2={yi(v)} stroke="var(--border)" strokeWidth={v === 0 ? 1 : 0.5} />
                  <text x={padL - 6} y={yi(v) + 3} textAnchor="end" fontSize={9} fill="var(--muted-foreground)">{Math.round(v * 100)}%</text>
                </g>
              ))}

              {/* 미래 음영 */}
              {shadePts && (
                <polygon
                  points={shadePts}
                  fill={behind ? "var(--destructive)" : "var(--chart-2)"}
                  opacity={0.12}
                />
              )}

              {/* 기준일(오늘) 선 */}
              {toTs(base) >= toTs(model.days[0]!) && toTs(base) <= toTs(model.days[model.days.length - 1]!) && (
                <g>
                  <line x1={xi(base)} x2={xi(base)} y1={padT} y2={H - padB} stroke="var(--foreground)" strokeWidth={1} strokeDasharray="2 3" opacity={0.5} />
                  <text x={xi(base)} y={padT - 8} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--foreground)">오늘 {fmtD(base)}</text>
                </g>
              )}

              {/* 계획 완료일 마커 */}
              <g>
                <line x1={xi(model.planDoneDate)} x2={xi(model.planDoneDate)} y1={padT} y2={H - padB} stroke="var(--muted-foreground)" strokeWidth={1.2} />
                <text x={xi(model.planDoneDate)} y={H - padB + 12} textAnchor="middle" fontSize={9} fill="var(--muted-foreground)">계획완료 {fmtD(model.planDoneDate)}</text>
              </g>

              {/* 발주처(HM) 계획완료일 마커 — 집계 제외, 참조용 세로선 */}
              {model.hmPlanDoneDate && toTs(model.hmPlanDoneDate) >= toTs(model.days[0]!) && toTs(model.hmPlanDoneDate) <= toTs(model.days[model.days.length - 1]!) && (
                <g>
                  <line x1={xi(model.hmPlanDoneDate)} x2={xi(model.hmPlanDoneDate)} y1={padT} y2={H - padB} stroke="var(--chart-3)" strokeWidth={1.2} strokeDasharray="3 3" />
                  <text x={xi(model.hmPlanDoneDate)} y={H - padB + 24} textAnchor="middle" fontSize={9} fill="var(--chart-3)">발주처 계획완료 {fmtD(model.hmPlanDoneDate)}</text>
                </g>
              )}

              {/* 예측 완료일 마커 — 완료 확정 시에는 실제 완료일 마커로 대체 */}
              {model.forecastEnd && model.forecastEnd !== model.planDoneDate && !model.actualDoneDate && (
                <g>
                  <line x1={xi(model.forecastEnd)} x2={xi(model.forecastEnd)} y1={padT} y2={H - padB} stroke="var(--primary)" strokeWidth={1.2} strokeDasharray="4 3" />
                  <text x={xi(model.forecastEnd)} y={padT - 8} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--primary)">예측완료 {fmtD(model.forecastEnd)}</text>
                </g>
              )}

              {/* 실제 완료일 마커 (실적 100% 도달 시 고정) */}
              {model.actualDoneDate && (
                <g>
                  <line x1={xi(model.actualDoneDate)} x2={xi(model.actualDoneDate)} y1={padT} y2={H - padB} stroke="var(--chart-2)" strokeWidth={1.6} />
                  <text x={xi(model.actualDoneDate)} y={padT - 8} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--chart-2)">실제완료 {fmtD(model.actualDoneDate)}</text>
                </g>
              )}

              {/* 완료일 차이 배지 */}
              {model.forecastEnd && model.diffDays != null && model.diffDays !== 0 && (
                <g>
                  {(() => {
                    const bx = (xi(model.planDoneDate) + xi(model.forecastEnd)) / 2;
                    const late = model.diffDays > 0;
                    return (
                      <>
                        <rect x={bx - 30} y={padT + 6} width={60} height={15} rx={7.5} fill={late ? "var(--destructive)" : "var(--chart-2)"} opacity={0.9} />
                        <text x={bx} y={padT + 17} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--primary-foreground)">
                          {late ? `지연 ${model.diffDays}일` : `선행 ${Math.abs(model.diffDays)}일`}
                        </text>
                      </>
                    );
                  })()}
                </g>
              )}

              {/* 계획 곡선 */}
              <polyline points={planPts} fill="none" stroke="var(--muted-foreground)" strokeWidth={1.6} />
              {/* 실적 곡선 */}
              <polyline points={actualPts} fill="none" stroke="var(--primary)" strokeWidth={2.2} strokeLinejoin="round" />
              {/* 예측 곡선 */}
              {fcPts && <polyline points={fcPts} fill="none" stroke="var(--primary)" strokeWidth={1.8} strokeDasharray="5 4" opacity={0.8} />}

              {/* X축 날짜 라벨 (자동 솎아냄) */}
              {model.days.map((d, i) => {
                const step = Math.ceil(model.days.length / 12);
                if (i % step !== 0 && i !== model.days.length - 1) return null;
                return <text key={d} x={xi(d)} y={H - padB + 24} textAnchor="middle" fontSize={9} fill="var(--muted-foreground)">{fmtD(d)}</text>;
              })}

              {/* hover 안내선 + 툴팁 */}
              {hoverInfo && (
                <g>
                  <line x1={xi(hoverInfo.d)} x2={xi(hoverInfo.d)} y1={padT} y2={H - padB} stroke="var(--foreground)" strokeWidth={0.6} opacity={0.4} />
                  <circle cx={xi(hoverInfo.d)} cy={yi(hoverInfo.plan ?? 0)} r={3} fill="var(--muted-foreground)" />
                  {hoverInfo.actual != null && <circle cx={xi(hoverInfo.d)} cy={yi(hoverInfo.actual)} r={3.4} fill="var(--primary)" />}
                  {hoverInfo.fc != null && <circle cx={xi(hoverInfo.d)} cy={yi(hoverInfo.fc)} r={3} fill="var(--primary)" opacity={0.7} />}
                  <g transform={`translate(${Math.min(W - 132, xi(hoverInfo.d) + 8)}, ${padT + 26})`}>
                    <rect width={126} height={hoverInfo.fc != null ? 52 : 40} rx={4} fill="var(--popover)" stroke="var(--border)" />
                    <text x={6} y={13} fontSize={9} fontWeight={700} fill="var(--foreground)">{hoverInfo.d}</text>
                    <text x={6} y={25} fontSize={9} fill="var(--muted-foreground)">계획 {pct1(hoverInfo.plan ?? 0)}%</text>
                    <text x={66} y={25} fontSize={9} fontWeight={700} fill="var(--primary)">
                      {hoverInfo.actual != null ? `실적 ${pct1(hoverInfo.actual)}%` : hoverInfo.fc != null ? `예측 ${pct1(hoverInfo.fc)}%` : ""}
                    </text>
                    {hoverInfo.fc != null && hoverInfo.actual != null && (
                      <text x={6} y={37} fontSize={9} fill="var(--primary)">예측 {pct1(hoverInfo.fc)}%</text>
                    )}
                    {hoverInfo.actual != null && hoverInfo.plan != null && (
                      <text x={6} y={hoverInfo.fc != null ? 49 : 37} fontSize={9} fontWeight={700} fill={hoverInfo.actual - hoverInfo.plan < 0 ? "var(--destructive)" : "var(--chart-2)"}>
                        차이 {(hoverInfo.actual - hoverInfo.plan >= 0 ? "+" : "-")}{pct1(Math.abs(hoverInfo.actual - hoverInfo.plan))}%p
                      </text>
                    )}
                  </g>
                </g>
              )}
            </svg>
          </div>

          {/* 선택 범위의 요약 표 */}
          <table className="mt-3 w-full text-left text-xs">
            <thead className="border-b text-muted-foreground">
              <tr>
                <th className="py-1.5">{mode === "tc" ? (tcTeam === "ALL" ? "팀" : "건물") : "공종"}</th>
                <th className="text-right">현재 실적</th>
                <th className="text-right">최근 속도</th>
                <th className="text-right">계획 완료</th>
                <th className="text-right">실제 완료</th>
                <th className="text-right">예측 완료</th>
                <th className="text-right">판정</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                // 「전체」 행의 예측 완료일은 하위 항목 중 가장 늦은 날로 통일 (카드와 동일 기준)
                const latestSubEnd = summary
                  .filter((s) => s.disc !== "ALL" && s.forecastEnd)
                  .reduce<string | null>((acc, s) => (!acc || s.forecastEnd! > acc ? s.forecastEnd! : acc), null);
                return summary.map((s) => {
                const isAll = s.disc === "ALL";
                const dispForecastEnd = isAll && !s.actualDone && latestSubEnd ? latestSubEnd : s.forecastEnd;
                const dispDiffDays = isAll && !s.actualDone && latestSubEnd && s.planDone
                  ? Math.round((toTs(latestSubEnd) - toTs(s.planDone)) / DAY)
                  : s.diffDays;
                const isActive = mode === "discipline" ? s.disc === tab : mode === "milestone" ? s.disc === milestoneDisc : s.disc === tcBldg || (tcTeam === "ALL" && s.disc === tcTeam);
                const label = mode === "tc"
                  ? (s.disc === "ALL" || s.disc === "Mech" || s.disc === "Elec" ? (s.disc === "Mech" ? "MECH" : s.disc === "Elec" ? "ELEC" : "전체") : s.disc)
                  : (s.disc === "ALL" ? (mode === "milestone" ? "전체 공종" : "전체") : (SLOT_LABEL[s.disc] ?? s.disc));
                const tcSearch = mode === "tc" ? ({
                  ...(tcStage !== "ALL" ? { stage: tcStage } : {}),
                  ...(s.disc === "Mech" || s.disc === "Elec"
                    ? { disc: s.disc }
                    : { disc: tcTeam, bldg: s.disc }),
                } as never) : null;
                return (
                  <tr key={s.disc} className={`border-b border-border/60 ${isAll ? "bg-muted font-bold" : isActive ? "bg-muted/50" : ""}`}>
                    <td className="py-1.5 font-semibold">
                      {mode === "tc" && tcSearch ? (
                        <Link to="/tc/list" search={tcSearch} className="cursor-pointer rounded underline-offset-2 hover:text-primary hover:underline">{label}</Link>
                      ) : (
                        <Link
                          to="/schedule"
                          search={{ ...(s.disc !== "ALL" ? { slot: s.disc } : {}), ...(mode === "milestone" && milestone !== "ALL" ? { ms: milestone } : {}) } as never}
                          className="cursor-pointer rounded underline-offset-2 hover:text-primary hover:underline"
                        >
                          {label}
                        </Link>
                      )}
                    </td>
                    <td className="text-right">{s.actual == null ? "—" : `${pct1(s.actual)}%`}</td>
                    <td className="text-right">{s.slope == null ? "—" : `${(s.slope * 100).toFixed(1)}%p/일`}</td>
                    <td className="text-right">{s.planDone ? fmtD(s.planDone) : "—"}</td>
                    <td className={`text-right font-semibold ${s.actualDone ? "text-chart-2" : ""}`}>{s.actualDone ? fmtD(s.actualDone) : "—"}</td>
                    <td className="text-right font-semibold">{s.actualDone ? "—" : dispForecastEnd ? fmtD(dispForecastEnd) : "—"}</td>
                    <td className={`text-right font-bold ${dispDiffDays == null || dispDiffDays === 0 ? "text-muted-foreground" : dispDiffDays > 0 ? "text-destructive" : "text-chart-2"}`}>
                      {dispDiffDays == null ? "—" : dispDiffDays === 0 ? "정상" : dispDiffDays > 0 ? `${dispDiffDays}일 지연` : `${Math.abs(dispDiffDays)}일 선행`}
                    </td>
                  </tr>
                );
              });})()}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
