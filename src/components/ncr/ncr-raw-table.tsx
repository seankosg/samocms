import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import { EditableCell } from "@/components/editable-cell";
import { SortPriorityBadge } from "@/components/common/sort-priority-badge";
import { TopHorizontalScrollbar } from "@/components/ncr/top-scrollbar";
import { NcrColumnMenu } from "@/components/ncr/column-order-menu";
import {
  MultiSelectFilter, TextFilter, DateRangeFilter, matchText, matchDate, matchMulti,
  EMPTY_TOKEN, type TextFilterValue, type DateFilterValue,
} from "@/components/column-filter";
import { NCR_COLUMNS, NCR_COL_MAP, NCR_DEFAULT_FROZEN, NCR_DEFAULT_ORDER, type NcrCol } from "@/lib/ncr-columns";
import { currentStage, type NcrDates } from "@/lib/ncr-model";
import type { NcrItem } from "@/lib/ncr.functions";

const LS_KEY = "hmmme.ncr.rawtable.v2";
const ROW_H = 34;

type Sort = { key: string; desc: boolean };
type FilterVal = string[] | TextFilterValue | DateFilterValue;

type Prefs = { order: string[]; visibility: Record<string, boolean>; frozen: string[]; sizing: Record<string, number> };

const defaultPrefs = (): Prefs => ({ order: [...NCR_DEFAULT_ORDER], visibility: {}, frozen: [...NCR_DEFAULT_FROZEN], sizing: {} });

function loadPrefs(): Prefs {
  if (typeof window === "undefined") return defaultPrefs();
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return defaultPrefs();
    const p = JSON.parse(raw) as Partial<Prefs>;
    const known = new Set(NCR_DEFAULT_ORDER);
    const order = [...(p.order ?? []).filter((k) => known.has(k))];
    for (const k of NCR_DEFAULT_ORDER) if (!order.includes(k)) order.push(k);
    return {
      order,
      visibility: p.visibility ?? {},
      frozen: (p.frozen ?? NCR_DEFAULT_FROZEN).filter((k) => known.has(k)),
      sizing: p.sizing ?? {},
    };
  } catch {
    return defaultPrefs();
  }
}

const dates = (r: NcrItem) => r as unknown as NcrDates;

export function cellValue(r: NcrItem, key: string): string | null {
  if (key === "current_stage") return currentStage(dates(r));
  const v = (r as unknown as Record<string, unknown>)[key];
  return v == null || v === "" ? null : String(v);
}

const fmtCell = (c: NcrCol, v: string | null) => {
  if (v == null) return "—";
  if (c.kind === "date") return v.slice(2).replace(/-/g, ".");
  return v;
};

export function NcrRawTable({
  rows,
  canEditRow,
  saving,
  onSave,
}: {
  rows: NcrItem[];
  canEditRow: (r: NcrItem) => boolean;
  saving: boolean;
  onSave: (id: number, patch: Record<string, string | null>) => void;
}) {
  const [prefs, setPrefs] = useState<Prefs>(defaultPrefs);
  const [sorts, setSorts] = useState<Sort[]>([]);
  const [filters, setFilters] = useState<Record<string, FilterVal | undefined>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setPrefs(loadPrefs()); }, []);
  const patchPrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try { window.localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* 저장 실패 무시 */ }
      return next;
    });
  }, []);

  // 표시 컬럼 — 고정 컬럼을 왼쪽으로 끌어올림
  const leaf = useMemo(() => {
    const visible = prefs.order.filter((k) => prefs.visibility[k] !== false && NCR_COL_MAP.has(k));
    const frozen = prefs.frozen.filter((k) => visible.includes(k));
    return [...frozen, ...visible.filter((k) => !frozen.includes(k))].map((k) => NCR_COL_MAP.get(k)!);
  }, [prefs]);
  const frozenSet = useMemo(() => new Set(prefs.frozen), [prefs.frozen]);
  const sizeOf = useCallback((c: NcrCol) => prefs.sizing[c.key] ?? c.width, [prefs.sizing]);

  const { lefts, frozenWidth, lastFrozenIdx, totalWidth } = useMemo(() => {
    const m = new Map<string, number>();
    let acc = 0, lastIdx = -1, total = 0;
    leaf.forEach((c, i) => {
      const w = sizeOf(c);
      if (frozenSet.has(c.key)) { m.set(c.key, acc); acc += w; lastIdx = i; }
      total += w;
    });
    return { lefts: m, frozenWidth: acc, lastFrozenIdx: lastIdx, totalWidth: total };
  }, [leaf, frozenSet, sizeOf]);

  // 필터 적용 (특정 컬럼 제외 가능 — facet 계산용)
  const passes = useCallback((r: NcrItem, skipKey?: string) => {
    for (const [key, f] of Object.entries(filters)) {
      if (!f || key === skipKey) continue;
      const col = NCR_COL_MAP.get(key);
      if (!col) continue;
      const v = cellValue(r, key);
      if (col.filter === "multi" && !matchMulti(v, f as string[])) return false;
      if (col.filter === "text" && !matchText(v, f as TextFilterValue)) return false;
      if (col.filter === "date" && !matchDate(v, f as DateFilterValue)) return false;
    }
    return true;
  }, [filters]);

  const filtered = useMemo(() => rows.filter((r) => passes(r)), [rows, passes]);

  const sorted = useMemo(() => {
    if (!sorts.length) return filtered;
    const arr = [...filtered];
    arr.sort((a, b) => {
      for (const s of sorts) {
        const col = NCR_COL_MAP.get(s.key);
        const va = cellValue(a, s.key);
        const vb = cellValue(b, s.key);
        if (va === vb) continue;
        if (va == null) return 1;
        if (vb == null) return -1;
        let d: number;
        if (col?.kind === "num") d = Number(va) - Number(vb);
        else d = va.localeCompare(vb, undefined, { numeric: true, sensitivity: "base" });
        if (d !== 0) return s.desc ? -d : d;
      }
      return 0;
    });
    return arr;
  }, [filtered, sorts]);

  const facetsFor = useCallback((key: string) => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (!passes(r, key)) continue;
      const v = cellValue(r, key);
      const k = v == null || v === "" ? EMPTY_TOKEN : v;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.entries()].map(([value, count]) => ({ value, count }));
  }, [rows, passes]);

  const toggleSort = (key: string, additive: boolean) => {
    setSorts((prev) => {
      const idx = prev.findIndex((s) => s.key === key);
      const cur = idx >= 0 ? prev[idx]! : null;
      const next: Sort | null = !cur ? { key, desc: false } : cur.desc ? null : { key, desc: true };
      if (!additive) return next ? [next] : [];
      const rest = prev.filter((s) => s.key !== key);
      return next ? [...rest, next] : rest;
    });
  };

  // 컬럼 폭 드래그
  const resizing = useRef<{ key: string; startX: number; startW: number } | null>(null);
  const startResize = (c: NcrCol) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizing.current = { key: c.key, startX: e.clientX, startW: sizeOf(c) };
    const move = (ev: MouseEvent) => {
      const st = resizing.current;
      if (!st) return;
      const w = Math.max(56, Math.min(640, st.startW + ev.clientX - st.startX));
      setPrefs((prev) => ({ ...prev, sizing: { ...prev.sizing, [st.key]: w } }));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setPrefs((prev) => {
        try { window.localStorage.setItem(LS_KEY, JSON.stringify(prev)); } catch { /* noop */ }
        return prev;
      });
      resizing.current = null;
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const virt = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 14,
  });
  const vRows = virt.getVirtualItems();
  const padTop = vRows.length ? vRows[0]!.start : 0;
  const padBottom = vRows.length ? virt.getTotalSize() - vRows[vRows.length - 1]!.end : 0;

  // 2단 헤더 그룹 병합
  const groups = useMemo(() => {
    const out: { id: string; label: string | null; span: number; keys: string[] }[] = [];
    for (const c of leaf) {
      const id = c.groupId ?? `__${c.key}`;
      const last = out[out.length - 1];
      if (last && last.id === id && c.groupId) { last.span += 1; last.keys.push(c.key); }
      else out.push({ id, label: c.groupId ? `${c.groupId} · ${c.group}` : null, span: 1, keys: [c.key] });
    }
    return out;
  }, [leaf]);

  const activeFilters = Object.entries(filters).filter(([, v]) => !!v).length;

  const stickyStyle = (c: NcrCol, z: number, bg: string): React.CSSProperties =>
    frozenSet.has(c.key) ? { position: "sticky", left: lefts.get(c.key) ?? 0, zIndex: z, background: bg } : {};

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {sorted.length.toLocaleString()} / {rows.length.toLocaleString()}건
          {activeFilters > 0 ? ` · 컬럼 필터 ${activeFilters}개` : ""}
          {sorts.length > 0 ? ` · 정렬 ${sorts.length}개` : ""}
        </span>
        {(activeFilters > 0 || sorts.length > 0) && (
          <button className="text-xs text-primary hover:underline" onClick={() => { setFilters({}); setSorts([]); }}>필터·정렬 해제</button>
        )}
        <div className="ml-auto">
          <NcrColumnMenu
            order={prefs.order}
            visibility={prefs.visibility}
            frozen={prefs.frozen}
            onOrderChange={(order) => patchPrefs({ order })}
            onVisibilityChange={(visibility) => patchPrefs({ visibility })}
            onFrozenChange={(frozen) => patchPrefs({ frozen })}
            onReset={() => patchPrefs({ sizing: {} })}
          />
        </div>
      </div>

      <div className="flex max-h-[calc(100dvh-320px)] flex-col overflow-hidden rounded-md border border-border bg-card shadow-sm">
        <TopHorizontalScrollbar targetRef={scrollRef} width={totalWidth} frozenWidth={frozenWidth} />
        <div ref={scrollRef} className="min-w-0 flex-1 overflow-auto [scrollbar-gutter:stable]">
          <table className="text-left text-xs" style={{ width: totalWidth, tableLayout: "fixed" }}>
            <colgroup>{leaf.map((c) => <col key={c.key} style={{ width: sizeOf(c) }} />)}</colgroup>
            <thead>
              <tr>
                {groups.map((g, gi) => {
                  const first = NCR_COL_MAP.get(g.keys[0]!)!;
                  const isSticky = g.span === 1 && frozenSet.has(first.key);
                  return (
                    <th
                      key={`${g.id}-${gi}`}
                      colSpan={g.span}
                      rowSpan={g.label ? 1 : 2}
                      className={cn(
                        "sticky top-0 z-[3] h-8 whitespace-nowrap border-b border-r border-border bg-secondary px-2 text-[11px] font-bold text-secondary-foreground",
                        g.label ? "text-center" : "align-bottom",
                      )}
                      style={isSticky ? { ...stickyStyle(first, 5, "var(--secondary)") } : {}}
                    >
                      {g.label ?? <HeaderCell
                        col={first}
                        sorts={sorts}
                        filters={filters}
                        facets={facetsFor}
                        onSort={toggleSort}
                        onFilter={(v) => setFilters((f) => ({ ...f, [first.key]: v }))}
                        onResize={startResize(first)}
                      />}
                    </th>
                  );
                })}
              </tr>
              <tr>
                {leaf.map((c, i) => {
                  if (!c.groupId) return null;
                  return (
                    <th
                      key={c.key}
                      className={cn(
                        "sticky top-8 z-[2] h-8 whitespace-nowrap border-b border-r border-border bg-secondary/70 px-2 text-[11px] font-semibold text-secondary-foreground",
                        i === lastFrozenIdx && "shadow-[2px_0_4px_-2px_var(--border)]",
                      )}
                    >
                      <HeaderCell
                        col={c}
                        sorts={sorts}
                        filters={filters}
                        facets={facetsFor}
                        onSort={toggleSort}
                        onFilter={(v) => setFilters((f) => ({ ...f, [c.key]: v }))}
                        onResize={startResize(c)}
                      />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={leaf.length} className="px-3 py-10 text-center text-muted-foreground">조건에 맞는 항목이 없습니다.</td></tr>
              ) : (
                <>
                  {padTop > 0 && <tr style={{ height: padTop }} aria-hidden><td colSpan={leaf.length} style={{ padding: 0, border: 0 }} /></tr>}
                  {vRows.map((vr) => {
                    const r = sorted[vr.index]!;
                    const editable = canEditRow(r);
                    const closed = currentStage(dates(r)) === "Closed";
                    const rowBg = closed ? "color-mix(in oklab, var(--muted) 45%, var(--card))" : "var(--card)";
                    return (
                      <tr
                        key={r.id}
                        style={{ height: ROW_H }}
                        className={cn("border-b border-border hover:bg-accent/30", closed && "text-muted-foreground")}
                      >
                        {leaf.map((c, i) => (
                          <td
                            key={c.key}
                            style={{ height: ROW_H, maxHeight: ROW_H, overflow: "hidden", ...stickyStyle(c, 1, rowBg) }}
                            className={cn(
                              "truncate whitespace-nowrap border-r border-border/60 px-2 py-1",
                              c.kind === "date" || c.kind === "num" ? "tabular-nums" : "",
                              i === lastFrozenIdx && "shadow-[2px_0_4px_-2px_var(--border)]",
                            )}
                            title={cellValue(r, c.key) ?? ""}
                          >
                            <Cell col={c} row={r} editable={editable} saving={saving} onSave={onSave} />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {padBottom > 0 && <tr style={{ height: padBottom }} aria-hidden><td colSpan={leaf.length} style={{ padding: 0, border: 0 }} /></tr>}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function HeaderCell({
  col, sorts, filters, facets, onSort, onFilter, onResize,
}: {
  col: NcrCol;
  sorts: Sort[];
  filters: Record<string, FilterVal | undefined>;
  facets: (key: string) => { value: string; count: number }[];
  onSort: (key: string, additive: boolean) => void;
  onFilter: (v: FilterVal | undefined) => void;
  onResize: (e: React.MouseEvent) => void;
}) {
  const idx = sorts.findIndex((s) => s.key === col.key);
  const cur = idx >= 0 ? sorts[idx]! : null;
  const f = filters[col.key];
  return (
    <div className="relative flex w-full items-center justify-between gap-1">
      <button
        type="button"
        className="inline-flex min-w-0 flex-1 items-center gap-1 truncate text-left"
        onClick={(e) => onSort(col.key, e.shiftKey)}
        title={`${col.group ? `${col.group} · ` : ""}${col.label} — 클릭 정렬, Shift+클릭 다중 정렬`}
      >
        <span className="truncate">{col.label}</span>
        {cur && (
          <span className="flex flex-shrink-0 items-center">
            <span>{cur.desc ? "▼" : "▲"}</span>
            <SortPriorityBadge index={idx} total={sorts.length} />
          </span>
        )}
      </button>
      {col.filter === "multi" && (
        <MultiSelectFilter options={facets(col.key)} selected={(f as string[]) ?? []} onChange={(v) => onFilter(v)} />
      )}
      {col.filter === "text" && <TextFilter value={f as TextFilterValue | undefined} onChange={(v) => onFilter(v)} />}
      {col.filter === "date" && <DateRangeFilter value={f as DateFilterValue | undefined} onChange={(v) => onFilter(v)} />}
      <span
        onMouseDown={onResize}
        title="드래그하여 폭 조절"
        className="absolute -right-2 top-0 h-full w-1.5 cursor-col-resize select-none hover:bg-primary/40"
      />
    </div>
  );
}

function Cell({ col, row, editable, saving, onSave }: {
  col: NcrCol;
  row: NcrItem;
  editable: boolean;
  saving: boolean;
  onSave: (id: number, patch: Record<string, string | null>) => void;
}) {
  const v = cellValue(row, col.key);
  if (col.kind === "status") {
    return (
      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold",
        v === "Closed" ? "bg-primary/15 text-primary" : v === "Reject" ? "bg-destructive/15 text-destructive" : "bg-chart-2/15 text-chart-2")}>
        {v ?? "—"}
      </span>
    );
  }
  if (col.kind === "stage") {
    return (
      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", v === "Closed" ? "bg-primary/15 text-primary" : "bg-secondary text-secondary-foreground")}>
        {v ?? "—"}
      </span>
    );
  }
  if (col.editable && editable) {
    return (
      <EditableCell
        value={v}
        kind={col.kind === "date" ? "date" : "text"}
        editable
        saving={saving}
        display={<span className={cn(col.kind === "date" && "tabular-nums")}>{fmtCell(col, v)}</span>}
        onSave={(nv) => onSave(row.id, { [col.key]: nv })}
      />
    );
  }
  return <span className={cn(v == null && "text-muted-foreground/50")}>{fmtCell(col, v)}</span>;
}
