// T&C Progress Matrix — QAIL SnagScheduleMatrix 이식 (좌측 고정 + 타임라인 가상화)
import { Fragment, useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import { TcScheduleCell } from "./tc-schedule-cell";
import {
  STAGE_LABELS, formatBucketLabel,
  type Bucket, type GroupRow, type MatrixResult,
} from "@/lib/tc-progress-utils";
import type { TcStage } from "@/lib/tc-model";

const W_GROUP = 220;
const W_NUM = 52;
const W_PCT = 46;
const STICKY_LEFT_WIDTH = W_GROUP + (W_NUM * 3 + W_PCT) * 2;
const OPAQUE = { backgroundColor: "var(--color-card)" } as const;

function HeaderNum({ width, children, borderLeft, borderRight, title }: {
  width: number; children: React.ReactNode; borderLeft?: boolean; borderRight?: boolean; title?: string;
}) {
  return (
    <div
      className={cn("flex items-center justify-end border-l border-border px-1.5 py-2",
        borderLeft && "border-l-2", borderRight && "border-r border-border")}
      style={{ width, minWidth: width }} title={title}
    >{children}</div>
  );
}

function NumCell({ width, children, className, borderLeft, borderRight, title }: {
  width: number; children: React.ReactNode; className?: string; borderLeft?: boolean; borderRight?: boolean; title?: string;
}) {
  return (
    <div
      className={cn("flex items-center justify-end border-l border-border px-1.5 tabular-nums",
        borderLeft && "border-l-2", borderRight && "border-r border-border", className)}
      style={{ width, minWidth: width }} title={title}
    >{children}</div>
  );
}

function DrillNum({ value, onClick, className, title }: {
  value: number; onClick?: (() => void) | undefined; className?: string; title?: string;
}) {
  if (!onClick || value === 0) return <span className={className} title={title}>{value}</span>;
  return (
    <button type="button" onClick={onClick} title={title} className={cn("hover:underline", className)}>{value}</button>
  );
}

function TotalDoneCells({ total, done, bold }: { total: number; done: number; bold?: boolean }) {
  const pct = total > 0 ? (done / total) * 100 : null;
  const remain = total - done;
  return (
    <>
      <NumCell width={W_NUM}>{total}</NumCell>
      <NumCell width={W_NUM} className={bold ? "font-semibold" : ""}>{done}</NumCell>
      <NumCell width={W_PCT} className="text-[10px] text-muted-foreground">{pct === null ? "—" : `${pct.toFixed(0)}%`}</NumCell>
      <NumCell width={W_NUM} className={remain > 0 ? "text-schedule-short" : "text-muted-foreground"}>{remain}</NumCell>
    </>
  );
}

function PlanActualCells({ plan, actual, asOfLabel, bold, onPlanClick, onActualClick }: {
  plan: number; actual: number; asOfLabel: string; bold?: boolean;
  onPlanClick?: (() => void) | undefined; onActualClick?: (() => void) | undefined;
}) {
  const pct = plan > 0 ? (actual / plan) * 100 : null;
  const diff = actual - plan;
  const accent = pct === null ? "" : pct < 100 ? "text-schedule-short" : pct > 100 ? "text-schedule-over" : "";
  const diffAccent = diff < 0 ? "text-schedule-short" : diff > 0 ? "text-schedule-over" : "text-muted-foreground";
  return (
    <>
      <NumCell width={W_NUM} borderLeft title={`${asOfLabel} 까지 계획`}>
        <DrillNum value={plan} onClick={onPlanClick} title={`${asOfLabel} 까지 계획 항목 보기`} />
      </NumCell>
      <NumCell width={W_NUM} title={`${asOfLabel} 까지 실적`} className={cn(bold && "font-semibold", accent)}>
        <DrillNum value={actual} onClick={onActualClick} title={`${asOfLabel} 까지 실적 항목 보기`} />
      </NumCell>
      <NumCell width={W_PCT} className={cn("text-[10px]", accent)}>{pct === null ? "—" : `${pct.toFixed(0)}%`}</NumCell>
      <NumCell width={W_NUM} borderRight className={cn(diffAccent, bold && "font-semibold")}>{diff > 0 ? `+${diff}` : diff}</NumCell>
    </>
  );
}

export function TcScheduleMatrix({
  data, bucket, stages, base, asOfLabel, onCellClick, onRowClick, onCumClick,
}: {
  data: MatrixResult;
  bucket: Bucket;
  stages: TcStage[];
  base: string;
  asOfLabel: string;
  /** stage=null 이면 선택된 전체 단계 합계 셀 */
  onCellClick?: (row: GroupRow, bucketIso: string, stage: TcStage | null, kind: "planned" | "actual") => void;
  onRowClick?: (row: GroupRow) => void;
  /** 좌측 누계 P/A 클릭 (기간 시작~기준일) */
  onCumClick?: (row: GroupRow, stage: TcStage | null, kind: "planned" | "actual") => void;
}) {
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const leftBodyRef = useRef<HTMLDivElement>(null);
  const didScroll = useRef(false);

  const cellWidth = bucket === "day" ? 64 : 96;
  const isMultiStage = stages.length > 1;

  const todayBucketIdx = useMemo(() => {
    let idx = -1;
    data.buckets.forEach((b, i) => { if (b <= base) idx = i; });
    return idx;
  }, [data.buckets, base]);

  const virtualizer = useVirtualizer({
    horizontal: true,
    count: data.buckets.length,
    getScrollElement: () => bodyScrollRef.current,
    estimateSize: () => cellWidth,
    overscan: 6,
  });
  const virtualCols = virtualizer.getVirtualItems();
  const timelineGridWidth = data.buckets.length * cellWidth;
  const leftPad = virtualCols[0]?.start ?? 0;
  const rightPad = timelineGridWidth - (virtualCols[virtualCols.length - 1]?.end ?? 0);

  // 스크롤 동기화
  useEffect(() => {
    const body = bodyScrollRef.current;
    if (!body) return;
    const onScroll = () => {
      if (headerScrollRef.current) headerScrollRef.current.scrollLeft = body.scrollLeft;
      if (leftBodyRef.current) leftBodyRef.current.scrollTop = body.scrollTop;
    };
    body.addEventListener("scroll", onScroll, { passive: true });
    return () => body.removeEventListener("scroll", onScroll);
  }, []);

  // 기준일 위치로 초기 스크롤
  useEffect(() => {
    if (didScroll.current || todayBucketIdx < 0 || !bodyScrollRef.current) return;
    didScroll.current = true;
    bodyScrollRef.current.scrollLeft = Math.max(0, todayBucketIdx * cellWidth - cellWidth * 3);
  }, [todayBucketIdx, cellWidth]);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="flex border-b border-border text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <div className="shrink-0" style={{ width: STICKY_LEFT_WIDTH, ...OPAQUE }}>
          <div className="flex">
            <div className="flex items-end px-2 py-2" style={{ width: W_GROUP }}>그룹</div>
            <HeaderNum width={W_NUM}>Total</HeaderNum>
            <HeaderNum width={W_NUM}>완료</HeaderNum>
            <HeaderNum width={W_PCT}>%</HeaderNum>
            <HeaderNum width={W_NUM}>잔여</HeaderNum>
            <HeaderNum width={W_NUM} borderLeft title={`${asOfLabel} 까지 계획(Plan)`}>P</HeaderNum>
            <HeaderNum width={W_NUM} title={`${asOfLabel} 까지 실적(Actual)`}>A</HeaderNum>
            <HeaderNum width={W_PCT}>%</HeaderNum>
            <HeaderNum width={W_NUM} borderRight>차이</HeaderNum>
          </div>
        </div>
        <div ref={headerScrollRef} className="min-w-0 flex-1 overflow-hidden">
          <div className="flex" style={{ width: timelineGridWidth, minWidth: timelineGridWidth }}>
            {leftPad > 0 && <div style={{ width: leftPad, minWidth: leftPad }} />}
            {virtualCols.map((vc) => {
              const b = data.buckets[vc.index]!;
              const lbl = formatBucketLabel(b, bucket);
              return (
                <div
                  key={b}
                  className={cn("shrink-0 border-l border-border px-1 py-1.5 text-center",
                    vc.index === todayBucketIdx && "bg-primary/10 text-primary")}
                  style={{ width: cellWidth, minWidth: cellWidth }}
                >
                  <div className="leading-tight">{lbl.primary}</div>
                  <div className="text-[9px] font-normal normal-case leading-tight text-muted-foreground">{lbl.secondary}</div>
                </div>
              );
            })}
            {rightPad > 0 && <div style={{ width: rightPad, minWidth: rightPad }} />}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex">
        <div
          ref={leftBodyRef}
          className="max-h-[calc(100dvh-360px)] shrink-0 overflow-hidden shadow-[2px_0_4px_-2px_var(--color-border)]"
          style={{ width: STICKY_LEFT_WIDTH, ...OPAQUE }}
        >
          {data.rows.map((row) => (
            <Fragment key={`left-${row.key}`}>
              <div
                className={cn("flex h-14 border-b border-border text-xs", isMultiStage ? "font-semibold" : "hover:bg-accent/30")}
                style={OPAQUE}
              >
                <div className="flex items-center gap-1 px-2 text-left" style={{ width: W_GROUP }}>
                  <button
                    type="button"
                    onClick={() => onRowClick?.(row)}
                    className="truncate font-medium hover:underline"
                    title={row.label}
                  >{row.label}</button>
                </div>
                <div className="flex"><TotalDoneCells total={row.total} done={row.doneCount} bold /></div>
                <div className="flex"><PlanActualCells plan={row.cumPlan} actual={row.cumActual} asOfLabel={asOfLabel} bold /></div>
              </div>
              {isMultiStage && stages.map((st) => {
                const sr = row.stages[st];
                return (
                  <div key={`left-${row.key}-${st}`} className="flex h-14 border-b border-border text-[11px] hover:bg-accent/20" style={OPAQUE}>
                    <div className="flex items-center gap-2 px-2 pl-8 text-muted-foreground" style={{ width: W_GROUP }}>
                      <span className="inline-flex h-4 min-w-7 items-center justify-center rounded bg-secondary px-1 text-[9px] font-semibold text-secondary-foreground">
                        {STAGE_LABELS[st]}
                      </span>
                    </div>
                    <div className="flex"><TotalDoneCells total={sr.total} done={sr.totalDone} /></div>
                    <div className="flex"><PlanActualCells plan={sr.cumPlan} actual={sr.cumActual} asOfLabel={asOfLabel} /></div>
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>

        <div ref={bodyScrollRef} className="max-h-[calc(100dvh-360px)] min-w-0 flex-1 overflow-auto [scrollbar-gutter:stable]">
          <div style={{ width: timelineGridWidth, minWidth: timelineGridWidth }}>
            {data.rows.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">선택한 범위에 데이터가 없습니다.</div>
            )}
            {data.rows.map((row) => (
              <Fragment key={row.key}>
                <div className={cn("flex h-14 border-b border-border text-xs", isMultiStage ? "bg-muted/30 font-semibold" : "hover:bg-accent/30")}>
                  {leftPad > 0 && <div style={{ width: leftPad, minWidth: leftPad }} />}
                  {virtualCols.map((vc) => {
                    const c = row.combined[vc.index];
                    if (!c) return null;
                    return (
                      <TcScheduleCell
                        key={c.bucket}
                        plan={c.plan}
                        actual={c.actual}
                        isFuture={vc.index > todayBucketIdx}
                        isToday={vc.index === todayBucketIdx}
                        width={cellWidth}
                      />
                    );
                  })}
                  {rightPad > 0 && <div style={{ width: rightPad, minWidth: rightPad }} />}
                </div>

                {isMultiStage && stages.map((st) => {
                  const sr = row.stages[st];
                  return (
                    <div key={st} className="flex h-14 border-b border-border bg-muted/20 text-[11px] hover:bg-accent/20">
                      {leftPad > 0 && <div style={{ width: leftPad, minWidth: leftPad }} />}
                      {virtualCols.map((vc) => {
                        const c = sr.cells[vc.index];
                        if (!c) return null;
                        return (
                          <TcScheduleCell
                            key={c.bucket}
                            plan={c.plan}
                            actual={c.actual}
                            isFuture={vc.index > todayBucketIdx}
                            isToday={vc.index === todayBucketIdx}
                            width={cellWidth}
                            onPlanClick={onCellClick ? () => onCellClick(row, c.bucket, st, "planned") : undefined}
                            onActualClick={onCellClick ? () => onCellClick(row, c.bucket, st, "actual") : undefined}
                          />
                        );
                      })}
                      {rightPad > 0 && <div style={{ width: rightPad, minWidth: rightPad }} />}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
