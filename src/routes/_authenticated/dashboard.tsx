import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { projectQuery, useProgressHistory, useProject } from "@/lib/use-project";
import {
  avgOf, isDone, isLate, MSDEF, milestoneDates, pct1, SLOT_LABEL, KPI_SLOTS, fmtDate, dayDiff, type Row,
} from "@/lib/schedule-model";
import { stageProgress, tcPct, TC_DISC_LABEL, type TcStage } from "@/lib/tc-model";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [
    { title: "대시보드 | HMMME 통합 공정 관리" },
    { name: "description", content: "공정 계획 대비 실적, 지연 현황, 마일스톤과 MEP 시운전 진도를 한 화면에서 확인합니다." },
    { property: "og:title", content: "HMMME 통합 공정 대시보드" },
    { property: "og:description", content: "공종별 진도, 지연 리스크, M1~M8 마일스톤 현황." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(projectQuery),
  errorComponent: () => <div role="alert" className="p-8">대시보드 데이터를 불러오지 못했습니다.</div>,
  component: Dashboard,
});

const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "");
const gapCls = (v: number) => (v < 0 ? "text-destructive" : v > 0 ? "text-primary" : "text-muted-foreground");

function Dashboard() {
  const { rows, base, tcItems } = useProject();

  const m = useMemo(() => {
    const withP = rows.filter((r) => r.pl != null || r.pc != null);
    const late = withP.filter(isLate);
    const done = rows.filter(isDone);
    const msDates = milestoneDates(rows);
    const bySlot = KPI_SLOTS.map((s) => {
      const list = rows.filter((r) => r.slot === s || r.dept === s);
      const w = list.filter((r) => r.pl != null || r.pc != null);
      const plan = list.filter((r) => r.e && r.e <= base).length;
      const act = list.filter(isDone).length;
      return { slot: s, n: w.length, pl: avgOf(w, "pl"), pc: avgOf(w, "pc"), late: w.filter(isLate).length, total: list.length, plan, act, gap: act - plan };
    });
    const byMs = Object.keys(MSDEF).map((k) => {
      const list = rows.filter((r) => r.ms === k);
      const w = list.filter((r) => r.pl != null || r.pc != null);
      const due = msDates[k] ?? null;
      const plan = list.filter((r) => r.e && r.e <= base).length;
      const act = list.filter(isDone).length;
      return {
        key: k, name: MSDEF[k]!, due, total: list.length,
        pc: w.length ? avgOf(w, "pc") : null,
        late: list.filter(isLate).length,
        over: due ? list.filter((r) => r.e && r.e > due).length : 0,
        dd: due ? dayDiff(base, due) : null,
        plan, act, gap: act - plan,
      };
    });
    const byDept = KPI_SLOTS.map((s) => {
      const list = rows.filter((r) => r.slot === s);
      return { slot: s, n: list.length, pl: avgOf(list, "pl"), pc: avgOf(list, "pc"), late: list.filter(isLate).length };
    }).filter((d) => d.n);
    const rank = (key: (r: Row) => string | null) => {
      const g = new Map<string, { n: number; late: number; gap: number }>();
      rows.forEach((r) => {
        const k = key(r);
        if (!k) return;
        const o = g.get(k) ?? { n: 0, late: 0, gap: 0 };
        o.n += 1;
        if (isLate(r)) {
          o.late += 1;
          o.gap += (r.pl ?? 0) - (r.pc ?? 0);
        }
        g.set(k, o);
      });
      return [...g.entries()].map(([k, v]) => ({ k, ...v })).filter((x) => x.late).sort((a, b) => b.late - a.late).slice(0, 8);
    };
    return {
      total: rows.length, withP: withP.length, done: done.length, late: late.length,
      donePct: rows.length ? done.length / rows.length : 0,
      latePct: withP.length ? late.length / withP.length : 0,
      pl: avgOf(withP, "pl"), pc: avgOf(withP, "pc"),
      bySlot, byMs, byDept, bldg: rank((r) => r.bldg), sub: rank((r) => r.sub),
    };
  }, [rows, base]);

  const tcDisc = useMemo(() => {
    const keys = [...new Set(tcItems.map((i) => i.discipline))];
    return keys.map((k) => ({ key: k, label: TC_DISC_LABEL[k] ?? k.toUpperCase(), pr: stageProgress(tcItems.filter((i) => i.discipline === k), base) }));
  }, [tcItems, base]);

  const maxLate = Math.max(1, ...m.bySlot.map((s) => s.late));

  return (
    <AppShell title="대시보드" desc={`기준일 ${fmtDate(base)} · 전체 ${m.total.toLocaleString()}개 활동`}>
      <section className="grid gap-3 xl:grid-cols-3">
        <div className="grid gap-4 rounded-md border border-border bg-card p-4 shadow-sm sm:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="text-xs font-bold text-muted-foreground">총 활동</p>
            <p className="mt-1 text-3xl font-bold">
              <Drill to="/schedule">{m.total.toLocaleString()}</Drill><span className="ml-1 text-sm font-semibold text-muted-foreground">행</span>
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              완료 <Drill to="/schedule" search={{ status: "done" }} className="font-bold text-foreground">{m.done.toLocaleString()}</Drill>행 · <b className="text-foreground">{pct1(m.donePct)}%</b>
            </p>
            <Bar v={m.donePct} className="mt-3" />
          </div>
          <div className="border-t border-border pt-2 text-[11px] sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
            <div className="grid grid-cols-4 gap-1 pb-1 text-right text-muted-foreground">
              <span />{["계획", "실적", "차이"].map((h) => <span key={h}>{h}</span>)}
            </div>
            {m.bySlot.map((s) => (
              <div key={s.slot} className="grid grid-cols-4 gap-1 border-t border-border/60 py-1 text-right">
                <span className="text-left font-semibold"><Drill to="/schedule" search={{ dept: s.slot }}>{SLOT_LABEL[s.slot]}</Drill></span>
                <span><Drill to="/schedule" search={{ dept: s.slot, duebyBase: true }}>{s.plan}</Drill></span>
                <span className="font-bold"><Drill to="/schedule" search={{ dept: s.slot, status: "done" }}>{s.act}</Drill></span>
                <span className={`font-semibold ${gapCls(s.gap)}`}>{sign(s.gap)}{Math.abs(s.gap)}</span>
              </div>
            ))}
            <p className="mt-1 text-right text-[9px] text-muted-foreground">계획 = 기준일 내 완료 예정 · 실적 = 완료</p>
          </div>
        </div>

        <div className="grid gap-4 rounded-md border border-primary/30 bg-primary/5 p-4 shadow-sm sm:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="text-xs font-bold text-muted-foreground">계획 대비 실적</p>
            <p className="mt-1 flex flex-wrap items-baseline gap-1.5">
              <span className="text-3xl font-bold"><Drill to="/schedule">{pct1(m.pc)}%</Drill></span>
              <span className="text-sm text-muted-foreground">/ {pct1(m.pl)}%</span>
              <span className={`text-xs font-bold ${gapCls(m.pc - m.pl)}`}>{sign(m.pc - m.pl)}{pct1(Math.abs(m.pc - m.pl))}p</span>
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">평균 진도 · 대상 {m.withP.toLocaleString()}행</p>
            <Bar v={m.pc} marker={m.pl} className="mt-3" />
          </div>
          <div className="border-t border-border pt-2 text-[11px] sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
            <div className="grid grid-cols-4 gap-1 pb-1 text-right text-muted-foreground">
              <span />{["계획", "실적", "차이"].map((h) => <span key={h}>{h}</span>)}
            </div>
            {m.bySlot.map((s) => (
              <div key={s.slot} className="grid grid-cols-4 gap-1 border-t border-border/60 py-1 text-right">
                <span className="text-left font-semibold"><Drill to="/schedule" search={{ dept: s.slot }}>{SLOT_LABEL[s.slot]}</Drill></span>
                {s.n === 0 ? <><span className="text-muted-foreground">—</span><span className="text-muted-foreground">—</span><span className="text-muted-foreground">—</span></> : (
                  <>
                    <span><Drill to="/schedule" search={{ dept: s.slot }}>{pct1(s.pl)}</Drill></span>
                    <span className="font-bold"><Drill to="/schedule" search={{ dept: s.slot }}>{pct1(s.pc)}</Drill></span>
                    <span className={`font-semibold ${gapCls(s.pc - s.pl)}`}>{sign(s.pc - s.pl)}{pct1(Math.abs(s.pc - s.pl))}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 rounded-md border border-destructive/30 bg-destructive/5 p-4 shadow-sm sm:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="text-xs font-bold text-muted-foreground">지연</p>
            <p className="mt-1 text-3xl font-bold text-destructive">
              <Drill to="/delays">{m.late.toLocaleString()}</Drill><span className="ml-1 text-sm font-semibold text-muted-foreground">건</span>
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">대상 {m.withP.toLocaleString()}행 중 · <b className="text-foreground">{pct1(m.latePct)}%</b></p>
            <Bar v={m.latePct} tone="bad" className="mt-3" />
          </div>
          <div className="border-t border-border pt-2 text-[11px] sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
            <div className="grid grid-cols-[1fr_auto_60px] gap-2 pb-1 text-right text-muted-foreground"><span /><span>지연</span><span>비교</span></div>
            {m.bySlot.map((s) => (
              <div key={s.slot} className="grid grid-cols-[1fr_auto_60px] items-center gap-2 border-t border-border/60 py-1">
                <span className="font-semibold"><Drill to="/delays" search={{ dept: s.slot }}>{SLOT_LABEL[s.slot]}</Drill></span>
                <span className={`text-right font-bold ${s.late ? "text-destructive" : "text-muted-foreground"}`}>
                  <Drill to="/delays" search={{ dept: s.slot }}>{s.late}</Drill>
                </span>
                <span className="h-1.5 overflow-hidden rounded bg-muted"><span className="block h-full bg-destructive" style={{ width: `${(s.late / maxLate) * 100}%` }} /></span>
              </div>
            ))}
          </div>
        </div>

      </section>

      {tcDisc.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-bold">MEP T&amp;C 현황 <span className="ml-1 text-[11px] font-normal text-muted-foreground">MECH + ELEC 합계</span></h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {TC_CARDS.map((c) => <TcCard key={c.k} card={c} disc={tcDisc} />)}
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-bold">마일스톤 현황</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {m.byMs.map((x) => (
            <div key={x.key} className={`rounded-md border bg-card p-3 shadow-sm ${x.late ? "border-destructive/40" : "border-border"}`}>
              <div className="flex items-center justify-between">
                <strong className="text-sm">{x.key}</strong>
                <span className="text-[11px] text-muted-foreground">{fmtDate(x.due)}</span>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={x.name}>{x.name}</p>
              <Bar v={x.pc ?? 0} className="mt-2" />
              <div className="mt-1.5 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                <span>총 <Drill to="/schedule" search={{ ms: x.key }}>{x.total}</Drill>건</span>
                <span>평균 {x.pc == null ? "—" : `${pct1(x.pc)}%`}</span>
                <span className={x.late ? "font-bold text-destructive" : ""}>지연 <Drill to="/delays" search={{ ms: x.key }}>{x.late}</Drill></span>
                {x.over > 0 && <span className="font-bold text-destructive">초과 {x.over}</span>}
                {x.dd != null && <span className={x.dd < 0 ? "font-bold text-destructive" : x.dd <= 14 ? "font-bold text-chart-3" : ""}>D{x.dd >= 0 ? "-" : "+"}{Math.abs(x.dd)}</span>}
              </div>
              <div className="mt-2 border-t border-border pt-1.5 text-[11px]">
                <MsRow label="계획" n={x.plan} p={x.total ? x.plan / x.total : 0} search={{ ms: x.key, duebyBase: true }} />
                <MsRow label="실적" n={x.act} p={x.total ? x.act / x.total : 0} search={{ ms: x.key, status: "done" }} />
                <MsRow label="차이" n={x.gap} p={x.total ? x.gap / x.total : 0} signed />
              </div>

            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Card title="부서별 진도">
          <table className="w-full text-left text-xs">
            <thead className="border-b text-muted-foreground">
              <tr><th className="py-2">공종</th><th className="text-right">활동</th><th className="text-right">계획</th><th className="text-right">실적</th><th className="text-right">차이</th><th className="text-right">지연</th></tr>
            </thead>
            <tbody>
              {m.byDept.map((d) => (
                <tr key={d.slot} className="border-b border-border/60">
                  <td className="py-2 font-semibold"><Drill to="/schedule" search={{ dept: d.slot }}>{SLOT_LABEL[d.slot]}</Drill></td>
                  <td className="text-right"><Drill to="/schedule" search={{ dept: d.slot }}>{d.n}</Drill></td>
                  <td className="text-right">{pct1(d.pl)}%</td>
                  <td className="text-right font-semibold">{pct1(d.pc)}%</td>
                  <td className={`text-right ${gapCls(d.pc - d.pl)}`}>{pct1(d.pc - d.pl)}%p</td>
                  <td className="text-right"><Drill to="/delays" search={{ dept: d.slot }}>{d.late}</Drill></td>
                </tr>
              ))}

            </tbody>
          </table>
        </Card>
        <div className="grid gap-4">
          <RankCard title="건물별 지연" rows={m.bldg} field="bldg" />
          <RankCard title="협력사별 지연" rows={m.sub} field="sub" />

        </div>
      </section>

      <section className="mt-6">
        <TrendCard />
      </section>


      <p className="mt-4 text-xs text-muted-foreground">
        지연 상세는 <Link to="/delays" className="font-semibold text-primary underline">지연 리스트</Link>에서 확인할 수 있습니다.
      </p>
    </AppShell>
  );
}

const TC_CARDS = [
  { k: "T1" as TcStage | "Status", t: "T1", s: "Internal T&C" },
  { k: "Report" as TcStage | "Status", t: "Report", s: "검사 보고서" },
  { k: "T2" as TcStage | "Status", t: "T2", s: "Consultant Inspection" },
  { k: "Status" as TcStage | "Status", t: "Status", s: "T2 판정 (Pass / Fail)" },
];

type Disc = { key: string; label: string; pr: ReturnType<typeof stageProgress> };

function TcCard({ card, disc }: { card: (typeof TC_CARDS)[number]; disc: Disc[] }) {
  const isSt = card.k === "Status";
  let act = 0, plan = 0, tot = 0;
  const side = disc.map((d) => {
    const P = d.pr;
    const T = P._tot || 0;
    const a = isSt ? P._pass : P[card.k as TcStage].act;
    const p = isSt ? P._fail : P[card.k as TcStage].plan;
    act += a; plan += p; tot += T;
    return { lbl: d.label, key: d.key, a, p, T };
  });
  const prog = tot ? act / tot : 0;
  const planP = tot ? plan / tot : 0;
  const gap = act - plan;
  const tone = isSt ? (plan ? "border-chart-3/40 bg-chart-3/5" : "border-primary/30 bg-primary/5") : gap < 0 ? "border-destructive/30 bg-destructive/5" : "border-primary/30 bg-primary/5";

  return (
    <div className={`grid gap-3 rounded-md border p-3 shadow-sm sm:grid-cols-[1.15fr_1fr] ${tone}`}>
      <div>
        <p className="text-xs font-bold">{card.t}<span className="ml-1 block text-[10px] font-normal text-muted-foreground">{card.s}</span></p>
        <p className="mt-1 flex flex-wrap items-baseline gap-1">
          <span className="text-2xl font-bold">{tcPct(prog)}</span>
          {!isSt && <>
            <span className="text-xs text-muted-foreground">/ {tcPct(planP)}</span>
            <span className={`text-[11px] font-bold ${gapCls(prog - planP)}`}>{sign(prog - planP)}{tcPct(Math.abs(prog - planP)).replace("%", "")}%p</span>
          </>}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {isSt ? `Pass ${act} · Fail ${plan}` : `실적 ${act} / 계획 ${plan}`} · 전체 {tot} Qty
        </p>
        <Bar v={prog} marker={isSt ? undefined : planP} className="mt-2" tone={isSt ? "warn" : "ok"} />
      </div>
      <div className="border-t border-border pt-2 text-[11px] sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
        <p className="mb-1 text-right text-muted-foreground">{isSt ? "Pass / Fail" : "실적 / 계획"}</p>
        {side.map((x) => (
          <div key={x.lbl} className="border-t border-border/60 py-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{x.lbl}</span>
              <span>
                <b>{x.a}</b>
                <span className="text-muted-foreground"> / {x.p}</span>
                {!isSt && x.p > 0 && x.a > x.p && <span className="ml-0.5 text-[9px] text-chart-3">▲</span>}
              </span>
            </div>
            <span className="mt-1 block h-1 overflow-hidden rounded bg-muted">
              <span className="block h-full bg-primary" style={{ width: `${x.T ? Math.min(100, (x.a / x.T) * 100) : 0}%` }} />
            </span>
          </div>
        ))}
        {!isSt && (
          <div className="mt-1 flex items-center justify-between border-t border-border pt-1">
            <span className="text-muted-foreground">차이</span>
            <b className={gapCls(gap)}>{sign(gap)}{Math.abs(gap)}</b>
          </div>
        )}
      </div>
    </div>
  );
}

type DrillSearch = { dept?: string; ms?: string; bldg?: string; sub?: string; status?: string; duebyBase?: boolean };

/** 대시보드 수치 → 리스트 드릴다운 링크 */
function Drill({ to, search, className = "", children }: { to: "/schedule" | "/delays" | "/tc/list"; search?: DrillSearch | { disc?: string; only?: string }; className?: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      search={(search ?? {}) as never}
      className={`cursor-pointer rounded underline-offset-2 transition-colors hover:text-primary hover:underline focus-visible:underline ${className}`}
    >
      {children}
    </Link>
  );
}

function MsRow({ label, n, p, signed, search }: { label: string; n: number; p: number; signed?: boolean; search?: DrillSearch }) {
  const cls = signed ? gapCls(n) : "";
  const val = signed ? `${sign(n)}${Math.abs(n)}` : n;
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-baseline gap-3">
        <b className={cls}>{search ? <Drill to="/schedule" search={search}>{val}</Drill> : val}</b>
        <span className={`w-14 text-right ${cls || "text-muted-foreground"}`}>{signed ? `${sign(n)}${pct1(Math.abs(p))}%p` : `${pct1(p)}%`}</span>
      </span>
    </div>
  );
}


function Bar({ v, marker, tone = "ok", className = "" }: { v: number; marker?: number | undefined; tone?: "ok" | "bad" | "warn"; className?: string }) {
  const color = tone === "bad" ? "bg-destructive" : tone === "warn" ? "bg-chart-3" : "bg-primary";
  return (
    <div className={`relative h-1.5 overflow-hidden rounded bg-muted ${className}`}>
      <div className={`h-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, v * 100))}%` }} />
      {marker != null && <span className="absolute top-0 h-full w-px bg-foreground/60" style={{ left: `${Math.min(100, marker * 100)}%` }} />}
    </div>
  );
}

/** 업로드 시점마다 저장된 기록으로 계산한 계획·실적 추이와 일일 진도율 */
function TrendCard() {
  const { data, isLoading } = useProgressHistory();
  const series = data?.series ?? [];
  return (
    <Card title="진도 추이 · 일일 진도율 (기록 기반)">
      {isLoading ? (
        <p className="text-xs text-muted-foreground">불러오는 중…</p>
      ) : series.length === 0 ? (
        <p className="text-xs text-muted-foreground">아직 저장된 기록이 없습니다. 파일을 업로드하면 기록이 쌓입니다.</p>
      ) : (
        <>
          <table className="w-full text-left text-xs">
            <thead className="border-b text-muted-foreground">
              <tr><th className="py-2">기록일</th><th className="text-right">항목수</th><th className="text-right">계획</th><th className="text-right">실적</th><th className="text-right">차이</th><th className="text-right">일일 진도율</th></tr>
            </thead>
            <tbody>
              {series.map((s) => (
                <tr key={s.date} className="border-b border-border/60">
                  <td className="py-2 font-semibold">{s.date}</td>
                  <td className="text-right">{s.count}</td>
                  <td className="text-right">{pct1(s.planned)}%</td>
                  <td className="text-right font-semibold">{pct1(s.actual)}%</td>
                  <td className={`text-right ${gapCls(s.actual - s.planned)}`}>{sign(s.actual - s.planned)}{pct1(Math.abs(s.actual - s.planned))}%p</td>
                  <td className="text-right">{s.dailyRate == null ? "—" : `${pct1(s.dailyRate)}%p/일`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {series.length < 2 && (
            <p className="mt-2 text-xs text-muted-foreground">기록 시점이 1개라 아직 변화량을 계산할 수 없습니다. 다음 업데이트 파일을 올리면 추이가 표시됩니다.</p>
          )}
        </>
      )}
    </Card>
  );
}


function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card p-4 shadow-sm">
      <p className="mb-2 text-xs font-bold text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function RankCard({ title, rows, field }: { title: string; rows: { k: string; n: number; late: number; gap: number }[]; field: "bldg" | "sub" }) {
  const max = Math.max(1, ...rows.map((r) => r.late));
  return (
    <Card title={title}>
      {rows.length === 0 && <p className="text-xs text-muted-foreground">지연 항목이 없습니다.</p>}
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.k} className="flex items-center gap-2 text-xs">
            <span className="w-[36%] truncate" title={r.k}><Drill to="/delays" search={{ [field]: r.k }}>{r.k}</Drill></span>
            <span className="h-2 flex-1 overflow-hidden rounded bg-muted">
              <span className="block h-full bg-destructive" style={{ width: `${(r.late / max) * 100}%` }} />
            </span>
            <span className="w-14 text-right font-semibold"><Drill to="/delays" search={{ [field]: r.k }}>{r.late}건</Drill></span>
          </li>
        ))}
      </ul>

    </Card>
  );
}
