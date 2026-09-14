import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getCardHistory } from "@/lib/manpower.functions";
import { reporterLabel, riyadhTime, type MemberMap } from "@/lib/manpower-model";
import { fmtDay } from "@/lib/manpower-model";

type Props = {
  source: "SUB" | "HDEC";
  company: string;
  report_date: string;
  location: string;
  shift: string;
  memberMap: MemberMap;
  /** 대체된 이전 제출 횟수 (0이면 표시하지 않음) */
  superseded?: number;
  /** HDEC일 때 HSE/EXE 그룹 중 어느 이력인지 */
  group?: "HSE" | "EXE" | undefined;
  className?: string;
};

const TRADE_KEYS = [
  ["staff", "Staff"], ["safety_officer", "Safety"], ["operator", "Operator"], ["worker", "Worker"],
  ["electrician", "Elec"], ["scaffolder", "Scaf"], ["plumber", "Plumb"], ["subtotal", "소계"],
] as const;

type Entry = Awaited<ReturnType<typeof getCardHistory>>[number];

/** 카드 제출 이력 — 대체된 보고가 있을 때 나타나는 뱃지 + 상세 대화상자 */
export function CardHistoryButton({ source, company, report_date, location, shift, memberMap, superseded = 0, group, className }: Props) {
  const [open, setOpen] = useState(false);
  if (!superseded) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex cursor-pointer items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 hover:bg-amber-500/25 dark:text-amber-300 ${className ?? ""}`}
        title="이전 제출 이력 보기"
      >
        <History className="size-3" />재제출 {superseded}회
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">제출 이력</DialogTitle>
            <DialogDescription className="text-xs">
              {company} · {location} · {shift} · {fmtDay(report_date)}{source === "HDEC" && group ? ` · ${group}` : ""}
            </DialogDescription>
          </DialogHeader>
          <CardHistoryBody source={source} company={company} report_date={report_date} location={location} shift={shift} memberMap={memberMap} group={group} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function CardHistoryBody(props: Omit<Props, "superseded">) {
  const { data, isPending, error } = useQuery({
    queryKey: ["manpower-history", props.source, props.company, props.report_date, props.location, props.shift, props.group ?? ""],
    queryFn: () => getCardHistory({ data: { source: props.source, company: props.company, report_date: props.report_date, location: props.location, shift: props.shift, group: props.group } }),
  });
  if (isPending) return <p className="p-4 text-xs text-muted-foreground">불러오는 중…</p>;
  if (error) return <p role="alert" className="p-4 text-xs text-destructive">이력을 불러오지 못했습니다. {(error as Error).message}</p>;
  const rows = (data ?? []) as Entry[];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <caption className="sr-only">카드 제출 이력</caption>
        <thead className="bg-muted/60">
          <tr className="[&>th]:border-b [&>th]:border-border [&>th]:px-2 [&>th]:py-1.5 [&>th]:text-left">
            <th scope="col">상태</th><th scope="col">제출시각</th><th scope="col">입력자</th>
            {TRADE_KEYS.map(([k, label]) => <th key={k} scope="col" className="text-right">{label}</th>)}
            <th scope="col" className="text-right">증감</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const prev = rows[i + 1];
            const delta = prev ? (r.subtotal ?? 0) - (prev.subtotal ?? 0) : null;
            const supersededRow = r.status !== "ACTIVE";
            const who = reporterLabel(props.memberMap, r.reporter_tg_id, r.reporter_name);
            return (
              <tr key={r.id} className={`[&>td]:border-b [&>td]:border-border/60 [&>td]:px-2 [&>td]:py-1.5 ${supersededRow ? "text-muted-foreground line-through decoration-border/70" : ""}`}>
                <td className={supersededRow ? "" : "font-semibold text-emerald-600 dark:text-emerald-400"}>
                  {supersededRow ? "대체됨" : "현재"}
                </td>
                <td className="whitespace-nowrap">{r.submitted_at ? riyadhTime(r.submitted_at) : "—"}</td>
                <td className="whitespace-nowrap">
                  {who.text}{!who.registered && <span className="text-[10px]"> (미등록)</span>}
                </td>
                {TRADE_KEYS.map(([k]) => <td key={k} className="text-right">{r[k] ?? "—"}</td>)}
                <td className={`text-right font-semibold ${delta == null ? "" : delta > 0 ? "text-emerald-600" : delta < 0 ? "text-destructive" : ""}`}>
                  {delta == null ? "—" : delta > 0 ? `+${delta}` : delta}
                </td>
              </tr>
            );
          })}
          {!rows.length && <tr><td colSpan={12} className="p-6 text-center text-muted-foreground">이력이 없습니다.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
