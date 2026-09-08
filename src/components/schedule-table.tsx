import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { ArrowDownAZ, ArrowUpAZ, Download, RotateCcw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtDate, isLate, pct1, SLOT_LABEL, statusOfRow, STATUS_LABEL, type Row } from "@/lib/schedule-model";

type SortKey = "no" | "dept" | "bldg" | "act" | "pl" | "pc" | "e";
type TextKey = "no" | "room" | "scope" | "act" | "unit" | "pred" | "succ" | "s" | "e";
type ColFilter = { kind: "text"; field: TextKey } | { kind: "sel"; field: "dept" | "bldg" | "ms" | "sub" | "status" } | null;
const COLS: { key: SortKey | null; label: string; f: ColFilter }[] = [
  { key: "no", label: "No.", f: { kind: "text", field: "no" } },
  { key: "dept", label: "담당부서", f: { kind: "sel", field: "dept" } },
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
  { key: null, label: "상태", f: { kind: "sel", field: "status" } },
  { key: null, label: "Predecessor", f: { kind: "text", field: "pred" } },
  { key: null, label: "Successor", f: { kind: "text", field: "succ" } },
  { key: null, label: "Start", f: { kind: "text", field: "s" } },
  { key: "e", label: "Finish", f: { kind: "text", field: "e" } },
];

export type TableInitial = Partial<{ dept: string; bldg: string; ms: string; sub: string; status: string; q: string }>;

export function ScheduleTable({ rows, fileName, lockLate = false, initial, dueBy }: { rows: Row[]; fileName: string; lockLate?: boolean; initial?: TableInitial; dueBy?: string | null }) {
  const [q, setQ] = useState(initial?.q ?? "");
  const [dept, setDept] = useState(initial?.dept ?? "전체");
  const [bldg, setBldg] = useState(initial?.bldg ?? "전체");
  const [ms, setMs] = useState(initial?.ms ?? "전체");
  const [sub, setSub] = useState(initial?.sub ?? "전체");
  const [status, setStatus] = useState(initial?.status ?? "전체");
  const [due, setDue] = useState<string | null>(dueBy ?? null);
  const [sort, setSort] = useState<SortKey>("e");
  const [asc, setAsc] = useState(true);
  const [colq, setColq] = useState<Partial<Record<TextKey, string>>>({});
  const setCol = (k: TextKey, v: string) => { setColq((o) => ({ ...o, [k]: v })); };
  const selValue = { dept, bldg, ms, sub, status } as const;
  const selSet = { dept: setDept, bldg: setBldg, ms: setMs, sub: setSub, status: setStatus } as const;


  const opts = useMemo(() => ({
    dept: [...new Set(rows.map((r) => r.dept))].sort(),
    bldg: [...new Set(rows.map((r) => r.bldg).filter(Boolean))].sort() as string[],
    ms: [...new Set(rows.map((r) => r.ms).filter(Boolean))].sort() as string[],
    sub: [...new Set(rows.map((r) => r.sub).filter(Boolean))].sort() as string[],
  }), [rows]);

  const chips = [
    dept !== "전체" && { k: "공종", v: SLOT_LABEL[dept] ?? dept, clear: () => setDept("전체") },
    bldg !== "전체" && { k: "건물", v: bldg, clear: () => setBldg("전체") },
    ms !== "전체" && { k: "마일스톤", v: ms, clear: () => setMs("전체") },
    sub !== "전체" && { k: "협력사", v: sub, clear: () => setSub("전체") },
    status !== "전체" && { k: "상태", v: STATUS_LABEL[status] ?? status, clear: () => setStatus("전체") },
    due && { k: "종료 예정", v: `${fmtDate(due)} 이내`, clear: () => setDue(null) },
    q && { k: "검색", v: q, clear: () => setQ("") },
  ].filter(Boolean) as { k: string; v: string; clear: () => void }[];

  const filtered = useMemo(() => {
    const out = rows.filter((r) => {
      if (lockLate && !isLate(r)) return false;
      if (dept !== "전체" && r.dept !== dept && r.slot !== dept) return false;
      if (bldg !== "전체" && r.bldg !== bldg) return false;
      if (ms !== "전체" && r.ms !== ms) return false;
      if (sub !== "전체" && r.sub !== sub) return false;
      if (status !== "전체" && statusOfRow(r) !== status) return false;
      if (due && !(r.e && r.e <= due)) return false;
      if (q) {
        const hay = [r.no, r.dept, r.bldg, r.room, r.scope, r.ms, r.sub, r.act].join(" ").toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      for (const [k, v] of Object.entries(colq)) {
        if (!v) continue;
        if (!String(r[k as TextKey] ?? "").toLowerCase().includes(v.toLowerCase())) return false;
      }
      return true;
    });
    return out.sort((a, b) => {
      const av = a[sort] ?? "";
      const bv = b[sort] ?? "";
      const c = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return c * (asc ? 1 : -1);
    });
  }, [rows, q, dept, bldg, ms, sub, status, due, sort, asc, lockLate, colq]);

  const shown = filtered;

  const reset = () => { setQ(""); setDept("전체"); setBldg("전체"); setMs("전체"); setSub("전체"); setStatus("전체"); setDue(null); setColq({}); };

  const exportXlsx = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filtered.map((r) => ({
      "No.": r.no, 담당부서: r.dept, "Bldg.": r.bldg, Room: r.room, "Work Scope": r.scope, Milestone: r.ms,
      Subcon: r.sub, Activity: r.act, Unit: r.unit, Done: r.done, Total: r.tot,
      "계획(%)": r.pl == null ? null : r.pl * 100, "실적(%)": r.pc == null ? null : r.pc * 100,
      상태: STATUS_LABEL[statusOfRow(r)], Predecessor: r.pred, Successor: r.succ, Start: r.s, Finish: r.e,
    }))), "Data");
    XLSX.writeFile(wb, fileName);
  };
  const setSortKey = (k: SortKey | null) => { if (!k) return; if (k === sort) setAsc((v) => !v); else { setSort(k); setAsc(true); } };

  const Sel = ({ label, value, set, list, render }: { label: string; value: string; set: (v: string) => void; list: string[]; render?: (v: string) => string }) => (
    <select aria-label={label} value={value} onChange={(e) => { set(e.target.value); }} className="h-9 rounded-md border border-input bg-background px-2 text-xs">
      <option value="전체">{label}: 전체</option>
      {list.map((x) => <option key={x} value={x}>{render ? render(x) : x}</option>)}
    </select>
  );

  return (
    <section className="rounded-md border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); }} placeholder="Activity · 건물 · 협력사 검색" className="h-9 pl-9" />
        </div>
        <Sel label="공종" value={dept} set={setDept} list={opts.dept} render={(x) => SLOT_LABEL[x] ?? x} />
        <Sel label="건물" value={bldg} set={setBldg} list={opts.bldg} />
        <Sel label="마일스톤" value={ms} set={setMs} list={opts.ms} />
        <Sel label="협력사" value={sub} set={setSub} list={opts.sub} />
        {!lockLate && <Sel label="상태" value={status} set={setStatus} list={["done", "ongoing", "plan", "delay"]} render={(x) => STATUS_LABEL[x]!} />}
        <Button variant="outline" size="sm" onClick={reset}><RotateCcw className="size-3.5" />초기화</Button>
        <Button size="sm" onClick={exportXlsx}><Download className="size-3.5" />XLSX</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs">
        <strong>{filtered.length.toLocaleString()}건</strong>
        {chips.map((c) => (
          <button key={c.k} onClick={() => { c.clear(); }} className="inline-flex items-center gap-1 rounded bg-accent px-2 py-1 text-[11px]">
            {c.k}: {c.v}<X className="size-3" />
          </button>
        ))}
        {chips.length > 1 && <button onClick={reset} className="text-[11px] font-semibold text-primary underline">전체 해제</button>}
      </div>

      <div className="max-h-[calc(100vh-330px)] overflow-auto">
        <table className="raw-table w-full min-w-[1780px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-secondary text-secondary-foreground">
            <tr>
              {COLS.map((c) => (
                <th key={c.label} className="whitespace-nowrap border-b border-r border-border px-3 py-2.5 font-bold">
                  {c.key ? (
                    <button className="inline-flex items-center gap-1" onClick={() => setSortKey(c.key)}>
                      {c.label}{sort === c.key && (asc ? <ArrowDownAZ className="size-3" /> : <ArrowUpAZ className="size-3" />)}
                    </button>
                  ) : c.label}
                </th>
              ))}
            </tr>
            <tr>
              {COLS.map((c) => (
                <th key={`f-${c.label}`} className="border-b border-r border-border bg-secondary p-1">
                  {c.f?.kind === "text" && (
                    <input
                      aria-label={`${c.label} 필터`} placeholder="필터"
                      value={colq[c.f.field] ?? ""} onChange={(e) => setCol((c.f as { field: TextKey }).field, e.target.value)}
                      className="h-7 w-full min-w-[70px] rounded border border-input bg-background px-1.5 text-[11px] font-normal text-foreground"
                    />
                  )}
                  {c.f?.kind === "sel" && (
                    <select
                      aria-label={`${c.label} 필터`} value={selValue[c.f.field]}
                      onChange={(e) => { selSet[(c.f as { field: keyof typeof selSet }).field](e.target.value); }}
                      className="h-7 w-full min-w-[80px] rounded border border-input bg-background px-1 text-[11px] font-normal text-foreground"
                    >
                      <option value="전체">전체</option>
                      {(c.f.field === "status" ? ["done", "ongoing", "plan", "delay"] : opts[c.f.field as "dept" | "bldg" | "ms" | "sub"]).map((x) => (
                        <option key={x} value={x}>{c.f!.field === "status" ? STATUS_LABEL[x] : c.f!.field === "dept" ? SLOT_LABEL[x] ?? x : x}</option>
                      ))}
                    </select>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const st = statusOfRow(r);
              return (
                <tr key={r.id} className={`border-b border-border ${st === "delay" ? "bg-destructive/5" : ""}`}>
                  <td className="whitespace-nowrap border-r border-border px-3 py-2 font-medium">{r.no ?? "-"}</td>
                  <td className="px-3 py-2">{SLOT_LABEL[r.dept] ?? r.dept}</td>
                  <td className="px-3 py-2">{r.bldg ?? "-"}</td>
                  <td className="px-3 py-2">{r.room ?? "-"}</td>
                  <td className="max-w-[200px] truncate px-3 py-2">{r.scope ?? "-"}</td>
                  <td className="px-3 py-2">{r.ms ?? "-"}</td>
                  <td className="px-3 py-2">{r.sub ?? "-"}</td>
                  <td className="max-w-[340px] px-3 py-2 font-medium">{r.act}</td>
                  <td className="px-3 py-2">{r.unit ?? "-"}</td>
                  <td className="px-3 py-2">{r.done ?? 0} / {r.tot ?? 0}</td>
                  <td className="px-3 py-2"><Bar v={r.pl} muted /></td>
                  <td className="px-3 py-2"><Bar v={r.pc} /></td>
                  <td className="px-3 py-2"><Badge st={st} /></td>
                  <td className="px-3 py-2">{r.pred ?? "-"}</td>
                  <td className="px-3 py-2">{r.succ ?? "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2">{fmtDate(r.s)}</td>
                  <td className="whitespace-nowrap px-3 py-2">{fmtDate(r.e)}</td>
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

function Badge({ st }: { st: string }) {
  const cls = st === "done" ? "bg-primary/10 text-primary" : st === "delay" ? "bg-destructive/10 text-destructive" : st === "ongoing" ? "bg-chart-2/15 text-foreground" : "bg-muted text-muted-foreground";
  return <span className={`inline-flex whitespace-nowrap rounded px-2 py-1 text-[10px] font-bold ${cls}`}>{STATUS_LABEL[st]}</span>;
}
