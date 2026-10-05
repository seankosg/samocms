import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Check, ChevronDown } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { MultiSelectFilter } from "@/components/column-filter";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { projectQuery, useProject, useSnapshotSeries } from "@/lib/use-project";
import { itemKeyOf, pct1, SLOT_LABEL, type Row } from "@/lib/schedule-model";
import { buildCombinedSeries, unitsOf, type AggMode } from "@/lib/progress-scurve";
import { cn } from "@/lib/utils";

type ProgressSearch = {
  bldgs?: string;
  depts?: string;
  acts?: string;
  items?: string;
  agg?: string;
  showItems?: boolean;
  daily?: string;
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);

function validateProgressSearch(raw: Record<string, unknown>): ProgressSearch {
  const out: ProgressSearch = {};
  const bldgs = str(raw["bldgs"]); if (bldgs) out.bldgs = bldgs;
  const depts = str(raw["depts"]); if (depts) out.depts = depts;
  const acts = str(raw["acts"]); if (acts) out.acts = acts;
  const items = str(raw["items"]); if (items) out.items = items;
  const agg = str(raw["agg"]); if (agg === "simple") out.agg = agg;
  if (raw["showItems"] === true || raw["showItems"] === "true") out.showItems = true;
  if (raw["daily"] === "quantity") out.daily = "quantity";
  return out;
}

const split = (v: string | undefined) => (v ? v.split(",").filter(Boolean) : []);

export const Route = createFileRoute("/_authenticated/progress")({
  validateSearch: validateProgressSearch,
  head: () => ({ meta: [
    { title: "통합 Progress | HMMME PROJECT CMS" },
    { name: "description", content: "전체 공정 항목을 다중 선택해 통합 누계 계획·실적 S-curve를 확인합니다." },
    { property: "og:title", content: "통합 Progress | HMMME PROJECT CMS" },
    { property: "og:description", content: "건물·공종·활동명 계층 필터로 선택한 항목들의 통합 S-curve." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(projectQuery),
  errorComponent: () => <div role="alert" className="p-8">진도 데이터를 불러오지 못했습니다.</div>,
  component: ProgressPage,
});

const ITEM_COLORS = [
  "#0ea5e9", "#f59e0b", "#10b981", "#8b5cf6", "#ef4444", "#14b8a6", "#f97316", "#6366f1",
  "#84cc16", "#ec4899", "#06b6d4", "#a855f7", "#22c55e", "#eab308", "#3b82f6", "#d946ef",
];

function countOptions(rows: Row[], key: (r: Row) => string | null) {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = key(r);
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()].map(([value, count]) => ({ value, count }));
}

function ProgressPage() {
  const { hdecRows, base } = useProject();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/progress" });
  const setSearch = (patch: Record<string, string | boolean | undefined>) =>
    navigate({ search: (prev: ProgressSearch) => ({ ...prev, ...patch }), replace: true });

  const selBldgs = split(search.bldgs);
  const selDepts = split(search.depts);
  const selActs = split(search.acts);
  const selItemKeys = split(search.items);
  const agg: AggMode = search.agg === "simple" ? "simple" : "weighted";
  const dailyMode = search.daily === "quantity" ? "quantity" : "percent";

  // 계층 필터: 건물 → 공종 → 활동명
  const bldgOptions = useMemo(() => countOptions(hdecRows, (r) => r.bldg), [hdecRows]);
  const afterBldg = useMemo(
    () => (selBldgs.length ? hdecRows.filter((r) => r.bldg && selBldgs.includes(r.bldg)) : hdecRows),
    [hdecRows, selBldgs],
  );
  const deptOptions = useMemo(() => countOptions(afterBldg, (r) => r.dept), [afterBldg]);
  const afterDept = useMemo(
    () => (selDepts.length ? afterBldg.filter((r) => selDepts.includes(r.dept)) : afterBldg),
    [afterBldg, selDepts],
  );
  const actOptions = useMemo(() => countOptions(afterDept, (r) => r.act), [afterDept]);
  const filtered = useMemo(
    () => (selActs.length ? afterDept.filter((r) => selActs.includes(r.act)) : afterDept),
    [afterDept, selActs],
  );

  // 항목 선택: 미선택 시 필터 결과 전체가 대상
  const selected = useMemo(() => {
    if (selItemKeys.length === 0) return filtered;
    const set = new Set(selItemKeys);
    return filtered.filter((r) => set.has(itemKeyOf(r.dept, r.no, r.act)));
  }, [filtered, selItemKeys]);

  const snapshots = useSnapshotSeries(base, true);
  const showItems = !!search.showItems && selected.length > 0 && selected.length <= 20;
  const points = useMemo(
    () => buildCombinedSeries({ rows: selected, series: snapshots.data?.series ?? {}, base, agg, includeItems: showItems }),
    [selected, snapshots.data, base, agg, showItems],
  );

  const chartData = useMemo(
    () =>
      points.map((p) => {
        const flat: Record<string, number | string | null> = {
          date: p.date, plan: p.plan, actual: p.actual,
          dailyPlan: dailyMode === "quantity" ? p.dailyPlanQty : p.dailyPlan,
          dailyActual: dailyMode === "quantity" ? p.dailyActualQty : p.dailyActual,
        };
        if (p.items) for (const [k, v] of Object.entries(p.items)) flat[`i:${k}`] = v;
        return flat;
      }),
    [points, dailyMode],
  );

  const dailyKpiData = useMemo(
    () => points.map((point) => {
      const plan = dailyMode === "quantity" ? point.dailyPlanQty : point.dailyPlan;
      const actual = dailyMode === "quantity" ? point.dailyActualQty : point.dailyActual;
      const difference = point.date <= base && plan != null && actual != null
        ? Math.round((actual - plan) * 10) / 10
        : null;
      return {
        date: point.date,
        over: difference != null && difference > 0 ? difference : null,
        short: difference != null && difference < 0 ? difference : null,
      };
    }),
    [points, dailyMode, base],
  );
  const hasDailyKpi = dailyKpiData.some((point) => point.over != null || point.short != null);

  const todayPoint = useMemo(() => [...points].reverse().find((p) => p.date <= base), [points]);
  const mixedUnits = useMemo(() => unitsOf(selected), [selected]);
  const itemKeys = useMemo(() => selected.map((r) => itemKeyOf(r.dept, r.no, r.act)), [selected]);

  return (
    <AppShell title="Progress" desc={`전체 공정 통합 S-curve · 기준일 ${base.replace(/-/g, ".")}`}>
      {/* 필터 영역 */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-border bg-card px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          건물
          <MultiSelectFilter
            options={bldgOptions}
            selected={selBldgs}
            onChange={(next) => setSearch({ bldgs: next?.join(","), depts: undefined, acts: undefined, items: undefined })}
          />
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          공종
          <MultiSelectFilter
            options={deptOptions.map((o) => ({ ...o, value: o.value }))}
            selected={selDepts}
            onChange={(next) => setSearch({ depts: next?.join(","), acts: undefined, items: undefined })}
          />
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          활동명
          <MultiSelectFilter
            options={actOptions}
            selected={selActs}
            onChange={(next) => setSearch({ acts: next?.join(","), items: undefined })}
          />
        </span>
        <ItemPicker
          rows={filtered}
          selectedKeys={selItemKeys}
          onChange={(keys) => setSearch({ items: keys.length ? keys.join(",") : undefined })}
        />
        <span className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">집계</span>
          <span className="inline-flex overflow-hidden rounded-md border border-border text-xs">
            {(["weighted", "simple"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSearch({ agg: mode === "weighted" ? undefined : "simple" })}
                className={cn(
                  "px-2.5 py-1",
                  agg === mode ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted/60",
                )}
              >
                {mode === "weighted" ? "수량 가중" : "단순 평균"}
              </button>
            ))}
          </span>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox
              checked={showItems}
              disabled={selected.length > 20}
              onCheckedChange={(c) => setSearch({ showItems: !!c || undefined })}
              className="h-3.5 w-3.5"
            />
            항목별 개별선{selected.length > 20 ? " (20개 이하)" : ""}
          </label>
        </span>
      </div>

      {agg === "weighted" && mixedUnits.length > 1 && (
        <p className="mb-3 text-[11px] text-amber-600 dark:text-amber-400">
          단위가 다른 항목({mixedUnits.join(", ")})이 섞여 있어 수량 가중 평균이 왜곡될 수 있습니다.
        </p>
      )}

      {/* 요약 KPI */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="선택 항목" value={`${selected.length.toLocaleString()}개`} />
        <Kpi label="통합 계획 진도" value={todayPoint?.plan == null ? "—" : `${todayPoint.plan.toFixed(1)}%`} />
        <Kpi label="통합 실적 진도" value={todayPoint?.actual == null ? "—" : `${todayPoint.actual.toFixed(1)}%`} />
        <Kpi
          label="계획 대비 차이"
          value={
            todayPoint?.plan == null || todayPoint?.actual == null
              ? "—"
              : `${todayPoint.actual - todayPoint.plan >= 0 ? "+" : ""}${(todayPoint.actual - todayPoint.plan).toFixed(1)}%p`
          }
          tone={todayPoint?.plan != null && todayPoint?.actual != null && todayPoint.actual < todayPoint.plan ? "bad" : "good"}
        />
      </div>

      {/* 일별 막대 + 통합 S-curve */}
      <section className="rounded-md border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 bg-ncr-progress-plan/45" />일별 계획</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 bg-ncr-progress-actual/45" />일별 실적</span>
          <span className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed border-ncr-progress-plan" />누계 계획</span>
          <span className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-ncr-progress-actual" />누계 실적</span>
          {showItems && <span className="flex items-center gap-1.5"><span className="w-5 border-t border-muted-foreground/40" />항목별 실적</span>}
          <div className="ml-auto inline-flex shrink-0 overflow-hidden rounded-md border border-border" aria-label="일별 막대 단위">
            {(["percent", "quantity"] as const).map((mode) => (
              <Button key={mode} type="button" variant="ghost" size="sm" aria-pressed={dailyMode === mode}
                onClick={() => setSearch({ daily: mode === "quantity" ? "quantity" : undefined })}
                className={cn("h-7 rounded-none px-2.5 text-xs shadow-none", dailyMode === mode ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : "text-muted-foreground")}>
                {mode === "percent" ? "%p" : "수량"}
              </Button>
            ))}
          </div>
        </div>
        <div className="mb-1 flex justify-between text-[11px] text-muted-foreground"><span>일별 ({dailyMode === "quantity" ? "수량" : "%p"})</span><span>누계 (%)</span></div>
        {selected.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">필터 조건에 맞는 항목이 없습니다.</p>
        ) : snapshots.isPending ? (
          <p className="py-16 text-center text-sm text-muted-foreground">이력을 불러오는 중…</p>
        ) : (
          <div className="h-[420px] w-full" role="img" aria-label="선택 항목의 일별 계획·실적 막대와 누계 계획·실적 S-curve">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 5, bottom: 6, left: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5).replace("-", ".")} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} minTickGap={24} />
                <YAxis yAxisId="daily" width={48} tickFormatter={(v: number) => dailyMode === "quantity" ? v.toLocaleString() : `${v}%p`} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                <YAxis yAxisId="cumulative" orientation="right" width={42} domain={[0, 100]} allowDataOverflow tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} ticks={[0, 25, 50, 75, 100]} />
                <Tooltip
                  labelFormatter={(label) => String(label)}
                  formatter={(value: number, name: string) => {
                    const label = name.startsWith("i:") ? name.slice(2).split("|").slice(1).join(" ") : name;
                    return [name.startsWith("일별") ? `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}${dailyMode === "quantity" ? "" : "%p"}` : `${Number(value).toFixed(1)}%`, label];
                  }}
                  contentStyle={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}
                />
                <Bar yAxisId="daily" dataKey="dailyPlan" name="일별 계획" fill="var(--ncr-progress-plan)" fillOpacity={0.4} isAnimationActive={false} maxBarSize={18} />
                <Bar yAxisId="daily" dataKey="dailyActual" name="일별 실적" fill="var(--ncr-progress-actual)" fillOpacity={0.4} isAnimationActive={false} maxBarSize={18} />
                {showItems &&
                  itemKeys.map((key, i) => (
                    <Line
                      key={key}
                      yAxisId="cumulative"
                      type="monotone"
                      dataKey={`i:${key}`}
                      name={`i:${key}`}
                      stroke={ITEM_COLORS[i % ITEM_COLORS.length]}
                      strokeWidth={1}
                      strokeOpacity={0.55}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ))}
                <Line yAxisId="cumulative" type="monotone" dataKey="plan" name="통합 누계 계획" stroke="var(--ncr-progress-plan)" strokeDasharray="5 4" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                <Line yAxisId="cumulative" type="monotone" dataKey="actual" name="통합 누계 실적" stroke="var(--ncr-progress-actual)" strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="mt-6 border-t border-border pt-5" aria-label="일일 KPI 차트">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">일일 KPI · 계획 대비 실적</h2>
            <p className="mt-1 text-xs text-muted-foreground">당일 실적 − 당일 계획 · {dailyMode === "quantity" ? "수량" : "%p"}</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 bg-schedule-over" />초과달성</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 bg-schedule-short" />미달</span>
          </div>
        </div>
        {selected.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">필터 조건에 맞는 항목이 없습니다.</p>
        ) : snapshots.isPending ? (
          <p className="py-12 text-center text-sm text-muted-foreground">이력을 불러오는 중…</p>
        ) : !hasDailyKpi ? (
          <p className="py-12 text-center text-sm text-muted-foreground">비교할 일별 계획·실적 데이터가 없습니다.</p>
        ) : (
          <div className="h-[260px] w-full" role="img" aria-label="일별 계획 대비 실적 초과달성 및 미달 막대 차트">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dailyKpiData} margin={{ top: 8, right: 12, bottom: 6, left: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5).replace("-", ".")} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} minTickGap={24} />
                <YAxis width={48} tickFormatter={(v: number) => dailyMode === "quantity" ? v.toLocaleString() : `${v}%p`} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                <Tooltip
                  labelFormatter={(label) => String(label)}
                  formatter={(value: number, name: string) => [`${name === "미달" ? "−" : "+"}${Math.abs(Number(value)).toLocaleString(undefined, { maximumFractionDigits: 1 })}${dailyMode === "quantity" ? "" : "%p"}`, name]}
                  contentStyle={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}
                />
                <ReferenceLine y={0} stroke="var(--muted-foreground)" />
                <Bar dataKey="over" name="초과달성" fill="var(--schedule-over)" maxBarSize={20} isAnimationActive={false} />
                <Bar dataKey="short" name="미달" fill="var(--schedule-short)" maxBarSize={20} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </AppShell>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn(
        "mt-1 text-xl font-semibold tabular-nums",
        tone === "bad" ? "text-destructive" : tone === "good" ? "text-ncr-progress-actual" : undefined,
      )}>
        {value}
      </p>
    </div>
  );
}

/** 항목 다중 선택 — 필터 결과 목록에서 체크박스 선택 (미선택 = 전체) */
function ItemPicker({ rows, selectedKeys, onChange }: { rows: Row[]; selectedKeys: string[]; onChange: (keys: string[]) => void }) {
  const [query, setQuery] = useState("");
  const items = useMemo(
    () =>
      rows
        .map((r) => ({ key: itemKeyOf(r.dept, r.no, r.act), label: `${r.no ?? "—"} · ${r.act}`, sub: `${SLOT_LABEL[r.dept] ?? r.dept} · ${r.bldg ?? "—"}`, pc: r.pc }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
    [rows],
  );
  const filtered = useMemo(() => {
    const s = query.trim().toLowerCase();
    return s ? items.filter((i) => i.label.toLowerCase().includes(s) || i.sub.toLowerCase().includes(s)) : items;
  }, [items, query]);
  const selected = new Set(selectedKeys);
  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange([...next]);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs",
            selectedKeys.length ? "text-primary" : "text-muted-foreground",
          )}
        >
          항목 선택 {selectedKeys.length > 0 ? `(${selectedKeys.length})` : `(전체 ${rows.length})`}
          <ChevronDown className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">
        <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="항목 검색..." className="mb-1 h-7 text-xs" />
        <div className="mb-1 flex items-center gap-2 px-1">
          <button className="text-[11px] text-muted-foreground hover:underline" onClick={() => onChange(filtered.map((i) => i.key))}>전체 선택</button>
          <button className="text-[11px] text-muted-foreground hover:underline" onClick={() => onChange([])}>해제(전체 대상)</button>
        </div>
        <div className="max-h-72 overflow-auto">
          {filtered.length === 0 && <div className="py-4 text-center text-[11px] text-muted-foreground">일치하는 항목 없음</div>}
          {filtered.map((i) => (
            <label key={i.key} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted/50">
              <Checkbox checked={selected.has(i.key)} onCheckedChange={() => toggle(i.key)} className="h-3.5 w-3.5" />
              <span className="flex-1 truncate">
                {i.label} <span className="text-[10px] text-muted-foreground">{i.sub}</span>
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground">{pct1(i.pc)}%</span>
              {selected.has(i.key) && <Check className="h-3 w-3 text-primary" />}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
