import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Gauge } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { projectQuery, useProject } from "@/lib/use-project";
import {
  avgOf, isDone, isLate, MSDEF, milestoneDates, pct1, SLOT_LABEL, KPI_SLOTS, fmtDate, type Row,
} from "@/lib/schedule-model";
import { stageProgress, tcPct } from "@/lib/tc-model";

export const Route = createFileRoute("/dashboard")({
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

function Dashboard() {
  const { rows, base, tcItems } = useProject();
  const m = useMemo(() => {
    const withP = rows.filter((r) => r.pl != null || r.pc != null);
    const late = withP.filter(isLate);
    const done = withP.filter(isDone);
    const msDates = milestoneDates(rows);
    const byMs = Object.keys(MSDEF).map((k) => {
      const list = rows.filter((r) => r.ms === k);
      return {
        key: k, name: MSDEF[k]!, due: msDates[k] ?? null, total: list.length,
        done: list.filter(isDone).length, late: list.filter(isLate).length,
        pc: avgOf(list, "pc"), pl: avgOf(list, "pl"),
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
      pl: avgOf(withP, "pl"), pc: avgOf(withP, "pc"),
      byMs, byDept, bldg: rank((r) => r.bldg), sub: rank((r) => r.sub),
    };
  }, [rows]);

  const tc = useMemo(() => stageProgress(tcItems, base), [tcItems, base]);

  return (
    <AppShell title="대시보드" desc={`기준일 ${fmtDate(base)} · 전체 ${m.total.toLocaleString()}개 활동`}>
      <section className="grid gap-3 md:grid-cols-3">
        <Kpi icon={Gauge} label="총 활동" value={m.total.toLocaleString()} sub={`진도 입력 ${m.withP.toLocaleString()}건`} />
        <Kpi icon={CheckCircle2} tone="ok" label="계획 대비 실적" value={`${pct1(m.pc)}%`} sub={`계획 ${pct1(m.pl)}% · 차이 ${pct1(m.pc - m.pl)}%p`} />
        <Kpi icon={AlertTriangle} tone="bad" label="지연" value={m.late.toLocaleString()} sub={`완료 ${m.done.toLocaleString()}건`} />
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(["T1", "Report", "T2"] as const).map((st) => (
          <Card key={st} title={`MEP T&C · ${st}`}>
            <strong className="text-2xl">{tcPct(tc[st].pct)}</strong>
            <p className="mt-1 text-[11px] text-muted-foreground">
              완료 {tc[st].qty.toLocaleString()} / {tc._tot.toLocaleString()} · 계획 대비 {tcPct(tc[st].pvCap)}
            </p>
          </Card>
        ))}
        <Card title="T&C Status">
          <strong className="text-2xl">{tcPct(tc._tot ? tc._pass / tc._tot : null)}</strong>
          <p className="mt-1 text-[11px] text-muted-foreground">Pass {tc._pass.toLocaleString()} · Fail {tc._fail.toLocaleString()}</p>
        </Card>
      </section>

      <section className="mt-5">
        <h2 className="mb-2 text-sm font-bold">마일스톤 M1 ~ M8</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {m.byMs.map((x) => (
            <div key={x.key} className={`rounded-md border bg-card p-3 shadow-sm ${x.late ? "border-destructive/40" : "border-border"}`}>
              <div className="flex items-center justify-between">
                <strong className="text-sm">{x.key}</strong>
                <span className="text-[11px] text-muted-foreground">{fmtDate(x.due)}</span>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={x.name}>{x.name}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded bg-muted">
                <div className="h-full bg-primary" style={{ width: `${Math.min(100, x.pc * 100)}%` }} />
              </div>
              <p className="mt-1.5 text-[11px]">
                실적 {pct1(x.pc)}% · 계획 {pct1(x.pl)}% · <span className="text-muted-foreground">{x.done}/{x.total}</span>
                {x.late > 0 && <span className="ml-1 font-bold text-destructive">지연 {x.late}</span>}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Card title="부서별 진도">
          <table className="w-full text-left text-xs">
            <thead className="border-b text-muted-foreground">
              <tr><th className="py-2">공종</th><th className="text-right">활동</th><th className="text-right">계획</th><th className="text-right">실적</th><th className="text-right">차이</th><th className="text-right">지연</th></tr>
            </thead>
            <tbody>
              {m.byDept.map((d) => (
                <tr key={d.slot} className="border-b border-border/60">
                  <td className="py-2 font-semibold">{SLOT_LABEL[d.slot]}</td>
                  <td className="text-right">{d.n}</td>
                  <td className="text-right">{pct1(d.pl)}%</td>
                  <td className="text-right font-semibold">{pct1(d.pc)}%</td>
                  <td className={`text-right ${d.pc - d.pl < 0 ? "text-destructive" : "text-primary"}`}>{pct1(d.pc - d.pl)}%p</td>
                  <td className="text-right">{d.late}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <div className="grid gap-4">
          <RankCard title="건물별 지연" rows={m.bldg} />
          <RankCard title="협력사별 지연" rows={m.sub} />
        </div>
      </section>

      <p className="mt-4 text-xs text-muted-foreground">
        지연 상세는 <Link to="/delays" className="font-semibold text-primary underline">지연 리스트</Link>에서 확인할 수 있습니다.
      </p>
    </AppShell>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone }: { icon: typeof Gauge; label: string; value: string; sub: string; tone?: "ok" | "bad" }) {
  return (
    <div className="rounded-md border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
        <Icon className={`size-4 ${tone === "bad" ? "text-destructive" : tone === "ok" ? "text-primary" : "text-muted-foreground"}`} />
      </div>
      <strong className="text-2xl">{value}</strong>
      <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>
    </div>
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

function RankCard({ title, rows }: { title: string; rows: { k: string; n: number; late: number; gap: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.late));
  return (
    <Card title={title}>
      {rows.length === 0 && <p className="text-xs text-muted-foreground">지연 항목이 없습니다.</p>}
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.k} className="flex items-center gap-2 text-xs">
            <span className="w-[36%] truncate" title={r.k}>{r.k}</span>
            <span className="h-2 flex-1 overflow-hidden rounded bg-muted">
              <span className="block h-full bg-destructive" style={{ width: `${(r.late / max) * 100}%` }} />
            </span>
            <span className="w-14 text-right font-semibold">{r.late}건</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
