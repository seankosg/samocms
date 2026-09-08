import { useMemo, useState } from "react";
import { Filter } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export const EMPTY_TOKEN = "__EMPTY__";

export type TextFilterValue = { text?: string; emptyOnly?: boolean };
export type DateFilterValue = { from?: string; to?: string; emptyOnly?: boolean };

function TriggerButton({ active }: { active: boolean }) {
  return (
    <button
      type="button"
      title="필터"
      aria-label="필터"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "inline-flex h-4 w-4 items-center justify-center rounded hover:bg-muted/80",
        active ? "text-primary" : "text-muted-foreground/50",
      )}
    >
      <Filter className="h-3 w-3" />
    </button>
  );
}

/** 다중 선택 필터 — 값별 건수 표시 + 검색 + 전체선택/해제 */
export function MultiSelectFilter({
  options,
  selected,
  onChange,
}: {
  options: { value: string; count: number }[];
  selected: string[];
  onChange: (next: string[] | undefined) => void;
}) {
  const [query, setQuery] = useState("");
  const items = useMemo(() => {
    const counts = new Map(options.map((o) => [o.value, o.count]));
    for (const v of selected) if (!counts.has(v)) counts.set(v, 0);
    const empty = counts.get(EMPTY_TOKEN) ?? 0;
    counts.delete(EMPTY_TOKEN);
    const list = [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.value.localeCompare(b.value, undefined, { sensitivity: "base" })));
    return empty > 0 || selected.includes(EMPTY_TOKEN) ? [{ value: EMPTY_TOKEN, count: empty }, ...list] : list;
  }, [options, selected]);
  const filtered = useMemo(() => {
    const s = query.trim().toLowerCase();
    return s ? items.filter((i) => i.value.toLowerCase().includes(s)) : items;
  }, [items, query]);
  const toggle = (v: string) => {
    const next = selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v];
    onChange(next.length ? next : undefined);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <span><TriggerButton active={selected.length > 0} /></span>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start" onClick={(e) => e.stopPropagation()}>
        <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="검색..." className="mb-1 h-7 text-xs" />
        <div className="mb-1 flex items-center gap-2 px-1">
          <button className="text-[11px] text-muted-foreground hover:underline" onClick={() => onChange(filtered.map((o) => o.value))}>전체 선택</button>
          <button className="text-[11px] text-muted-foreground hover:underline" onClick={() => onChange(undefined)}>해제</button>
        </div>
        <div className="max-h-64 overflow-auto">
          {filtered.length === 0 && <div className="py-4 text-center text-[11px] text-muted-foreground">일치하는 값 없음</div>}
          {filtered.map((o) => (
            <label key={o.value} className={cn("flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted/50", o.count === 0 && "text-muted-foreground/60")}>
              <Checkbox checked={selected.includes(o.value)} onCheckedChange={() => toggle(o.value)} className="h-3.5 w-3.5" />
              <span className="flex-1 truncate">{o.value === EMPTY_TOKEN ? <em className="text-muted-foreground">(비어 있음)</em> : o.value}</span>
              <span className="text-[10px] tabular-nums text-muted-foreground">{o.count}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** 텍스트 필터 — 쉼표는 AND 조건 */
export function TextFilter({ value, onChange }: { value?: TextFilterValue; onChange: (v: TextFilterValue | undefined) => void }) {
  const text = value?.text ?? "";
  const emptyOnly = !!value?.emptyOnly;
  const update = (patch: TextFilterValue) => {
    const next = { ...(value ?? {}), ...patch };
    onChange(next.text || next.emptyOnly ? next : undefined);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <span><TriggerButton active={!!(text || emptyOnly)} /></span>
      </PopoverTrigger>
      <PopoverContent className="w-52 space-y-2 p-3" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-1">
          <button className="text-[11px] text-muted-foreground hover:underline" onClick={() => onChange(undefined)}>해제</button>
        </div>
        <Input placeholder="검색... (, 는 AND)" value={text} onChange={(e) => update({ text: e.target.value || undefined })} className="h-7 text-xs" disabled={emptyOnly} />
        <p className="text-[10px] text-muted-foreground">팁: 쉼표로 여러 조건을 모두 만족하는 항목만 표시</p>
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <Checkbox checked={emptyOnly} onCheckedChange={(c) => update({ emptyOnly: !!c, text: undefined })} className="h-3.5 w-3.5" />
          빈 값만
        </label>
      </PopoverContent>
    </Popover>
  );
}

/** 날짜 범위 필터 */
export function DateRangeFilter({ value, onChange }: { value?: DateFilterValue; onChange: (v: DateFilterValue | undefined) => void }) {
  const update = (patch: DateFilterValue) => {
    const next = { ...(value ?? {}), ...patch };
    onChange(next.from || next.to || next.emptyOnly ? next : undefined);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <span><TriggerButton active={!!(value?.from || value?.to || value?.emptyOnly)} /></span>
      </PopoverTrigger>
      <PopoverContent className="w-56 space-y-2 p-3" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-1">
          <button className="text-[11px] text-muted-foreground hover:underline" onClick={() => onChange(undefined)}>해제</button>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">From</label>
          <Input type="date" value={value?.from ?? ""} onChange={(e) => update({ from: e.target.value || undefined })} className="h-7 text-xs" disabled={!!value?.emptyOnly} />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">To</label>
          <Input type="date" value={value?.to ?? ""} onChange={(e) => update({ to: e.target.value || undefined })} className="h-7 text-xs" disabled={!!value?.emptyOnly} />
        </div>
        <label className="flex cursor-pointer items-center gap-2 pt-1 text-xs">
          <Checkbox checked={!!value?.emptyOnly} onCheckedChange={(c) => update({ emptyOnly: !!c, from: undefined, to: undefined })} className="h-3.5 w-3.5" />
          빈 값만
        </label>
      </PopoverContent>
    </Popover>
  );
}

export function matchText(raw: unknown, f?: TextFilterValue) {
  if (!f) return true;
  const v = String(raw ?? "").trim();
  if (f.emptyOnly) return v === "";
  if (!f.text) return true;
  const terms = f.text.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  const hay = v.toLowerCase();
  return terms.every((t) => hay.includes(t));
}

export function matchDate(raw: unknown, f?: DateFilterValue) {
  if (!f) return true;
  const v = raw ? String(raw).slice(0, 10) : "";
  if (f.emptyOnly) return v === "";
  if (!v) return false;
  if (f.from && v < f.from) return false;
  if (f.to && v > f.to) return false;
  return true;
}

export function matchMulti(raw: unknown, sel?: string[]) {
  if (!sel || sel.length === 0) return true;
  const v = String(raw ?? "").trim();
  return sel.includes(v === "" ? EMPTY_TOKEN : v);
}
