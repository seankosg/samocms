import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ChevronsUpDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveTcMemo } from "@/lib/project.functions";
import {
  buildBlocks, memoMap, stageProgress, TC_STAGES, TC_STAGE_SUB, tcPct, type TcItem, type TcManual, type TcStage,
} from "@/lib/tc-model";

type SortKey = "loc" | "item" | "qty" | "pass" | "fail" | `${TcStage}-d` | `${TcStage}-r`;

export function TcView({ discipline, items, manual, base }: { discipline: string; items: TcItem[]; manual: TcManual[]; base: string }) {
  const [bldg, setBldg] = useState("전체");
  const qc = useQueryClient();
  const memos = useMemo(() => ({ center: memoMap(manual, discipline, "center"), right: memoMap(manual, discipline, "right") }), [manual, discipline]);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: (v: { block: "center" | "right"; itemKey: string; memo: string }) => saveTcMemo({ data: { discipline, ...v } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project"] });
      toast.success("메모가 저장되었습니다");
    },
    onError: (e: Error) => toast.error("저장 실패", { description: e.message }),
  });

  const bldgs = useMemo(() => [...new Set(items.map((i) => i.bldg ?? "(미지정)"))].sort(), [items]);
  const scoped = useMemo(() => (bldg === "전체" ? items : items.filter((i) => (i.bldg ?? "(미지정)") === bldg)), [items, bldg]);
  const prog = useMemo(() => stageProgress(scoped, base), [scoped, base]);
  const blocks = useMemo(() => buildBlocks(scoped, base), [scoped, base]);

  const memoValue = (block: "center" | "right", key: string) => draft[`${block}|${key}`] ?? memos[block][key] ?? "";

  const exportXlsx = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(blocks.center.map((r) => ({
      Location: r.loc, Item: r.item, "Q'ty": r.qty,
      ...Object.fromEntries(TC_STAGES.flatMap((s) => [[`${s} 완료`, r.st[s][0]], [`${s} 잔여`, r.st[s][1]], [`${s} 지연`, r.st[s][2]]])),
      Pass: r.pass, Fail: r.fail, 비고: r.key ? memoValue("center", r.key) : "",
    }))), "Ready for Operation");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(blocks.right.map((r) => ({
      Item: r.equip, Total: r.tot,
      ...Object.fromEntries(TC_STAGES.flatMap((s) => [[`${s} 완료`, r.st[s][0]], [`${s} 잔여`, r.st[s][1]], [`${s} 지연`, r.st[s][2]]])),
      Pass: r.pass, Fail: r.fail, 비고: memoValue("right", r.equip),
    }))), "Equipment Status");
    XLSX.writeFile(wb, `HMMME_${discipline}_TC.xlsx`);
  };

  if (!items.length) {
    return (
      <div className="rounded-md border border-dashed border-border bg-card p-10 text-center">
        <p className="text-sm font-semibold">아직 업로드된 {discipline} T&C 데이터가 없습니다.</p>
        <p className="mt-1 text-xs text-muted-foreground">업로드 화면에서 T&C 워크북을 올리면 이 화면이 채워집니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {TC_STAGES.map((s) => (
          <div key={s} className="rounded-md border border-border bg-card p-3 shadow-sm">
            <p className="text-xs font-bold">{s}</p>
            <p className="text-[10px] text-muted-foreground">{TC_STAGE_SUB[s]}</p>
            <strong className="mt-2 block text-xl">{tcPct(prog[s].pct)}</strong>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-muted">
              <div className="h-full bg-primary" style={{ width: `${Math.min(100, prog[s].pct * 100)}%` }} />
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              <Link
                to="/tc/list"
                search={{ disc: discipline, ...(bldg !== "전체" ? { bldg } : {}), stage: s, cell: "done" }}
                className="font-semibold text-primary underline-offset-2 hover:underline"
              >
                {prog[s].qty.toLocaleString()}
              </Link>
              {" / "}{prog._tot.toLocaleString()} · 계획 대비 {tcPct(prog[s].pvCap)}
            </p>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {["전체", ...bldgs].map((b) => (
            <button key={b} onClick={() => setBldg(b)} className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold ${bldg === b ? "border-primary bg-primary/10 text-primary" : "border-input bg-background text-muted-foreground"}`}>
              {b}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Pass {prog._pass.toLocaleString()} · Fail {prog._fail.toLocaleString()}</span>
          <Button size="sm" onClick={exportXlsx}><Download className="size-3.5" />XLSX</Button>
        </div>
      </div>

      <Block
        title="Ready for Operation (건물 × Item)" firstLabel="Location" secondLabel="Item"
        rows={blocks.center.map((r) => ({
          a: r.loc, b: r.item, qty: r.qty, st: r.st, pass: r.pass, fail: r.fail, key: r.key, typ: r.typ,
          fBldg: r.key ? (r.key.split("|")[0] ?? null) : bldg !== "전체" ? bldg : null,
          fItem: r.typ === "row" ? r.item : null,
        }))}
        discipline={discipline} block="center" memoValue={memoValue} setDraft={setDraft} save={save.mutate}
      />
      <Block
        title="Equipment Status (Item 합계)" firstLabel="Item" secondLabel={null}
        rows={blocks.right.map((r) => ({
          a: r.equip, b: null, qty: r.tot, st: r.st, pass: r.pass, fail: r.fail,
          key: r.equip === "Total" ? null : r.equip, typ: r.equip === "Total" ? "tot" : "row",
          fBldg: bldg !== "전체" ? bldg : null, fItem: r.equip === "Total" ? null : r.equip,
        }))}
        discipline={discipline} block="right" memoValue={memoValue} setDraft={setDraft} save={save.mutate}
      />
    </div>
  );
}

function DrillLink({ row, discipline, stage, cell, value }: { row: BlockRow; discipline: string; stage?: TcStage; cell: string; value: number }) {
  if (!value) return <span>{value}</span>;
  return (
    <Link
      to="/tc/list"
      search={{
        disc: discipline,
        ...(row.fBldg ? { bldg: row.fBldg } : {}),
        ...(row.fItem ? { item: row.fItem } : {}),
        ...(stage ? { stage } : {}),
        cell,
      }}
      className="underline-offset-2 hover:underline"
    >
      {value}
    </Link>
  );
}

type BlockRow = { a: string | null; b: string | null; qty: number; st: Record<TcStage, [number, number, number]>; pass: number; fail: number; key: string | null; typ: string; fBldg: string | null; fItem: string | null };

const cellVal = (r: BlockRow, k: SortKey): number | string => {
  if (k === "loc") return r.a ?? "";
  if (k === "item") return r.b ?? "";
  if (k === "qty") return r.qty;
  if (k === "pass") return r.pass;
  if (k === "fail") return r.fail;
  const [stage, which] = k.split("-") as [TcStage, "d" | "r"];
  return which === "d" ? r.st[stage][0] : r.st[stage][1];
};

function Block({ title, firstLabel, secondLabel, rows, discipline, block, memoValue, setDraft, save }: {
  title: string; firstLabel: string; secondLabel: string | null; rows: BlockRow[]; discipline: string;
  block: "center" | "right"; memoValue: (b: "center" | "right", k: string) => string;
  setDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  save: (v: { block: "center" | "right"; itemKey: string; memo: string }) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggle = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const cmp = (x: BlockRow, y: BlockRow) => {
      const vx = cellVal(x, sortKey), vy = cellVal(y, sortKey);
      const c = typeof vx === "number" && typeof vy === "number"
        ? vx - vy
        : String(vx ?? "").localeCompare(String(vy ?? ""), "ko");
      return sortDir === "asc" ? c : -c;
    };
    const tot = rows.filter((r) => r.typ === "tot");
    const body = rows.filter((r) => r.typ !== "tot");
    if (secondLabel) {
      // 건물 그룹(세그먼트) 보존: 각 세그먼트는 'sub' 행으로 끝남
      const segs: BlockRow[][] = [];
      let cur: BlockRow[] = [];
      for (const r of body) {
        cur.push(r);
        if (r.typ === "sub") { segs.push(cur); cur = []; }
      }
      if (cur.length) segs.push(cur);
      if (sortKey === "loc") {
        segs.sort((a, b) => cmp(a[0]!, b[0]!));
      } else {
        segs.forEach((seg) => {
          const bldg = seg[0]!.a;
          const items = seg.filter((r) => r.typ === "row").sort(cmp).map((r, i) => ({ ...r, a: i === 0 ? bldg : null }));
          const sub = seg.filter((r) => r.typ === "sub");
          seg.splice(0, seg.length, ...items, ...sub);
        });
      }
      return [...segs.flat(), ...tot];
    }
    return [...body.sort(cmp), ...tot];
  }, [rows, sortKey, sortDir, secondLabel]);

  const SortIcon = ({ k, className = "" }: { k: SortKey; className?: string }) => {
    const on = sortKey === k;
    const Icon = on ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
    return <Icon className={`size-3 shrink-0 ${on ? "text-primary-foreground" : "text-primary-foreground/40"} ${className}`} />;
  };

  const thBase = "border border-primary-foreground/15 px-2 py-1.5 text-center whitespace-nowrap";
  const thSort = (k: SortKey, label: React.ReactNode, align = "", rowSpan?: number) => (
    <th rowSpan={rowSpan} className={`${thBase} ${align} cursor-pointer select-none hover:bg-primary-foreground/10`} onClick={() => toggle(k)}>
      <span className="inline-flex items-center justify-center gap-1">{label}<SortIcon k={k} /></span>
    </th>
  );

  return (
    <section className="rounded-md border border-border bg-card shadow-sm">
      <p className="border-b border-border px-3 py-2 text-xs font-bold">{title}</p>
      <div className="max-h-[560px] overflow-auto">
        <table className="w-full min-w-[1500px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-primary text-primary-foreground">
            <tr>
              {thSort("loc", firstLabel, "text-left", 2)}
              {secondLabel && thSort("item", secondLabel, "text-left", 2)}
              {thSort("qty", <span>Q'ty</span>, "text-right", 2)}
              {TC_STAGES.map((s) => (
                <th key={s} colSpan={2} className={`${thBase} text-[11px] font-bold tracking-wide`}>{s}</th>
              ))}
              <th colSpan={2} className={`${thBase} text-[11px] font-bold tracking-wide`}>Status</th>
              <th rowSpan={2} className={`${thBase} text-left`}>비고</th>
            </tr>
            <tr className="bg-primary/85">
              {TC_STAGES.flatMap((s) => [
                thSort(`${s}-d` as SortKey, <span className="text-[10px] font-normal">완료</span>),
                thSort(`${s}-r` as SortKey, <span className="text-[10px] font-normal">잔여</span>),
              ])}
              {thSort("pass", <span className="text-[10px] font-normal">Pass</span>)}
              {thSort("fail", <span className="text-[10px] font-normal">Fail</span>)}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r, i) => (
              <tr key={i} className={`border-b border-border ${r.typ === "tot" ? "bg-primary/10 font-bold" : r.typ === "sub" ? "bg-muted/60 font-bold" : ""}`}>
                <td className="border-r border-border px-3 py-1.5">{r.a ?? ""}</td>
                {secondLabel && <td className="border-r border-border px-3 py-1.5">{r.b ?? ""}</td>}
                <td className="border-r border-border px-3 py-1.5 text-right tabular-nums">{r.qty.toLocaleString()}</td>
                {TC_STAGES.flatMap((s) => {
                  const [d, rem, late] = r.st[s];
                  return [
                    <td key={`${s}-d`} className="border-r border-border px-3 py-1.5 text-center whitespace-nowrap tabular-nums text-primary">
                      <DrillLink row={r} discipline={discipline} stage={s} cell="done" value={d} />
                    </td>,
                    <td key={`${s}-r`} className={`border-r border-border px-3 py-1.5 text-center whitespace-nowrap tabular-nums ${late ? "bg-yellow-200/70 font-bold text-destructive" : "text-muted-foreground"}`}>
                      <DrillLink row={r} discipline={discipline} stage={s} cell={late ? "late" : "remain"} value={rem} />
                    </td>,
                  ];
                })}
                <td className="border-r border-border px-3 py-1.5 text-center whitespace-nowrap tabular-nums">
                  <span className="text-primary"><DrillLink row={r} discipline={discipline} cell="pass" value={r.pass} /></span>
                </td>
                <td className="border-r border-border px-3 py-1.5 text-center whitespace-nowrap tabular-nums">
                  <span className={r.fail ? "font-bold text-destructive" : "text-muted-foreground"}>
                    <DrillLink row={r} discipline={discipline} cell="fail" value={r.fail} />
                  </span>
                </td>
                <td className="px-2 py-1">
                  {r.key ? (
                    <Input
                      className="h-7 text-xs" defaultValue={memoValue(block, r.key)} aria-label="비고"
                      onChange={(e) => setDraft((d) => ({ ...d, [`${block}|${r.key}`]: e.target.value }))}
                      onBlur={(e) => save({ block, itemKey: r.key!, memo: e.target.value })}
                    />
                  ) : (
                    <span className="text-muted-foreground">{r.key ? memoValue(block, r.key) : ""}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
