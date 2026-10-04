import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/app-shell";
import { getLineMarkingHistory } from "@/lib/line-marking.functions";
import { projectQuery, useProject } from "@/lib/use-project";
import { itemKeyOf, planAt, type Row } from "@/lib/schedule-model";

export const Route = createFileRoute("/_authenticated/progress")({
  head: () => ({ meta: [
    { title: "라인마킹 Progress | HMMME PROJECT CMS" },
    { name: "description", content: "라인마킹 각 항목의 일별 누계 계획과 누계 실적 S-curve를 확인합니다." },
    { property: "og:title", content: "라인마킹 Progress | HMMME PROJECT CMS" },
    { property: "og:description", content: "라인마킹 항목별 날짜에 따른 누계 계획·실적 진도율." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(projectQuery),
  component: ProgressPage,
});

type Snapshot = { item_key: string; snapshot_date: string; actual_progress: number | null };
type Point = { date: string; plan: number | null; actual: number | null };

function dateRange(start: string, end: string) {
  const dates: string[] = [];
  const date = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`).getTime();
  while (date.getTime() <= last && dates.length < 1500) {
    dates.push(date.toISOString().slice(0, 10));
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return dates;
}

function buildSeries(row: Row, records: Snapshot[], base: string): Point[] {
  const dated = new Map<string, number | null>();
  for (const record of records) dated.set(record.snapshot_date, record.actual_progress);
  const historical = [...dated.keys()].sort();
  const start = [row.s, historical[0], base].filter((v): v is string => !!v).sort()[0] ?? base;
  const end = [row.e, historical.at(-1), base].filter((v): v is string => !!v).sort().at(-1) ?? base;
  let actual: number | null = null;
  return dateRange(start, end).map((date) => {
    if (dated.has(date)) actual = dated.get(date) ?? null;
    const planned = planAt(row, date);
    return {
      date,
      plan: planned == null ? null : Math.round(planned * 1000) / 10,
      actual: date > base || actual == null ? null : Math.round(actual * 1000) / 10,
    };
  });
}

function ProgressPage() {
  const { rows, base } = useProject();
  const items = useMemo(() => rows.filter((row) => row.dept === "Arch" && row.act === "라인마킹")
    .sort((a, b) => (a.no ?? "").localeCompare(b.no ?? "", undefined, { numeric: true })), [rows]);
  const history = useQuery({
    queryKey: ["line-marking-history"],
    queryFn: () => getLineMarkingHistory(),
    staleTime: 120_000,
  });
  const byItem = useMemo(() => {
    const map = new Map<string, Snapshot[]>();
    for (const record of history.data ?? []) {
      const list = map.get(record.item_key) ?? [];
      list.push(record);
      map.set(record.item_key, list);
    }
    return map;
  }, [history.data]);

  return (
    <AppShell title="Progress" desc={`라인마킹 · 항목별 누계 계획 vs 누계 실적 · 기준일 ${base.replace(/-/g, ".")}`}>
      {history.isPending ? <p className="py-10 text-center text-sm text-muted-foreground">이력을 불러오는 중…</p>
        : history.isError ? <p role="alert" className="py-10 text-center text-sm text-destructive">라인마킹 이력을 불러오지 못했습니다.</p>
        : items.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">라인마킹 항목이 없습니다.</p>
        : <div className="grid gap-4 xl:grid-cols-2">
          {items.map((row) => {
            const points = buildSeries(row, byItem.get(itemKeyOf(row.dept, row.no, row.act)) ?? [], base);
            return (
              <section key={row.id} className="min-w-0 rounded-md border border-border bg-card p-4">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h2 className="text-sm font-semibold">{row.no ?? "—"} · {row.room || row.bldg || "라인마킹"}</h2>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    계획 {row.pl == null ? "—" : `${(row.pl * 100).toFixed(1)}%`} · 실적 {row.pc == null ? "—" : `${(row.pc * 100).toFixed(1)}%`}
                  </span>
                </div>
                <div className="mb-2 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed border-ncr-progress-plan" />누계 계획</span>
                  <span className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-ncr-progress-actual" />누계 실적</span>
                </div>
                <div className="h-[280px] w-full" role="img" aria-label={`${row.no ?? row.room ?? "라인마킹"} 일별 누계 계획 및 실적 그래프`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={points} margin={{ top: 8, right: 15, bottom: 6, left: -14 }}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                      <XAxis dataKey="date" tickFormatter={(date: string) => date.slice(5).replace("-", ".")} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} minTickGap={24} />
                      <YAxis domain={[0, 100]} allowDataOverflow tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} ticks={[0, 25, 50, 75, 100]} />
                      <Tooltip labelFormatter={(label) => String(label)} formatter={(value: number, name: string) => [`${Number(value).toFixed(1)}%`, name]} contentStyle={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }} />
                      <Line type="monotone" dataKey="plan" name="누계 계획" stroke="var(--ncr-progress-plan)" strokeDasharray="5 4" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                      <Line type="monotone" dataKey="actual" name="누계 실적" stroke="var(--ncr-progress-actual)" strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">{row.s ?? "—"} ~ {row.e ?? "—"} · {row.done?.toLocaleString() ?? "—"} / {row.tot?.toLocaleString() ?? "—"} {row.unit ?? ""}</p>
              </section>
            );
          })}
        </div>}
    </AppShell>
  );
}