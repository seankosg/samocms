import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { projectQuery, useProject } from "@/lib/use-project";
import { getTcDailyProgress } from "@/lib/tc-progress.functions";
import { TcPlanVsActualCard } from "@/components/tc-progress/tc-plan-vs-actual-card";
import { TcScheduleMatrix } from "@/components/tc-progress/tc-schedule-matrix";
import { buildTcSCurve } from "@/lib/tc-scurve-utils";
import {
  ACT_COL, ALL_GROUP_BY, GROUP_LABELS, PLAN_COL, STAGE_LABELS,
  addDays, assembleMatrix, bucketEnd, buildBucketRange, groupKeyToParams,
  type Bucket, type DailyRow, type GroupBy, type GroupRow, type Unit,
} from "@/lib/tc-progress-utils";
import { TC_STAGES, type TcStage } from "@/lib/tc-model";

type Search = { unit?: string; bucket?: string; stages?: string; group?: string; from?: string; to?: string; disc?: string };

export const Route = createFileRoute("/_authenticated/tc/progress")({
  head: () => ({ meta: [
    { title: "T&C Progress | HMMME 통합 공정 관리" },
    { name: "description", content: "T&C 단계별 계획 대비 실적 S-Curve와 그룹별 Progress Matrix를 확인합니다." },
    { property: "og:title", content: "HMMME T&C Progress" },
    { property: "og:description", content: "시운전 단계별 계획·실적 누계와 매트릭스 분석." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  validateSearch: (raw: Record<string, unknown>): Search => {
    const s = (k: string) => (typeof raw[k] === "string" && (raw[k] as string).trim() ? (raw[k] as string) : undefined);
    const out: Search = {};
    for (const k of ["unit", "bucket", "stages", "group", "from", "to", "disc"] as const) {
      const v = s(k); if (v) out[k] = v;
    }
    return out;
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(projectQuery),
  errorComponent: () => <div role="alert" className="p-8">T&C Progress 데이터를 불러오지 못했습니다.</div>,
  component: TcProgressPage,
});

function TcProgressPage() {
  const { tcItems, base } = useProject();
  const search = Route.useSearch();
  const navigate = useNavigate();

  const [unit, setUnit] = useState<Unit>(search.unit === "qty" ? "qty" : "count");
  const [bucket, setBucket] = useState<Bucket>(
    search.bucket === "day" || search.bucket === "month" ? search.bucket : "week",
  );
  const [stages, setStages] = useState<TcStage[]>(() => {
    const from = (search.stages ?? "").split(",").filter((s) => TC_STAGES.includes(s as TcStage)) as TcStage[];
    return from.length ? from : [...TC_STAGES];
  });
  const [groupBy, setGroupBy] = useState<GroupBy[]>(() => {
    const from = (search.group ?? "").split(",").filter((g) => ALL_GROUP_BY.includes(g as GroupBy)) as GroupBy[];
    return from.length ? from : ["bldg"];
  });
  const [disc, setDisc] = useState(search.disc ?? "전체");
  const [from, setFrom] = useState(search.from ?? addDays(base, -60));
  const [to, setTo] = useState(search.to ?? addDays(base, 60));

  const sync = (patch: Partial<Search>) => {
    void navigate({
      to: "/tc/progress",
      search: (prev: Search) => ({ ...prev, ...patch }),
      replace: true,
    });
  };

  const daily = useQuery({
    queryKey: ["tc-daily", from, to],
    queryFn: () => getTcDailyProgress({ data: { from, to } }) as Promise<DailyRow[]>,
  });

  const disciplines = useMemo(
    () => ["전체", ...[...new Set(tcItems.map((i) => i.discipline))].sort()],
    [tcItems],
  );

  const items = useMemo(
    () => (disc === "전체" ? tcItems : tcItems.filter((i) => i.discipline === disc)),
    [tcItems, disc],
  );

  const buckets = useMemo(() => buildBucketRange(from, to, bucket), [from, to, bucket]);

  const matrix = useMemo(() => assembleMatrix({
    daily: (daily.data ?? []).filter((d) => disc === "전체" || d.discipline === disc),
    items, buckets, bucket, stages, groupBy, base, unit,
  }), [daily.data, items, buckets, bucket, stages, groupBy, base, unit, disc]);

  const scurve = useMemo(() => buildTcSCurve({ matrix, stages, base }), [matrix, stages, base]);

  const totals = useMemo(() => {
    const out = {} as Record<TcStage, number>;
    for (const st of TC_STAGES) out[st] = matrix.rows.reduce((a, r) => a + r.stages[st].total, 0);
    return out;
  }, [matrix]);

  const onCellClick = (row: GroupRow, bucketIso: string, stage: TcStage, kind: "planned" | "actual") => {
    const field = String(kind === "planned" ? PLAN_COL[stage] : ACT_COL[stage]);
    void navigate({
      to: "/tc/list",
      search: {
        ...groupKeyToParams(groupBy.length ? groupBy : ["bldg"], row.groupKeyRaw),
        ...(disc !== "전체" ? { disc } : {}),
        stage, field, from: bucketIso, to: bucketEnd(bucketIso, bucket),
      },
    });
  };

  const onRowClick = (row: GroupRow) => {
    void navigate({
      to: "/tc/list",
      search: {
        ...groupKeyToParams(groupBy.length ? groupBy : ["bldg"], row.groupKeyRaw),
        ...(disc !== "전체" ? { disc } : {}),
      },
    });
  };

  const toggle = <T,>(list: T[], v: T, set: (n: T[]) => void, min = 1) => {
    const next = list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
    if (next.length < min) return;
    set(next);
    return next;
  };

  return (
    <AppShell title="T&C Progress" desc="단계별 계획 대비 실적 S-Curve와 Progress Matrix">
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3 text-xs">
          <Seg label="집계" options={[["count", "건수"], ["qty", "수량"]]} value={unit}
            onChange={(v) => { setUnit(v as Unit); sync({ unit: v }); }} />
          <Seg label="구간" options={[["day", "일"], ["week", "주"], ["month", "월"]]} value={bucket}
            onChange={(v) => { setBucket(v as Bucket); sync({ bucket: v }); }} />
          <div>
            <div className="mb-1 text-[10px] uppercase text-muted-foreground">공종</div>
            <select
              className="h-8 rounded-md border border-input bg-background px-2"
              value={disc}
              onChange={(e) => { setDisc(e.target.value); sync({ disc: e.target.value }); }}
            >
              {disciplines.map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase text-muted-foreground">기간</div>
            <div className="flex items-center gap-1">
              <Input type="date" className="h-8 w-[140px]" value={from}
                onChange={(e) => { setFrom(e.target.value); sync({ from: e.target.value }); }} />
              <span className="text-muted-foreground">~</span>
              <Input type="date" className="h-8 w-[140px]" value={to}
                onChange={(e) => { setTo(e.target.value); sync({ to: e.target.value }); }} />
            </div>
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase text-muted-foreground">단계</div>
            <div className="flex flex-wrap gap-1">
              {TC_STAGES.map((st) => (
                <Chip key={st} active={stages.includes(st)}
                  onClick={() => { const n = toggle(stages, st, setStages); if (n) sync({ stages: n.join(",") }); }}>
                  {STAGE_LABELS[st]}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase text-muted-foreground">그룹</div>
            <div className="flex flex-wrap gap-1">
              {ALL_GROUP_BY.map((g) => (
                <Chip key={g} active={groupBy.includes(g)}
                  onClick={() => { const n = toggle(groupBy, g, setGroupBy); if (n) sync({ group: n.join(",") }); }}>
                  {GROUP_LABELS[g]}
                </Chip>
              ))}
            </div>
          </div>
          <Button variant="outline" size="sm" className="ml-auto h-8"
            onClick={() => { setFrom(addDays(base, -60)); setTo(addDays(base, 60)); sync({ from: addDays(base, -60), to: addDays(base, 60) }); }}>
            기준일 ±60일
          </Button>
        </div>

        {daily.isPending ? (
          <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">불러오는 중…</div>
        ) : daily.isError ? (
          <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm">
            일자별 T&C 기록을 불러오지 못했습니다.
          </div>
        ) : (
          <>
            <TcPlanVsActualCard scurve={scurve} stages={stages} bucket={bucket} unit={unit} totals={totals} base={base} />
            <TcScheduleMatrix
              data={matrix} bucket={bucket} stages={stages} base={base} asOfLabel={base}
              onCellClick={onCellClick} onRowClick={onRowClick}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}

function Seg({ label, options, value, onChange }: {
  label: string; options: [string, string][]; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="inline-flex overflow-hidden rounded-md border border-input">
        {options.map(([v, l]) => (
          <button key={v} type="button" onClick={() => onChange(v)}
            className={cn("h-8 px-3", value === v ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={cn("h-7 rounded-md border px-2 text-[11px] transition",
        active ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:bg-muted")}>
      {children}
    </button>
  );
}
