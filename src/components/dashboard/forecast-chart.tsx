import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useProgressForecast } from "@/lib/use-project";
import { KPI_SLOTS, planAt, pct1, SLOT_LABEL, type Row } from "@/lib/schedule-model";

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

export function ForecastChart({ rows, base }: { rows: Row[]; base: string }) {
  const { data, isLoading } = useProgressForecast();
  const [tab, setTab] = useState<string>("ALL");
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    const series = data?.series ?? [];
    if (series.length === 0) return null;
    const sel = tab === "ALL" ? rows : rows.filter((r) => r.slot === tab);

    // 기록 이력 (선택 공종, 전체는 가중평균)
    const byDate = new Map<string, { p: number; a: number; n: number }>();
    for (const s of series) {
      if (tab !== "ALL" && s.disc !== tab) continue;
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

    const planEndRow = sel.reduce<string | null>((acc, r) => (r.e && (!acc || r.e > acc) ? r.e : acc), null);
    const planEnd = planEndRow ?? lastDate;

    const slope = slopeOf(hist);
    let forecastEnd: string | null = null;
    if (slope != null && slope > 1e-6 && lastActual < 0.999) {
      const days = Math.min(365, (1 - lastActual) / slope);
      forecastEnd = toDate(toTs(lastDate) + Math.ceil(days) * DAY);
    } else if (lastActual >= 0.999) {
      forecastEnd = lastDate;
    }

    const endDate = [planEnd, forecastEnd].filter((d): d is string => !!d).reduce((a, b) => (b > a ? b : a), lastDate);
    const days: string[] = [];
    for (let t = toTs(firstDate); t <= toTs(endDate); t += DAY) days.push(toDate(t));
    const planCurve = planCurveOf(sel, days);

    // 계획 완료일 = 계획 곡선이 처음 99.9% 도달하는 날
    const planDoneDate = days.find((d) => (planCurve.get(d) ?? 0) >= 0.999) ?? planEnd;

    // 예측 곡선 (마지막 기록 이후)
    const forecastCurve = new Map<string, number>();
    if (slope != null && slope > 1e-6) {
      for (const d of days) {
        if (d <= lastDate) continue;
        const v = lastActual + slope * ((toTs(d) - toTs(lastDate)) / DAY);
        forecastCurve.set(d, Math.min(1, v));
      }
    }

    const diffDays = forecastEnd ? Math.round((toTs(forecastEnd) - toTs(planDoneDate)) / DAY) : null;
    return { hist, days, planCurve, forecastCurve, slope, planDoneDate, forecastEnd, diffDays, lastDate, lastActual, itemCount: sel.length };
  }, [data, rows, tab]);

  // 공종별 요약 표 데이터
  const summary = useMemo(() => {
    const series = data?.series ?? [];
    return (["ALL", ...KPI_SLOTS] as string[]).map((disc) => {
      const byDate = new Map<string, { a: number; n: number }>();
      for (const s of series) {
        if (disc !== "ALL" && s.disc !== disc) continue;
        const cur = byDate.get(s.date) ?? { a: 0, n: 0 };
        cur.a += s.actual * s.count; cur.n += s.count;
        byDate.set(s.date, cur);
      }
      const hist: Hist[] = [...byDate.entries()].sort((x, y) => x[0].localeCompare(y[0]))
        .map(([date, v]) => ({ date, planned: 0, actual: v.a / v.n }));
      const sel = disc === "ALL" ? rows : rows.filter((r) => r.slot === disc);
      if (hist.length === 0 || sel.length === 0) return { disc, slope: null, forecastEnd: null, diffDays: null, planDone: null as string | null, actual: null as number | null };
      const last = hist[hist.length - 1]!;
      const slope = slopeOf(hist);
      let forecastEnd: string | null = null;
      if (slope != null && slope > 1e-6 && last.actual < 0.999) {
        forecastEnd = toDate(toTs(last.date) + Math.ceil(Math.min(365, (1 - last.actual) / slope)) * DAY);
      } else if (last.actual >= 0.999) forecastEnd = last.date;
      const end = sel.reduce<string | null>((acc, r) => (r.e && (!acc || r.e > acc) ? r.e : acc), null) ?? last.date;
      const days: string[] = [];
      for (let t = toTs(hist[0]!.date); t <= toTs(end); t += DAY) days.push(toDate(t));
      const pc = planCurveOf(sel, days);
      const planDone = days.find((d) => (pc.get(d) ?? 0) >= 0.999) ?? end;
      const diffDays = forecastEnd ? Math.round((toTs(forecastEnd) - toTs(planDone)) / DAY) : null;
      return { disc, slope, forecastEnd, diffDays, planDone, actual: last.actual };
    });
  }, [data, rows]);

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
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="text-xs font-bold text-muted-foreground">공종별 진행도 예측 (스냅샷 기록 기반)</p>
        <div className="ml-auto flex flex-wrap gap-1">
          {(["ALL", ...KPI_SLOTS] as string[]).map((d) => (
            <button
              key={d}
              onClick={() => { setTab(d); setHover(null); }}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${tab === d ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}
            >
              {d === "ALL" ? "전체" : (SLOT_LABEL[d] ?? d)}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">불러오는 중…</p>
      ) : !model || model.hist.length < 2 ? (
        <p className="text-xs text-muted-foreground">예측에 필요한 기록이 부족합니다. 스냅샷이 2일 이상 쌓이면 표시됩니다.</p>
      ) : (
        <>
          {/* 요약 수치 */}
          <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            <span>실적 <b className="text-primary">{pct1(model.lastActual)}%</b></span>
            <span>계획 <b>{pct1(model.planCurve.get(model.lastDate) ?? 0)}%</b></span>
            <span className={model.lastActual - (model.planCurve.get(model.lastDate) ?? 0) < 0 ? "font-bold text-destructive" : "font-bold text-chart-2"}>
              격차 {pct1(Math.abs(model.lastActual - (model.planCurve.get(model.lastDate) ?? 0)))}%p{model.lastActual - (model.planCurve.get(model.lastDate) ?? 0) < 0 ? " 지연" : " 선행"}
            </span>
            <span>최근 속도 <b>{model.slope != null ? `${(model.slope * 100).toFixed(1)}%p/일` : "—"}</b> (최근 {Math.min(14, model.hist.length)}개 기록)</span>
            {model.forecastEnd ? (
              <span>
                예측 완료 <b className="text-primary">{fmtD(model.forecastEnd)}</b>
                {" / "}계획 완료 <b>{fmtD(model.planDoneDate)}</b>
                {model.diffDays != null && model.diffDays !== 0 && (
                  <b className={model.diffDays > 0 ? "ml-1 text-destructive" : "ml-1 text-chart-2"}>
                    ({model.diffDays > 0 ? `${model.diffDays}일 지연` : `${Math.abs(model.diffDays)}일 선행`})
                  </b>
                )}
              </span>
            ) : (
              <span className="font-semibold text-destructive">현재 속도로는 완료 예측 불가</span>
            )}
          </div>

          {/* 범례 */}
          <div className="mb-1 flex flex-wrap gap-x-4 text-[11px] text-muted-foreground">
            <span><i className="mr-1 inline-block h-0.5 w-4 align-middle bg-primary" />실적</span>
            <span><i className="mr-1 inline-block h-0.5 w-4 border-t-2 border-dashed border-primary align-middle" />예측</span>
            <span><i className="mr-1 inline-block h-0.5 w-4 align-middle bg-muted-foreground" />계획</span>
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

              {/* 예측 완료일 마커 */}
              {model.forecastEnd && model.forecastEnd !== model.planDoneDate && (
                <g>
                  <line x1={xi(model.forecastEnd)} x2={xi(model.forecastEnd)} y1={padT} y2={H - padB} stroke="var(--primary)" strokeWidth={1.2} strokeDasharray="4 3" />
                  <text x={xi(model.forecastEnd)} y={padT - 8} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--primary)">예측완료 {fmtD(model.forecastEnd)}</text>
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

          {/* 공종별 요약 표 */}
          <table className="mt-3 w-full text-left text-xs">
            <thead className="border-b text-muted-foreground">
              <tr>
                <th className="py-1.5">공종</th>
                <th className="text-right">현재 실적</th>
                <th className="text-right">최근 속도</th>
                <th className="text-right">계획 완료</th>
                <th className="text-right">예측 완료</th>
                <th className="text-right">판정</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((s) => (
                <tr key={s.disc} className={`border-b border-border/60 ${s.disc === tab ? "bg-muted/50" : ""}`}>
                  <td className="py-1.5 font-semibold">
                    {s.disc === "ALL" ? "전체" : (
                      <Link to="/schedule" search={{ slot: s.disc } as never} className="cursor-pointer rounded underline-offset-2 hover:text-primary hover:underline">
                        {SLOT_LABEL[s.disc] ?? s.disc}
                      </Link>
                    )}
                  </td>
                  <td className="text-right">{s.actual == null ? "—" : `${pct1(s.actual)}%`}</td>
                  <td className="text-right">{s.slope == null ? "—" : `${(s.slope * 100).toFixed(1)}%p/일`}</td>
                  <td className="text-right">{s.planDone ? fmtD(s.planDone) : "—"}</td>
                  <td className="text-right font-semibold">{s.forecastEnd ? fmtD(s.forecastEnd) : "—"}</td>
                  <td className={`text-right font-bold ${s.diffDays == null || s.diffDays === 0 ? "text-muted-foreground" : s.diffDays > 0 ? "text-destructive" : "text-chart-2"}`}>
                    {s.diffDays == null ? "—" : s.diffDays === 0 ? "정상" : s.diffDays > 0 ? `${s.diffDays}일 지연` : `${Math.abs(s.diffDays)}일 선행`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
