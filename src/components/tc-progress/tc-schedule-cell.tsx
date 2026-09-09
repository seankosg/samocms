// 매트릭스 셀 — 계획/실적 수치 + 미니 바 (QAIL ScheduleCell 이식)
import { memo } from "react";
import { cn } from "@/lib/utils";

interface Props {
  plan: number;
  actual: number;
  isFuture: boolean;
  isToday: boolean;
  width: number;
  onPlanClick?: (() => void) | undefined;
  onActualClick?: (() => void) | undefined;
}

function Bar({ v, max, className }: { v: number; max: number; className: string }) {
  const w = max > 0 ? Math.max(v > 0 ? 8 : 0, (v / max) * 100) : 0;
  return (
    <span className="block h-1 w-full rounded-sm bg-muted">
      <span className={cn("block h-1 rounded-sm", className)} style={{ width: `${w}%` }} />
    </span>
  );
}

function CellBase({ plan, actual, isFuture, isToday, width, onPlanClick, onActualClick }: Props) {
  const empty = plan === 0 && (actual === 0 || isFuture);
  const max = Math.max(plan, isFuture ? 0 : actual, 1);
  const diff = isFuture ? null : actual - plan;

  return (
    <div
      className={cn(
        "flex h-14 shrink-0 flex-col justify-center gap-0.5 border-l border-border px-1 text-[10px] tabular-nums",
        isToday && "bg-primary/5 ring-1 ring-inset ring-primary/30",
        empty && "text-muted-foreground/40",
      )}
      style={{ width, minWidth: width }}
    >
      {empty ? (
        <span className="text-center">·</span>
      ) : (
        <>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={!onPlanClick || plan === 0}
              onClick={onPlanClick}
              className="w-6 text-right text-muted-foreground enabled:hover:underline"
            >
              {plan || "-"}
            </button>
            <Bar v={plan} max={max} className="bg-schedule-plan" />
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={!onActualClick || isFuture || actual === 0}
              onClick={onActualClick}
              className={cn("w-6 text-right font-semibold enabled:hover:underline", isFuture && "text-muted-foreground/50")}
            >
              {isFuture ? "—" : actual || "-"}
            </button>
            <Bar v={isFuture ? 0 : actual} max={max} className="bg-schedule-actual" />
          </div>
          {diff !== null && diff !== 0 && (
            <div className={cn("text-right text-[9px]", diff > 0 ? "text-schedule-over" : "text-schedule-short")}>
              {diff > 0 ? `+${diff}` : diff}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export const TcScheduleCell = memo(CellBase);
