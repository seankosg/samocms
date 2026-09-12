import { useCallback, useMemo, useState } from "react";
import { ArrowDownAZ, ArrowUpAZ, Download, Pencil, RotateCcw, Search, X } from "lucide-react";
import { ExportDialog, type ExportRow } from "@/components/export-dialog";
import { EditableCell } from "@/components/editable-cell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/use-auth";
import { numOrNull, useActivityEdit } from "@/lib/use-inline-edit";
import { dailyActual, dailyPlan, fmtDate, fmtShortDate, isLate, pct1, SLOT_LABEL, statusOfRow, STATUS_LABEL, type Row } from "@/lib/schedule-model";
import { useProject, usePrevActuals } from "@/lib/use-project";
import {
  DateRangeFilter, MultiSelectFilter, TextFilter, EMPTY_TOKEN,
  matchDate, matchMulti, matchText, type DateFilterValue, type TextFilterValue,
} from "@/components/column-filter";


type SortKey = "no" | "dept" | "bldg" | "act" | "pl" | "pc" | "e";
type TextKey = "no" | "room" | "scope" | "act" | "unit" | "pred" | "succ";
type MultiKey = "dept" | "bldg" | "ms" | "sub" | "mgr" | "status";
type DateKey = "s" | "e";
type ColFilter =
  | { kind: "text"; field: TextKey }
  | { kind: "sel"; field: MultiKey }
  | { kind: "date"; field: DateKey }
  | null;

const COLS: { key: SortKey | null; label: string; f: ColFilter }[] = [
  { key: "no", label: "No.", f: { kind: "text", field: "no" } },
  { key: "dept", label: "담당부서", f: { kind: "sel", field: "dept" } },
  { key: null, label: "담당자", f: { kind: "sel", field: "mgr" } },
  { key: "bldg", label: "Bldg.", f: { kind: "sel", field: "bldg" } },
  { key: null, label: "Room", f: { kind: "text", field: "room" } },
  { key: null, label: "Work Scope", f: { kind: "text", field: "scope" } },
  { key: null, label: "Milestone", f: { kind: "sel", field: "ms" } },
  { key: null, label: "Subcon", f: { kind: "sel", field: "sub" } },
  { key: "act", label: "Activity", f: { kind: "text", field: "act" } },
  { key: null, label: "Unit", f: { kind: "text", field: "unit" } },
  { key: null, label: "Done / Total", f: null },
  { key: "pl", label: "계획", f: null },
  { key: "pc", label: "실적", f: null },
  { key: null, label: "당일 계획(증분)", f: null },
  { key: null, label: "당일 실적(증분)", f: null },
  { key: null, label: "상태", f: { kind: "sel", field: "status" } },
  { key: null, label: "Predecessor", f: { kind: "text", field: "pred" } },
  { key: null, label: "Successor", f: { kind: "text", field: "succ" } },
  { key: null, label: "Start", f: { kind: "date", field: "s" } },
  { key: "e", label: "Finish", f: { kind: "date", field: "e" } },
];

const MULTI_LABEL: Record<MultiKey, string> = { dept: "담당부서", bldg: "Bldg.", ms: "Milestone", sub: "Subcon", mgr: "담당자", status: "상태" };

/** 담당자 표시값 (빈 값은 미지정) */
const MGR_NONE = "미지정";
const mgrLabel = (v: string | null) => (v && v.trim() ? v.trim() : MGR_NONE);

/** 컬럼 필터 비교값 = 화면 표시값 */
function multiValue(r: Row, k: MultiKey): string {
  if (k === "dept") return SLOT_LABEL[r.dept] ?? r.dept ?? "";
  if (k === "status") return STATUS_LABEL[statusOfRow(r)] ?? statusOfRow(r);
  if (k === "mgr") return mgrLabel(r.mgr);
  return String(r[k] ?? "");
}

export type TableInitial = Partial<{ dept: string; bldg: string; ms: string; sub: string; mgr: string; status: string; efrom: string; eto: string; q: string }>;

export function ScheduleTable({ rows, fileName, lockLate = false, initial, dueBy }: { rows: Row[]; fileName: string; lockLate?: boolean; initial?: TableInitial; dueBy?: string | null }) {
  const { canEdit, canWrite } = useAuth();
  const { base } = useProject();
  const prevActuals = usePrevActuals(base);
  const mut = useActivityEdit();
  const [edit, setEdit] = useState(false);
  const [q, setQ] = useState(initial?.q ?? "");

  const [exportOpen, setExportOpen] = useState(false);
  const [due, setDue] = useState<string | null>(dueBy ?? null);
  const [sort, setSort] = useState<SortKey>("e");
  const [asc, setAsc] = useState(true);
  const [multi, setMulti] = useState<Partial<Record<MultiKey, string[]>>>(() => {
    const init: Partial<Record<MultiKey, string[]>> = {};
    const put = (k: MultiKey, v: string | undefined) => { if (v && v !== "전체") init[k] = [v]; };
    put("dept", initial?.dept ? SLOT_LABEL[initial.dept] ?? initial.dept : undefined);
    put("bldg", initial?.bldg);
    put("ms", initial?.ms);
    put("sub", initial?.sub);
    put("mgr", initial?.mgr);
    put("status", initial?.status ? STATUS_LABEL[initial.status] ?? initial.status : undefined);
    return init;
  });
  const [texts, setTexts] = useState<Partial<Record<TextKey, TextFilterValue>>>({});
  const [dates, setDates] = useState<Partial<Record<DateKey, DateFilterValue>>>(() => {
    if (!initial?.efrom && !initial?.eto) return {};
    return { e: { ...(initial.efrom ? { from: initial.efrom } : {}), ...(initial.eto ? { to: initial.eto } : {}) } };
  });

  const setMultiCol = (k: MultiKey, v: string[] | undefined) => setMulti((o) => ({ ...o, [k]: v }));
  const setTextCol = (k: TextKey, v: TextFilterValue | undefined) => setTexts((o) => ({ ...o, [k]: v }));
  const setDateCol = (k: DateKey, v: DateFilterValue | undefined) => setDates((o) => {
    const next = { ...o }; if (v) next[k] = v; else delete next[k]; return next;
  });

  /** exclude: 해당 컬럼 필터 제외 판정 (facet 크로스 필터링) */
  const passes = (r: Row, exclude?: string) => {
    if (lockLate && !isLate(r)) return false;
    if (due && !(r.e && r.e <= due)) return false;
    if (q) {
      const hay = [r.no, r.dept, r.bldg, r.room, r.scope, r.ms, r.sub, r.mgr, r.act].join(" ").toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    for (const [k, v] of Object.entries(multi)) {
      if (k === exclude) continue;
      if (!matchMulti(multiValue(r, k as MultiKey), v)) return false;
    }
    for (const [k, v] of Object.entries(texts)) {
      if (k === exclude) continue;
      if (!matchText(r[k as TextKey], v)) return false;
    }
    for (const [k, v] of Object.entries(dates)) {
      if (k === exclude) continue;
      if (!matchDate(r[k as DateKey], v)) return false;
    }
    return true;
  };

  const filtered = useMemo(() => {
    const out = rows.filter((r) => passes(r));
    return out.sort((a, b) => {
      const av = a[sort] ?? "";
      const bv = b[sort] ?? "";
      const c = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return c * (asc ? 1 : -1);
    });
  }, [rows, q, due, sort, asc, lockLate, multi, texts, dates]);

  const facet = (k: MultiKey) => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (!passes(r, k)) continue;
      const v = multiValue(r, k).trim() || EMPTY_TOKEN;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [...counts.entries()].map(([value, count]) => ({ value, count }));
  };

  const chips = [
    ...(Object.entries(multi).filter(([, v]) => v && v.length) as [MultiKey, string[]][]).map(([k, v]) => ({
      k: MULTI_LABEL[k], v: v.length > 2 ? `${v[0]} 외 ${v.length - 1}` : v.join(", "), clear: () => setMultiCol(k, undefined),
    })),
    ...(Object.entries(texts).filter(([, v]) => v) as [TextKey, TextFilterValue][]).map(([k, v]) => ({
      k: k as string, v: v.emptyOnly ? "(비어 있음)" : v.text ?? "", clear: () => setTextCol(k, undefined),
    })),
    ...(Object.entries(dates) as [DateKey, DateFilterValue][]).map(([k, v]) => ({
      k: k === "s" ? "Start" : "Finish",
      v: v.emptyOnly ? "(비어 있음)" : `${v.from ?? ""}~${v.to ?? ""}`,
      clear: () => setDateCol(k, undefined),
    })),
    ...(due ? [{ k: "종료 예정", v: `${fmtDate(due)} 이내`, clear: () => setDue(null) }] : []),
    ...(q ? [{ k: "검색", v: q, clear: () => setQ("") }] : []),
  ];

  const reset = () => { setQ(""); setDue(null); setMulti({}); setTexts({}); setDates({}); };

  const exportRows = useCallback((): ExportRow[] => filtered.map((r) => ({
    group: r.sub ?? "",
    rec: {
      "No.": r.no, 담당부서: r.dept, 담당자: mgrLabel(r.mgr), "Bldg.": r.bldg, Room: r.room, "Work Scope": r.scope, Milestone: r.ms,
      Subcon: r.sub, Activity: r.act, Unit: r.unit, Done: r.done, Total: r.tot,
      "계획(%)": r.pl == null ? null : r.pl * 100, "실적(%)": r.pc == null ? null : r.pc * 100,
      "당일계획(%)": dailyPlan(r, base) == null ? null : dailyPlan(r, base)! * 100,
      "당일실적(%)": dailyActual(r, prevActuals) == null ? null : dailyActual(r, prevActuals)! * 100,
      상태: STATUS_LABEL[statusOfRow(r)], Predecessor: r.pred, Successor: r.succ, Start: r.s, Finish: r.e,
    },
  })), [filtered, base, prevActuals]);

  const setSortKey = (k: SortKey | null) => { if (!k) return; if (k === sort) setAsc((v) => !v); else { setSort(k); setAsc(true); } };

  return (
    <section className="rounded-md border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div className="relative w-full min-w-[200px] sm:w-auto sm:flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); }} placeholder="Activity · 건물 · 협력사 검색" className="h-9 pl-9" />
        </div>

        <Button variant="outline" size="sm" onClick={reset}><RotateCcw className="size-3.5" />초기화</Button>
        {canWrite && (
          <Button variant={edit ? "default" : "outline"} size="sm" onClick={() => setEdit((v) => !v)}>
            <Pencil className="size-3.5" />{edit ? "수정 종료" : "인라인 수정"}
          </Button>
        )}

        <Button size="sm" onClick={() => setExportOpen(true)}><Download className="size-3.5" />XLSX</Button>
        <ExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          title={`${fileName.replace(/\.xlsx$/, "").replace(/^HMMME_/, "")} 내보내기`}
          getRows={exportRows}
          fileBase={fileName.replace(/\.xlsx$/, "")}
          sheetName="Data"
        />
      </div>

      <div className="flex items-center gap-2 overflow-x-auto border-b border-border bg-muted/40 px-3 py-2 text-xs whitespace-nowrap sm:flex-wrap sm:whitespace-normal">
        <strong>{filtered.length.toLocaleString()}건</strong>
        {chips.map((c) => (
          <button key={`${c.k}-${c.v}`} onClick={() => { c.clear(); }} className="inline-flex items-center gap-1 rounded bg-accent px-2 py-1 text-[11px]">
            {c.k}: {c.v}<X className="size-3" />
          </button>
        ))}
        {chips.length > 1 && <button onClick={reset} className="text-[11px] font-semibold text-primary underline">전체 해제</button>}
      </div>

      <div className="max-h-[calc(100vh-330px)] overflow-auto">
        <table className="raw-table w-full min-w-[2100px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-secondary text-secondary-foreground">
            <tr>
              {COLS.map((c, i) => (
                <th key={c.label} className={`whitespace-nowrap border-b border-r border-border px-3 py-2.5 font-bold ${i === 0 ? "sticky left-0 z-20 bg-secondary" : ""}`}>

                  <span className="inline-flex items-center gap-1">
                    {c.key ? (
                      <button className="inline-flex items-center gap-1" onClick={() => setSortKey(c.key)}>
                        {c.label}{sort === c.key && (asc ? <ArrowDownAZ className="size-3" /> : <ArrowUpAZ className="size-3" />)}
                      </button>
                    ) : c.label}
                    {c.f?.kind === "sel" && (
                      <MultiSelectFilter options={facet(c.f.field)} selected={multi[c.f.field] ?? []} onChange={(v) => setMultiCol((c.f as { field: MultiKey }).field, v)} />
                    )}
                    {c.f?.kind === "text" && (
                      <TextFilter value={texts[c.f.field]} onChange={(v) => setTextCol((c.f as { field: TextKey }).field, v)} />
                    )}
                    {c.f?.kind === "date" && (
                      <DateRangeFilter value={dates[c.f.field]} onChange={(v) => setDateCol((c.f as { field: DateKey }).field, v)} />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const st = statusOfRow(r);
              const on = edit && canEdit(r.slot);
              const save = (patch: Record<string, unknown>) => mut.mutate({ id: r.id, patch });
              const cell = (v: string | number | null, k: string, kind: "text" | "number" | "date", map?: (x: string | null) => unknown) => (
                <EditableCell
                  value={v}
                  kind={kind}
                  editable={on}
                  {...(kind === "date" ? { display: fmtShortDate(v as string | null) } : {})}
                  onSave={(x) => save({ [k]: map ? map(x) : x })}
                />
              );
              return (
                <tr key={r.id} className={`border-b border-border ${st === "delay" ? "bg-destructive/5" : "bg-card"}`}>
                  <td className="sticky left-0 z-10 whitespace-nowrap border-r border-border bg-inherit px-3 py-2 font-medium">{r.no ?? "-"}</td>

                  <td className="px-3 py-2">{SLOT_LABEL[r.dept] ?? r.dept}</td>
                  <td className={`whitespace-nowrap px-3 py-2 ${r.mgr ? "" : "text-muted-foreground"}`}>{mgrLabel(r.mgr)}</td>
                  <td className="px-3 py-2">{cell(r.bldg, "building", "text")}</td>
                  <td className="px-3 py-2">{cell(r.room, "room", "text")}</td>
                  <td className="max-w-[200px] truncate px-3 py-2">{cell(r.scope, "work_scope", "text")}</td>
                  <td className="px-3 py-2">{cell(r.ms, "milestone", "text")}</td>
                  <td className="px-3 py-2">{cell(r.sub, "subcontractor", "text")}</td>
                  <td className="max-w-[340px] px-3 py-2 font-medium">
                    <EditableCell value={r.act} editable={on} onSave={(x) => x && save({ activity: x })} />
                  </td>
                  <td className="px-3 py-2">{cell(r.unit, "unit", "text")}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {on ? (
                      <span className="inline-flex items-center gap-1">
                        <EditableCell value={r.done ?? 0} kind="number" editable onSave={(x) => save({ done_quantity: numOrNull(x) })} />
                        /
                        <EditableCell value={r.tot ?? 0} kind="number" editable onSave={(x) => save({ total_quantity: numOrNull(x) })} />
                      </span>
                    ) : (
                      <>{r.done ?? 0} / {r.tot ?? 0}</>
                    )}
                  </td>
                  <td className="px-3 py-2"><Bar v={r.pl} muted /></td>
                  <td className="px-3 py-2">
                    {on ? (
                      <EditableCell
                        value={r.pc == null ? null : Math.round(r.pc * 1000) / 10}
                        kind="number"
                        editable
                        display={`${pct1(r.pc)}%`}
                        onSave={(x) => save({ actual_progress: x == null ? null : (numOrNull(x) ?? 0) / 100 })}
                      />
                    ) : (
                      <Bar v={r.pc} />
                    )}
                  </td>
                  <td className="px-3 py-2"><Delta v={dailyPlan(r, base)} /></td>
                  <td className="px-3 py-2"><Delta v={dailyActual(r, prevActuals)} /></td>
                  <td className="px-3 py-2"><Badge st={st} /></td>
                  <td className="px-3 py-2">{cell(r.pred, "predecessor", "text")}</td>
                  <td className="px-3 py-2">{cell(r.succ, "successor", "text")}</td>
                  <td className="whitespace-nowrap px-3 py-2">{cell(r.s, "start_date", "date")}</td>
                  <td className="whitespace-nowrap px-3 py-2">{cell(r.e, "finish_date", "date")}</td>
                </tr>
              );
            })}
          </tbody>

        </table>
      </div>

      <div className="border-t border-border p-3 text-xs text-muted-foreground">
        전체 {filtered.length.toLocaleString()}건 표시
      </div>
    </section>
  );
}

function Bar({ v, muted = false }: { v: number | null; muted?: boolean }) {
  const p = v == null ? 0 : Math.max(0, Math.min(100, v * 100));
  return (
    <div className="flex min-w-[92px] items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded bg-muted">
        <div className={`h-full ${muted ? "bg-chart-3" : "bg-primary"}`} style={{ width: `${p}%` }} />
      </div>
      <span className="w-10 text-right">{pct1(v)}%</span>
    </div>
  );
}

function Delta({ v }: { v: number | null }) {
  if (v == null) return <span className="text-muted-foreground">—</span>;
  const p = Math.round(v * 1000) / 10;
  const cls = p > 0 ? "text-primary font-semibold" : p < 0 ? "text-destructive font-semibold" : "text-muted-foreground";
  return <span className={`whitespace-nowrap ${cls}`}>{p > 0 ? "+" : ""}{p.toFixed(1)}%</span>;
}

function Badge({ st }: { st: string }) {
  const cls = st === "done" ? "bg-primary/10 text-primary" : st === "delay" ? "bg-destructive/10 text-destructive" : st === "ongoing" ? "bg-chart-2/15 text-foreground" : "bg-muted text-muted-foreground";
  return <span className={`inline-flex whitespace-nowrap rounded px-2 py-1 text-[10px] font-bold ${cls}`}>{STATUS_LABEL[st]}</span>;
}
