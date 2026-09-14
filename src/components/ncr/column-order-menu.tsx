import { useState } from "react";
import { Columns3, GripVertical, Pin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { NCR_COL_MAP, NCR_DEFAULT_FROZEN, NCR_DEFAULT_ORDER } from "@/lib/ncr-columns";

/** 컬럼 순서(드래그)·노출(체크)·좌측 고정(pin) 설정 메뉴 */
export function NcrColumnMenu({
  order,
  visibility,
  frozen,
  onOrderChange,
  onVisibilityChange,
  onFrozenChange,
  onReset,
}: {
  order: string[];
  visibility: Record<string, boolean>;
  frozen: string[];
  onOrderChange: (next: string[]) => void;
  onVisibilityChange: (next: Record<string, boolean>) => void;
  onFrozenChange: (next: string[]) => void;
  onReset: () => void;
}) {
  const [dragKey, setDragKey] = useState<string | null>(null);
  const label = (k: string) => {
    const c = NCR_COL_MAP.get(k);
    return c ? (c.groupId ? `${c.groupId} ${c.label}` : c.label) : k;
  };

  const onDragOver = (k: string) => (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragKey || dragKey === k) return;
    const next = [...order];
    const from = next.indexOf(dragKey);
    const to = next.indexOf(k);
    if (from < 0 || to < 0) return;
    next.splice(from, 1);
    next.splice(to, 0, dragKey);
    onOrderChange(next);
  };

  const toggleFrozen = (k: string) =>
    onFrozenChange(frozen.includes(k) ? frozen.filter((x) => x !== k) : [...frozen, k]);

  const rowCls = (k: string) =>
    cn("group flex cursor-move items-center gap-1 rounded px-1 py-1 text-xs hover:bg-muted/50", dragKey === k && "opacity-50");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8"><Columns3 className="mr-1 size-3.5" />컬럼</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <div className="mb-2 flex items-center justify-between px-1 text-[11px] text-muted-foreground">
          <span>드래그로 순서 변경 · 핀으로 좌측 고정({frozen.length})</span>
          <button className="text-primary hover:underline" onClick={() => { onOrderChange([...NCR_DEFAULT_ORDER]); onVisibilityChange({}); onFrozenChange([...NCR_DEFAULT_FROZEN]); onReset(); }}>
            초기화
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto pr-1">
          <div className="mb-1 rounded bg-muted/50 px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">고정 컬럼</div>
          {frozen.map((k) => (
            <div key={k} className="flex items-center gap-1 rounded px-1 py-1 text-xs hover:bg-muted/50">
              <Pin className="size-3 text-primary" />
              <span className="flex-1 truncate">{label(k)}</span>
              <button className="text-[10px] text-muted-foreground hover:underline" onClick={() => toggleFrozen(k)}>해제</button>
            </div>
          ))}
          <div className="mb-1 mt-2 rounded bg-muted/50 px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">전체 컬럼</div>
          {order.map((k) => {
            if (frozen.includes(k)) return null;
            const hidden = visibility[k] === false;
            return (
              <div
                key={k}
                draggable
                onDragStart={() => setDragKey(k)}
                onDragOver={onDragOver(k)}
                onDragEnd={() => setDragKey(null)}
                className={rowCls(k)}
              >
                <GripVertical className="size-3 text-muted-foreground/40" />
                <Checkbox checked={!hidden} onCheckedChange={(c) => onVisibilityChange({ ...visibility, [k]: !!c })} className="size-3" />
                <span className={cn("flex-1 truncate", hidden && "text-muted-foreground/50")}>{label(k)}</span>
                <button className="text-[10px] text-muted-foreground hover:underline" onClick={() => toggleFrozen(k)} title="왼쪽 고정">고정</button>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
