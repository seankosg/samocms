import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useCallback, useMemo, useState } from "react";
import { Download, Search, X } from "lucide-react";
import { ExportDialog, type ExportRow } from "@/components/export-dialog";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { projectQuery, useProject } from "@/lib/use-project";
import { fmtDate, fmtShortDate, flat } from "@/lib/schedule-model";
import { validateTcSearch } from "@/lib/list-search";
import { stageDone, TC_STAGES, type TcItem, type TcStage } from "@/lib/tc-model";
import {
  DateRangeFilter, MultiSelectFilter, TextFilter, EMPTY_TOKEN,
  matchDate, matchMulti, matchText, type DateFilterValue, type TextFilterValue,
} from "@/components/column-filter";

export const Route = createFileRoute("/_authenticated/tc/list")({
  head: () => ({ meta: [
    { title: "T&C List | HMMME 통합 공정 관리" },
    { name: "description", content: "시운전 전 항목의 단계별 계획일·실적일·잔여 수량을 한 표에서 확인하고 내보냅니다." },
    { property: "og:title", content: "HMMME T&C List" },
    { property: "og:description", content: "장비별 시운전 단계 계획과 실적 상세." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  validateSearch: validateTcSearch,
  loader: ({ context }) => context.queryClient.ensureQueryData(projectQuery),
  errorComponent: () => <div role="alert" className="p-8">T&C 데이터를 불러오지 못했습니다.</div>,
  component: TcList,
});

const PLAN: Record<TcStage, keyof TcItem> = { T0: "t0_p", T1: "t1_p", Report: "rp_p", RFI: "rfi_p", T2: "t2_p", Response: "resp_p" };
const ACT: Record<TcStage, keyof TcItem> = { T0: "t0_a", T1: "t1_a", Report: "rp_a", RFI: "rfi_a", T2: "t2_a", Response: "resp_a" };
const REM: Partial<Record<TcStage, keyof TcItem>> = { T0: "t0_rem", T1: "t1_rem", Report: "rp_rem", RFI: "rfi_rem" };

type MultiKey = "discipline" | "bldg" | "grp" | "item" | "supplier" | "status";
type TextKey = "equip" | "docref";
const MULTI_LABEL: Record<MultiKey, string> = { discipline: "공종", bldg: "Bldg.", grp: "Group", item: "Item", supplier: "Supplier", status: "Status" };

function remainOf(r: TcItem, s: TcStage) {
  const col = REM[s];
  return col ? Number(r[col] ?? 0) : stageDone(r, s) ? 0 : Number(r.qty);
}

function TcList() {
  const { tcItems, base } = useProject();
  const search = Route.useSearch();
  const [q, setQ] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [only, setOnly] = useState(search.only ?? "전체");
  const [multi, setMulti] = useState<Partial<Record<MultiKey, string[]>>>(() => {
    const init: Partial<Record<MultiKey, string[]>> = {};
    if (search.disc && search.disc !== "전체") init.discipline = [search.disc];
    if (search.bldg && search.bldg !== "전체") init.bldg = [search.bldg];
    if (search.item) init.item = [search.item];
    return init;
  });
  const [cellF, setCellF] = useState<{ stage?: TcStage; cell: string } | null>(
    search.cell ? { ...(TC_STAGES.includes(search.stage as TcStage) ? { stage: search.stage as TcStage } : {}), cell: search.cell } : null,
  );
  const [texts, setTexts] = useState<Partial<Record<TextKey, TextFilterValue>>>({});
  const [dates, setDates] = useState<Record<string, DateFilterValue>>({});

  const setMultiCol = (k: MultiKey, v: string[] | undefined) => setMulti((o) => ({ ...o, [k]: v }));
  const setTextCol = (k: TextKey, v: TextFilterValue | undefined) => setTexts((o) => ({ ...o, [k]: v }));
  const setDateCol = (k: string, v: DateFilterValue | undefined) => setDates((o) => {
    const next = { ...o }; if (v) next[k] = v; else delete next[k]; return next;
  });
  const clearAll = () => { setMulti({}); setTexts({}); setDates({}); setQ(""); setOnly("전체"); setCellF(null); };
  const activeCount =
    Object.values(multi).filter((v) => v && v.length).length +
    Object.values(texts).filter(Boolean).length + Object.keys(dates).length + (cellF ? 1 : 0);

  const CELL_LABEL: Record<string, string> = { done: "완료", remain: "잔여", late: "지연", pass: "Pass", fail: "Fail" };
  const cellChip = cellF ? `${cellF.stage ? `${cellF.stage} ` : ""}${CELL_LABEL[cellF.cell] ?? cellF.cell}` : "";

  /** exclude: 해당 컬럼 필터를 제외하고 판정 (facet 크로스 필터링용) */
  const passes = (r: TcItem, exclude?: string) => {
    if (only === "지연" && !TC_STAGES.some((s) => !stageDone(r, s) && (r[PLAN[s]] as string | null) && (r[PLAN[s]] as string) <= base)) return false;
    if (only === "Fail" && flat(r.status).toLowerCase() !== "fail") return false;
    if (cellF) {
      const st = flat(r.status).toLowerCase();
      if (cellF.cell === "pass" && st !== "pass") return false;
      if (cellF.cell === "fail" && st !== "fail") return false;
      if (cellF.stage) {
        const s = cellF.stage;
        const done = stageDone(r, s);
        const plan = r[PLAN[s]] as string | null;
        if (cellF.cell === "done" && !done) return false;
        if (cellF.cell === "remain" && done) return false;
        if (cellF.cell === "late" && (done || !plan || plan > base)) return false;
      }
    }
    if (q) {
      const hay = [r.bldg, r.grp, r.item, r.equip, r.supplier, r.docref].join(" ").toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    for (const [k, v] of Object.entries(multi)) {
      if (k === exclude) continue;
      if (!matchMulti(r[k as MultiKey], v)) return false;
    }
    for (const [k, v] of Object.entries(texts)) {
      if (k === exclude) continue;
      if (!matchText(r[k as TextKey], v)) return false;
    }
    for (const [k, v] of Object.entries(dates)) {
      if (k === exclude) continue;
      if (!matchDate(r[k as keyof TcItem], v)) return false;
    }
    return true;
  };

  const rows = useMemo(() => tcItems.filter((r) => passes(r)), [tcItems, q, only, multi, texts, dates, base, cellF]);

  const facet = (k: MultiKey) => {
    const counts = new Map<string, number>();
    for (const r of tcItems) {
      if (!passes(r, k)) continue;
      const v = String(r[k] ?? "").trim() || EMPTY_TOKEN;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [...counts.entries()].map(([value, count]) => ({ value, count }));
  };

  const exportRows = useCallback((): ExportRow[] => rows.map((r) => ({
    group: r.supplier ?? "",
    rec: {
      공종: r.discipline, "Bldg.": r.bldg, Group: r.grp, Item: r.item, Equipment: r.equip, "Q'ty": r.qty, Supplier: r.supplier,
      ...Object.fromEntries(TC_STAGES.flatMap((s) => [
        [`${s} 계획`, r[PLAN[s]]], [`${s} 실적`, r[ACT[s]]], [`${s} 잔여`, remainOf(r, s)],
      ])),
      Status: r.status, "Doc Reference": r.docref,
    },
  })), [rows]);


  const headCell = "whitespace-nowrap border-b border-r border-border px-2 py-1.5 font-bold";

  return (
    <AppShell title="T&C List" desc={`기준일 ${fmtDate(base)} · ${rows.length.toLocaleString()} / ${tcItems.length.toLocaleString()}건`}>
      <section className="rounded-md border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="장비 · 건물 · 공급사 검색" className="h-9 pl-9" />
          </div>
          <select aria-label="상태" value={only} onChange={(e) => setOnly(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-xs">
            <option>전체</option><option>지연</option><option>Fail</option>
          </select>
          {cellF && (
            <Button size="sm" variant="secondary" onClick={() => setCellF(null)}>
              <X className="size-3.5" />{cellChip}
            </Button>
          )}
          {activeCount > 0 && (
            <Button size="sm" variant="outline" onClick={clearAll}><X className="size-3.5" />필터 {activeCount}개 해제</Button>
          )}
          <Button size="sm" onClick={() => setExportOpen(true)}><Download className="size-3.5" />XLSX</Button>
          <ExportDialog
            open={exportOpen}
            onOpenChange={setExportOpen}
            title="T&C List 내보내기"
            getRows={exportRows}
            fileBase="HMMME_TC_List"
            sheetName="T&C List"
          />
        </div>
        <div className="max-h-[calc(100vh-300px)] overflow-auto">
          <table className="w-full min-w-[2400px] border-collapse text-left text-[11px]">
            <thead className="sticky top-0 z-10 bg-secondary text-secondary-foreground">
              <tr>
                {(["discipline", "bldg", "grp", "item"] as MultiKey[]).map((k) => (
                  <th key={k} rowSpan={2} className={headCell}>
                    <span className="inline-flex items-center gap-1">{MULTI_LABEL[k]}
                      <MultiSelectFilter options={facet(k)} selected={multi[k] ?? []} onChange={(v) => setMultiCol(k, v)} />
                    </span>
                  </th>
                ))}
                <th rowSpan={2} className={headCell}>
                  <span className="inline-flex items-center gap-1">Equipment
                    <TextFilter value={texts.equip} onChange={(v) => setTextCol("equip", v)} />
                  </span>
                </th>
                <th rowSpan={2} className={headCell}>Q'ty</th>
                <th rowSpan={2} className={headCell}>
                  <span className="inline-flex items-center gap-1">Supplier
                    <MultiSelectFilter options={facet("supplier")} selected={multi.supplier ?? []} onChange={(v) => setMultiCol("supplier", v)} />
                  </span>
                </th>
                {TC_STAGES.map((s) => (
                  <th key={s} colSpan={3} className="whitespace-nowrap border-b border-r border-border bg-primary/10 px-2 py-1.5 text-center font-bold">{s}</th>
                ))}
                <th rowSpan={2} className={headCell}>
                  <span className="inline-flex items-center gap-1">Status
                    <MultiSelectFilter options={facet("status")} selected={multi.status ?? []} onChange={(v) => setMultiCol("status", v)} />
                  </span>
                </th>
                <th rowSpan={2} className="whitespace-nowrap border-b border-border px-2 py-1.5 font-bold">
                  <span className="inline-flex items-center gap-1">Doc Ref.
                    <TextFilter value={texts.docref} onChange={(v) => setTextCol("docref", v)} />
                  </span>
                </th>
              </tr>
              <tr>
                {TC_STAGES.flatMap((s) => [
                  <th key={`${s}-p`} className="whitespace-nowrap border-b border-r border-border px-2 py-1 text-center text-[10px] font-semibold">
                    <span className="inline-flex items-center gap-1">계획
                      <DateRangeFilter value={dates[PLAN[s] as string]} onChange={(v) => setDateCol(PLAN[s] as string, v)} />
                    </span>
                  </th>,
                  <th key={`${s}-a`} className="whitespace-nowrap border-b border-r border-border px-2 py-1 text-center text-[10px] font-semibold">
                    <span className="inline-flex items-center gap-1">실적
                      <DateRangeFilter value={dates[ACT[s] as string]} onChange={(v) => setDateCol(ACT[s] as string, v)} />
                    </span>
                  </th>,
                  <th key={`${s}-r`} className="whitespace-nowrap border-b border-r border-border px-2 py-1 text-center text-[10px] font-semibold">잔여</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border hover:bg-muted/40">
                  <td className="border-r border-border px-2 py-1.5">{r.discipline}</td>
                  <td className="border-r border-border px-2 py-1.5">{r.bldg ?? "-"}</td>
                  <td className="border-r border-border px-2 py-1.5">{r.grp ?? "-"}</td>
                  <td className="border-r border-border px-2 py-1.5">{r.item ?? "-"}</td>
                  <td className="max-w-[240px] truncate border-r border-border px-2 py-1.5 font-medium">{r.equip ?? "-"}</td>
                  <td className="border-r border-border px-2 py-1.5 text-right">{Number(r.qty)}</td>
                  <td className="border-r border-border px-2 py-1.5">{r.supplier ?? "-"}</td>
                  {TC_STAGES.map((s) => {
                    const plan = r[PLAN[s]] as string | null;
                    const act = r[ACT[s]] as string | null;
                    const rem = remainOf(r, s);
                    const done = rem === 0;
                    const late = !stageDone(r, s) && !!plan && plan <= base;
                    const cell = `whitespace-nowrap border-r border-border px-2 py-1.5 text-center ${done ? "bg-muted text-muted-foreground" : ""}`;
                    return (
                      <Fragment key={s}>
                        <td className={cell}>{fmtShortDate(plan)}</td>
                        <td className={cell}>{fmtShortDate(act)}</td>
                        <td className={`${cell} ${late ? "bg-yellow-100 font-semibold text-destructive dark:bg-yellow-900/40" : ""}`}>{rem}</td>
                      </Fragment>
                    );
                  })}
                  <td className={`border-r border-border px-2 py-1.5 font-semibold ${flat(r.status).toLowerCase() === "fail" ? "text-destructive" : flat(r.status).toLowerCase() === "pass" ? "text-primary" : ""}`}>{r.status ?? "-"}</td>
                  <td className="max-w-[240px] truncate px-2 py-1.5">{r.docref ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
