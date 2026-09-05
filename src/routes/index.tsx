import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, CheckCircle2, CircleDashed, Gauge, Layers3 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/app-shell";
import { getActivities } from "@/lib/activities.functions";
import { average, disciplineName, pct, statusOf } from "@/lib/activity-metrics";

const activitiesQuery = queryOptions({ queryKey: ["activities"], queryFn: () => getActivities(), staleTime: 300_000 });

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "KPI 대시보드 | SAMO 통합 공정" },
    { name: "description", content: "SAMO 프로젝트 공정률, 지연 작업, 마일스톤을 확인하는 KPI 대시보드입니다." },
    { property: "og:title", content: "SAMO 프로젝트 KPI 대시보드" },
    { property: "og:description", content: "공종별 계획 대비 실적과 주요 리스크를 확인하세요." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(activitiesQuery),
  errorComponent: () => <div role="alert" className="p-8">공정 데이터를 불러오지 못했습니다.</div>,
  notFoundComponent: () => <div className="p-8">데이터가 없습니다.</div>,
  component: Dashboard,
});

function Dashboard() {
  const { data: rows } = useSuspenseQuery(activitiesQuery);
  const plan = average(rows, "planned_progress");
  const actual = average(rows, "actual_progress");
  const completed = rows.filter((r) => statusOf(r) === "완료").length;
  const active = rows.filter((r) => statusOf(r) === "진행").length;
  const delayed = rows.filter((r) => (r.planned_progress ?? 0) - (r.actual_progress ?? 0) >= .1);
  const upcoming = rows.filter((r) => r.milestone?.startsWith("M.") && r.finish_date && r.finish_date >= "2026-09-04").length;
  const disciplines = [...new Set(rows.map((r) => r.discipline))].map((name) => {
    const part = rows.filter((r) => r.discipline === name);
    return { name: disciplineName(name), 계획: pct(average(part, "planned_progress")), 실적: pct(average(part, "actual_progress")) };
  });
  const buildings = [...new Set(rows.map((r) => r.building).filter(Boolean))].map((name) => {
    const part = rows.filter((r) => r.building === name);
    return { name: name ?? "-", value: pct(average(part, "actual_progress")) };
  }).sort((a,b) => b.value-a.value).slice(0,8);
  const risks = [...delayed].sort((a,b) => ((b.planned_progress ?? 0)-(b.actual_progress ?? 0))-((a.planned_progress ?? 0)-(a.actual_progress ?? 0))).slice(0,7);
  return <AppShell>
    <section className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><p className="mb-1 text-xs font-bold uppercase text-primary">Project Control Center</p><h1 className="text-2xl font-bold">KPI 대시보드</h1><p className="mt-1 text-sm text-muted-foreground">기준일 2026.09.04 · 5개 통합공정표</p></div>
      <div className="rounded-md border border-border bg-card px-4 py-2 text-xs text-muted-foreground">데이터 {rows.length.toLocaleString()}건</div>
    </section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <Metric icon={Gauge} label="전체 실적" value={`${pct(actual)}%`} sub={`계획 ${pct(plan)}%`} tone="primary" />
      <Metric icon={AlertTriangle} label="계획 대비" value={`${pct(actual-plan)}%p`} sub="실적 - 계획" tone="danger" />
      <Metric icon={Layers3} label="전체 작업" value={rows.length.toLocaleString()} sub="통합 Activity" />
      <Metric icon={CheckCircle2} label="완료" value={completed.toLocaleString()} sub={`${active}건 진행 중`} tone="success" />
      <Metric icon={CircleDashed} label="지연 위험" value={delayed.length.toLocaleString()} sub="계획 대비 10%p 이상" tone="danger" />
      <Metric icon={CalendarClock} label="마일스톤" value={upcoming.toLocaleString()} sub="기준일 이후 예정" tone="warning" />
    </section>
    <section className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_1fr]">
      <Panel title="공종별 계획 · 실적" caption="평균 진척률 (%)"><ResponsiveContainer width="100%" height={300}><BarChart data={disciplines} margin={{ left: -18, top: 12 }}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name"/><YAxis domain={[0,100]}/><Tooltip/><Legend/><Bar dataKey="계획" fill="var(--color-chart-3)" radius={[3,3,0,0]}/><Bar dataKey="실적" fill="var(--color-chart-1)" radius={[3,3,0,0]}/></BarChart></ResponsiveContainer></Panel>
      <Panel title="건물별 실적" caption="상위 8개 건물"><ResponsiveContainer width="100%" height={300}><BarChart data={buildings} layout="vertical" margin={{ left: 20 }}><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" domain={[0,100]}/><YAxis type="category" dataKey="name" width={60}/><Tooltip/><Bar dataKey="value" name="실적 %" radius={[0,3,3,0]}>{buildings.map((_,i)=><Cell key={i} fill={`var(--color-chart-${i%5+1})`}/>)}</Bar></BarChart></ResponsiveContainer></Panel>
    </section>
    <section className="mt-5"><Panel title="지연 · 리스크 Top" caption="계획 대비 실적 차이가 큰 작업">
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-xs text-muted-foreground"><tr><th className="py-3">공종</th><th>건물</th><th>Activity</th><th>마일스톤</th><th className="text-right">계획</th><th className="text-right">실적</th><th className="text-right">차이</th></tr></thead><tbody>{risks.map(r=><tr key={r.id} className="border-b border-border/70"><td className="py-3 font-semibold">{disciplineName(r.discipline)}</td><td>{r.building ?? "-"}</td><td className="max-w-[420px] truncate">{r.activity}</td><td>{r.milestone ?? "-"}</td><td className="text-right">{pct(r.planned_progress)}%</td><td className="text-right">{pct(r.actual_progress)}%</td><td className="text-right font-bold text-destructive">-{pct((r.planned_progress??0)-(r.actual_progress??0))}%p</td></tr>)}</tbody></table></div>
    </Panel></section>
  </AppShell>;
}

function Metric({ icon: Icon, label, value, sub, tone="default" }: { icon: typeof Gauge; label:string; value:string; sub:string; tone?:string }) { return <div className="rounded-md border border-border bg-card p-4 shadow-sm"><div className="mb-4 flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">{label}</span><Icon className={`size-4 ${tone === "danger" ? "text-destructive" : tone === "warning" ? "text-chart-2" : tone === "success" || tone === "primary" ? "text-primary" : "text-muted-foreground"}`}/></div><strong className="text-2xl">{value}</strong><p className="mt-1 text-[11px] text-muted-foreground">{sub}</p></div> }
function Panel({ title, caption, children }: { title:string; caption:string; children:React.ReactNode }) { return <div className="rounded-md border border-border bg-card p-5 shadow-sm"><div className="mb-3"><h2 className="font-bold">{title}</h2><p className="text-xs text-muted-foreground">{caption}</p></div>{children}</div> }