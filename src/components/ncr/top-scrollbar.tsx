import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/** 표 위쪽에 붙는 가로 스크롤바 — 실제 스크롤 컨테이너와 동기화됩니다. */
export function TopHorizontalScrollbar({
  targetRef,
  width,
  frozenWidth = 0,
  className,
}: {
  targetRef: React.RefObject<HTMLDivElement | null>;
  width: number;
  frozenWidth?: number;
  className?: string;
}) {
  const selfRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  useEffect(() => {
    const target = targetRef.current;
    const self = selfRef.current;
    if (!target || !self) return;
    const onTarget = () => {
      if (syncing.current) return;
      syncing.current = true;
      self.scrollLeft = target.scrollLeft;
      requestAnimationFrame(() => { syncing.current = false; });
    };
    const onSelf = () => {
      if (syncing.current) return;
      syncing.current = true;
      target.scrollLeft = self.scrollLeft;
      requestAnimationFrame(() => { syncing.current = false; });
    };
    target.addEventListener("scroll", onTarget, { passive: true });
    self.addEventListener("scroll", onSelf, { passive: true });
    self.scrollLeft = target.scrollLeft;
    return () => {
      target.removeEventListener("scroll", onTarget);
      self.removeEventListener("scroll", onSelf);
    };
  }, [targetRef]);

  return (
    <div className={cn("flex h-[20px] shrink-0 border-b border-border bg-background", className)} aria-hidden>
      {frozenWidth > 0 && (
        <div style={{ width: frozenWidth, minWidth: frozenWidth }} className="sticky left-0 z-10 border-r border-border bg-background" />
      )}
      <div ref={selfRef} className="h-full flex-1 overflow-x-auto overflow-y-hidden bg-background">
        <div style={{ width: Math.max(width, 1), height: 1 }} />
      </div>
    </div>
  );
}
