// 차트 범례 (QAIL ProgressChartLegend 이식) — 값 계산 없이 토글/표본만 담당.
import { cn } from "@/lib/utils";

type SampleKind = "bar-plan" | "bar-actual" | "line-plan" | "line-actual";

function Sample({ sample, color }: { sample: SampleKind; color: string }) {
  if (sample === "bar-plan" || sample === "bar-actual") {
    return (
      <span
        className="inline-block h-3 w-3 rounded-[2px]"
        style={sample === "bar-plan"
          ? { border: `1.5px dashed ${color}`, background: "transparent" }
          : { background: color }}
      />
    );
  }
  return (
    <span className="inline-flex h-3 w-5 items-center">
      <span
        className="block h-0 w-full"
        style={{ borderTop: `2px ${sample === "line-plan" ? "dashed" : "solid"} ${color}` }}
      />
    </span>
  );
}

export interface LegendMetric { key: string; label: string; color: string }

export function ProgressChartLegend({
  metrics, hiddenMetrics, onToggleMetric,
  hiddenSeries, onToggleSeries,
  axes, showReset, onReset, className,
}: {
  metrics: LegendMetric[];
  hiddenMetrics: Set<string>;
  onToggleMetric: (k: string) => void;
  hiddenSeries: Set<string>;
  onToggleSeries: (k: string) => void;
  axes?: { left?: string; right?: string };
  showReset?: boolean;
  onReset?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-muted/20 px-3 py-1.5 text-[11px]">
        <span className="font-semibold uppercase tracking-wide text-muted-foreground">단계</span>
        {metrics.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => onToggleMetric(m.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-1 transition hover:bg-muted",
              hiddenMetrics.has(m.key) && "opacity-40 line-through",
            )}
          >
            <span className="inline-block size-2.5 rounded-full" style={{ background: m.color }} />
            {m.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground">
        <span className="font-semibold uppercase tracking-wide">표기</span>
        <button
          type="button"
          onClick={() => onToggleSeries("plan")}
          className={cn("inline-flex items-center gap-1.5 rounded px-1 hover:bg-muted", hiddenSeries.has("plan") && "opacity-40 line-through")}
        >
          <Sample sample="bar-plan" color="hsl(var(--foreground))" />
          <Sample sample="line-plan" color="hsl(var(--foreground))" />
          계획
        </button>
        <button
          type="button"
          onClick={() => onToggleSeries("actual")}
          className={cn("inline-flex items-center gap-1.5 rounded px-1 hover:bg-muted", hiddenSeries.has("actual") && "opacity-40 line-through")}
        >
          <Sample sample="bar-actual" color="hsl(var(--foreground))" />
          <Sample sample="line-actual" color="hsl(var(--foreground))" />
          실적
        </button>
        {axes?.left && <span className="ml-2">좌축: {axes.left}</span>}
        {axes?.right && <span>우축: {axes.right}</span>}
        {showReset && (
          <button
            type="button"
            onClick={onReset}
            className="ml-auto inline-flex h-[26px] items-center rounded-md border px-2 text-[11px] transition hover:bg-muted"
          >
            초기화
          </button>
        )}
      </div>
    </div>
  );
}

export function VarianceLegend({ unitNote }: { unitNote?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground">
      <span className="font-semibold uppercase tracking-wide">차이 (실적 − 계획)</span>
      <span className="inline-flex items-center gap-1.5"><Sample sample="bar-actual" color="hsl(160,60%,42%)" />앞섬</span>
      <span className="inline-flex items-center gap-1.5"><Sample sample="bar-actual" color="hsl(0,72%,51%)" />지연</span>
      {unitNote && <span className="ml-auto">{unitNote}</span>}
    </div>
  );
}
