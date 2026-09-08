import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { projectQuery, useProject } from "@/lib/use-project";
import { fmtDate, flat } from "@/lib/schedule-model";
import { stageDone, TC_STAGES, type TcItem, type TcStage } from "@/lib/tc-model";

export const Route = createFileRoute("/tc/list")({
  head: () => ({ meta: [
    { title: "T&C List | HMMME 통합 공정 관리" },
    { name: "description", content: "시운전 전 항목의 단계별 계획일·실적일·잔여 수량을 한 표에서 확인하고 내보냅니다." },
    { property: "og:title", content: "HMMME T&C List" },
    { property: "og:description", content: "장비별 시운전 단계 계획과 실적 상세." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(projectQuery),
  errorComponent: () => <div role="alert" className="p-8">T&C 데이터를 불러오지 못했습니다.</div>,
  component: TcList,
});

const PLAN: Record<TcStage, keyof TcItem> = { T0: "t0_p", T1: "t1_p", Report: "rp_p", RFI: "rfi_p", T2: "t2_p", Response: "resp_p" };
const ACT: Record<TcStage, keyof TcItem> = { T0: "t0_a", T1: "t1_a", Report: "rp_a", RFI: "rfi_a", T2: "t2_a", Response: "resp_a" };
const REM: Partial<Record<TcStage, keyof TcItem>> = { T0: "t0_rem", T1: "t1_rem", Report: "rp_rem", RFI: "rfi_rem" };

type ColKey = "discipline" | "bldg" | "grp" | "item" | "equip" | "supplier" | "status" | "docref";
const COL_FILTERS: { key: ColKey; label: string }[] = [
  { key: "discipline", label: "공종" }, { key: "bldg", label: "Bldg." }, { key: "grp", label: "Group" },
  { key: "item", label: "Item" }, { key: "equip", label: "Equipment" },
];

function TcList() {
  const { tcItems, base } = useProject();
  const [q, setQ] = useState("");
  const [disc, setDisc] = useState("전체");
  const [bldg, setBldg] = useState("전체");
  const [only, setOnly] = useState("전체");
  const [colq, setColq] = useState<Partial<Record<ColKey, string>>>({});
  const setCol = (k: ColKey, v: string) => setColq((o) => ({ ...o, [k]: v }));
  const ColInput = ({ k }: { k: ColKey }) => (
    <input
      aria-label={`${k} 필터`} placeholder="필터" value={colq[k] ?? ""} onChange={(e) => setCol(k, e.target.value)}
      className="h-6 w-full min-w-[64px] rounded border border-input bg-background px-1 text-[10px] font-normal text-foreground"
    />
  );

  const bldgs = useMemo(() => [...new Set(tcItems.map((i) => i.bldg ?? "(미지정)"))].sort(), [tcItems]);
  const discs = useMemo(() => [...new Set(tcItems.map((i) => i.discipline))].sort(), [tcItems]);

  const rows = useMemo(() => tcItems.filter((r) => {
    if (disc !== "전체" && r.discipline !== disc) return false;
    if (bldg !== "전체" && (r.bldg ?? "(미지정)") !== bldg) return false;
    if (only === "지연" && !TC_STAGES.some((s) => !stageDone(r, s) && (r[PLAN[s]] as string | null) && (r[PLAN[s]] as string) <= base)) return false;
    if (only === "Fail" && flat(r.status).toLowerCase() !== "fail") return false;
    if (q) {
      const hay = [r.bldg, r.grp, r.item, r.equip, r.supplier, r.docref].join(" ").toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    for (const [k, v] of Object.entries(colq)) {
      if (!v) continue;
      if (!String(r[k as ColKey] ?? "").toLowerCase().includes(v.toLowerCase())) return false;
    }
    return true;
  }), [tcItems, q, disc, bldg, only, base, colq]);

  const exportXlsx = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map((r) => ({
      공종: r.discipline, "Bldg.": r.bldg, Group: r.grp, Item: r.item, Equipment: r.equip, "Q'ty": r.qty, Supplier: r.supplier,
      ...Object.fromEntries(TC_STAGES.flatMap((s) => [
        [`${s} Plan`, r[PLAN[s]]], [`${s} Actual`, r[ACT[s]]], [`${s} Remain`, REM[s] ? r[REM[s]!] : null],
      ])),
      Status: r.status, "Doc Reference": r.docref,
    }))), "T&C List");
    XLSX.writeFile(wb, "HMMME_TC_List.xlsx");
  };

  return (
    <AppShell title="T&C List" desc={`기준일 ${fmtDate(base)} · ${rows.length.toLocaleString()} / ${tcItems.length.toLocaleString()}건`}>
      <section className="rounded-md border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="장비 · 건물 · 공급사 검색" className="h-9 pl-9" />
          </div>
          <select aria-label="공종" value={disc} onChange={(e) => setDisc(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-xs">
            <option>전체</option>{discs.map((d) => <option key={d}>{d}</option>)}
          </select>
          <select aria-label="건물" value={bldg} onChange={(e) => setBldg(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-xs">
            <option>전체</option>{bldgs.map((d) => <option key={d}>{d}</option>)}
          </select>
          <select aria-label="상태" value={only} onChange={(e) => setOnly(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-xs">
            <option>전체</option><option>지연</option><option>Fail</option>
          </select>
          <Button size="sm" onClick={exportXlsx}><Download className="size-3.5" />XLSX</Button>
        </div>
        <div className="max-h-[calc(100vh-300px)] overflow-auto">
          <table className="w-full min-w-[1900px] border-collapse text-left text-[11px]">
            <thead className="sticky top-0 z-10 bg-secondary text-secondary-foreground">
              <tr>
                {["공종", "Bldg.", "Group", "Item", "Equipment", "Q'ty", "Supplier"].map((h) => (
                  <th key={h} className="whitespace-nowrap border-b border-r border-border px-2 py-2 font-bold">{h}</th>
                ))}
                {TC_STAGES.map((s) => (
                  <th key={s} className="whitespace-nowrap border-b border-r border-border px-2 py-2 text-center font-bold">
                    {s}<br /><span className="text-[9px] font-normal">계획 / 실적 / 잔여</span>
                  </th>
                ))}
                <th className="border-b border-r border-border px-2 py-2 font-bold">Status</th>
                <th className="border-b border-border px-2 py-2 font-bold">Doc Ref.</th>
              </tr>
              <tr>
                {COL_FILTERS.map((c) => (
                  <th key={c.key} className="border-b border-r border-border bg-secondary p-1"><ColInput k={c.key} /></th>
                ))}
                <th className="border-b border-r border-border bg-secondary p-1" />
                <th className="border-b border-r border-border bg-secondary p-1"><ColInput k="supplier" /></th>
                {TC_STAGES.map((s) => <th key={`f-${s}`} className="border-b border-r border-border bg-secondary p-1" />)}
                <th className="border-b border-r border-border bg-secondary p-1"><ColInput k="status" /></th>
                <th className="border-b border-border bg-secondary p-1"><ColInput k="docref" /></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border">
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
                    const rem = REM[s] ? Number(r[REM[s]!] ?? 0) : stageDone(r, s) ? 0 : Number(r.qty);
                    const late = !stageDone(r, s) && !!plan && plan <= base;
                    return (
                      <td key={s} className={`whitespace-nowrap border-r border-border px-2 py-1.5 text-center ${late ? "bg-destructive/10 font-semibold text-destructive" : ""}`}>
                        {fmtDate(plan)} / {fmtDate(act)} / {rem}
                      </td>
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
