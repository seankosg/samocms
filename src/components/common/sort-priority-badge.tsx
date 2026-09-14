import { cn } from "@/lib/utils";

/** 다중 정렬 우선순위 배지 — 정렬 컬럼이 1개면 숨깁니다. */
export function SortPriorityBadge({ index, total, className }: { index: number; total: number; className?: string }) {
  if (index < 0 || total < 2) return null;
  return (
    <span
      title={`정렬 우선순위 ${index + 1} / ${total}`}
      className={cn(
        "ml-0.5 inline-flex h-3.5 min-w-[0.875rem] flex-shrink-0 items-center justify-center rounded-sm bg-primary px-[3px] text-[9px] font-bold leading-none text-primary-foreground",
        className,
      )}
    >
      {index + 1}
    </span>
  );
}
