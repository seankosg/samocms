import { useCallback, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import * as XLSX from "xlsx";
import { Download } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getManpowerEntries } from "@/lib/manpower.functions";
import { defaultRange } from "@/lib/use-manpower";
import { fmtDay, riyadhToday } from "@/lib/manpower-model";
import { MultiSelectFilter, matchMulti } from "@/components/column-filter";

type RawSource = "SUB" | "HDEC";
type Entry = {
  id: number;
  source: RawSource;
  status: string;
  submission_id: string;
  sheet_row: number;
  reporter_name: string | null;
  reporter_tg_id: string | null;
  company: string;
  report_date: string;
  report_time: string | null;
  location: string;
  shift: string;
  staff: number; safety_officer: number; operator: number; worker: number;
  electrician: number; scaffolder: number; plumber: number; subtotal: number;
  submitted_at: string | null;
  synced_at: string;
};

/** HDEC 재집계 기록을 확인자 부서 기준으로 HSE/EXE 로 분리 — SUB 은 그대로 */
function grpOf(source: RawSource, tgId: string | null, deptByTg: Map<string, string | null>): "SUB" | "HSE" | "EXE" {
  if (source === "SUB") return "SUB";
  const dept = tgId ? (deptByTg.get(tgId) ?? null) : null;
  return dept === "안전 (HSE)" || dept === "안전관리팀" ? "HSE" : "EXE";
}

const search = z.object({
  rawFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  rawTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const entriesQuery = (from: string, to: string) =>
  queryOptions({
    queryKey: ["manpower-entries", from, to],
    queryFn: () => getManpowerEntries({ data: { from, to } }),
    staleTime: 60_000,
  });

export const Route = createFileRoute("/_authenticated/manpower/raw")({
  head: () => ({ meta: [
    { title: "출면 Raw Data | HMMME PROJECT CMS" },
    { name: "description", content: "텔레그램 봇으로 입력된 출면 보고 원본 기록을 기간·항목별로 조회합니다." },
    { property: "og:title", content: "HMMME 출면 Raw Data" },
    { property: "og:description", content: "봇으로 입력된 모든 출면 기록 원본을 확인하세요." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  validateSearch: (s: unknown) => search.parse(s),
  loaderDeps: ({ search: s }) => {
    const d = defaultRange();
    return { from: s.rawFrom ?? d.from, to: s.rawTo ?? d.to };
  },
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(entriesQuery(deps.from, deps.to)),
  errorComponent: ({ error }) => <div role="alert" className="p-8 text-sm">Raw Data를 불러오지 못했습니다. {(error as Error).message}</div>,
  component: RawDataPage,
});

type Key = "report_date" | "source" | "status" | "company" | "location" | "shift" | "reporter" | "report_time";

const NUMS = [
  ["staff", "Staff"], ["safety_officer", "Safety"], ["operator", "Operator"], ["worker", "Worker"],
  ["electrician", "Elec"], ["scaffolder", "Scaf"], ["plumber", "Plumb"], ["subtotal", "Subtotal"],
] as const;

const fmtTs = (v: string | null) => (v ? new Date(v).toISOString().slice(0, 16).replace("T", " ") : "—");

function RawDataPage() {
  const s = Route.useSearch();
  const navigate = Route.useNavigate();
  const def = defaultRange();
  const from = s.rawFrom ?? def.from;
  const to = s.rawTo ?? def.to;
  const { data } = useSuspenseQuery(entriesQuery(from, to));
  const entries = data.entries as unknown as Entry[];
  const memberName = useMemo(() => {
    const m = new Map<string, string>();
    (data.members as { telegram_id: string; name: string }[]).forEach((x) => m.set(x.telegram_id, x.name));
    return m;
  }, [data.members]);
  const deptByTg = useMemo(() => {
    const m = new Map<string, string | null>();
    (data.members as { telegram_id: string; dept?: string | null }[]).forEach((x) => m.set(x.telegram_id, x.dept ?? null));
    return m;
  }, [data.members]);

  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Partial<Record<Key, string[]>>>({});

  const grp = useCallback((r: Entry) => grpOf(r.source, r.reporter_tg_id, deptByTg), [deptByTg]);

  const value = useCallback((r: Entry, key: Key): unknown => {
    if (key === "reporter") return r.reporter_name || (r.reporter_tg_id ? memberName.get(r.reporter_tg_id) : "") || "";
    if (key === "source") return grp(r);
    return r[key];
  }, [memberName, grp]);

  const searched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter((r) => !needle
      || `${r.company} ${r.location} ${r.shift} ${r.reporter_name ?? ""} ${r.submission_id}`.toLowerCase().includes(needle));
  }, [entries, q]);

  const facet = useCallback((key: Key) => {
    const counts = new Map<string, number>();
    for (const r of searched) {
      const token = String(value(r, key) ?? "").trim() || "__EMPTY__";
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    return [...counts].map(([v, count]) => ({ value: v, count }));
  }, [searched, value]);

  const setFilter = (key: Key, v: string[] | undefined) => setFilters((c) => ({ ...c, [key]: v }));

  const shown = useMemo(() => searched.filter((r) =>
    (Object.entries(filters) as [Key, string[] | undefined][]).every(([k, sel]) => matchMulti(value(r, k), sel))),
  [searched, filters, value]);

  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const [k] of NUMS) t[k] = shown.reduce((a, r) => a + (r[k] ?? 0), 0);
    return t;
  }, [shown]);

  const exportXlsx = () => {
    const rows = shown.map((r) => ({
      "Report Date": r.report_date, Source: r.source, Status: r.status,
      Company: r.company, Location: r.location, Shift: r.shift,
      Staff: r.staff, Safety: r.safety_officer, Operator: r.operator, Worker: r.worker,
      Elec: r.electrician, Scaf: r.scaffolder, Plumb: r.plumber, Subtotal: r.subtotal,
      Reporter: String(value(r, "reporter") ?? ""), "Reporter TG": r.reporter_tg_id ?? "",
      "Report Time": r.report_time ?? "", "Submitted At": fmtTs(r.submitted_at),
      "Submission ID": r.submission_id, "Sheet Row": r.sheet_row, "Synced At": fmtTs(r.synced_at),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Raw Data");
    XLSX.writeFile(wb, `Manpower Raw Data ${from}~${to}.xlsx`);
  };

  const active = entries.filter((r) => r.status === "ACTIVE").length;

  const th = (key: Key, label: string, right = false) => (
    <th scope="col" key={key}>
      <span className={`flex items-center gap-1 ${right ? "justify-end" : ""}`}>
        {label}
        <MultiSelectFilter options={facet(key)} selected={filters[key] ?? []} onChange={(v) => setFilter(key, v)} />
      </span>
    </th>
  );

  return (
    <AppShell
      title="Raw Data"
      desc={`${fmtDay(from)} ~ ${fmtDay(to)} · 전체 ${entries.length.toLocaleString()}건 (유효 ${active.toLocaleString()}건) · 표시 ${shown.length.toLocaleString()}건`}
      actions={
        <>
          <Input type="date" aria-label="시작일" value={from} max={to}
            onChange={(e) => navigate({ search: (p) => ({ ...p, rawFrom: e.target.value }), replace: true })}
            className="h-8 w-[150px] text-xs" />
          <span className="text-xs text-muted-foreground">~</span>
          <Input type="date" aria-label="종료일" value={to} max={riyadhToday()}
            onChange={(e) => navigate({ search: (p) => ({ ...p, rawTo: e.target.value }), replace: true })}
            className="h-8 w-[150px] text-xs" />
        </>
      }
    >
      <p className="mb-2 rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-700 dark:text-sky-300">
        기준: 봇으로 입력된 원본 기록 전체 · 재제출로 대체된 기록(SUPERSEDED) 포함 · 집계 화면은 ACTIVE만 사용
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="협력사·장소·입력자 검색" className="h-8 max-w-[240px] text-xs" />
        {Object.values(filters).some((v) => v?.length) && (
          <Button size="sm" variant="outline" onClick={() => setFilters({})}>필터 초기화</Button>
        )}
        <Button size="sm" onClick={exportXlsx} className="ml-auto"><Download className="size-3.5" />XLSX</Button>
      </div>

      <section className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[1400px] text-xs">
          <caption className="sr-only">봇으로 입력된 출면 기록 원본</caption>
          <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
            <tr className="[&>th]:border-b [&>th]:border-border [&>th]:px-2 [&>th]:py-2 [&>th]:text-left">
              {th("report_date", "Date")}
              {th("source", "Source")}
              {th("status", "Status")}
              {th("company", "Company")}
              {th("location", "Location")}
              {th("shift", "Shift")}
              {NUMS.map(([, label]) => <th key={label} scope="col" className="!text-right">{label}</th>)}
              {th("reporter", "Reporter")}
              {th("report_time", "Time")}
              <th scope="col">Submitted</th>
              <th scope="col">Submission ID</th>
            </tr>
          </thead>
          <tbody>
            {!!shown.length && (
              <tr className="bg-muted/40 font-bold [&>td]:border-b [&>td]:border-border [&>td]:px-2 [&>td]:py-1.5">
                <td>Total · {shown.length.toLocaleString()}건</td><td /><td /><td /><td /><td />
                {NUMS.map(([k]) => <td key={k} className="text-right">{(totals[k] ?? 0).toLocaleString()}</td>)}
                <td /><td /><td /><td />
              </tr>
            )}
            {shown.map((r) => (
              <tr key={r.id} className={`[&>td]:border-b [&>td]:border-border/60 [&>td]:px-2 [&>td]:py-1.5 ${r.status !== "ACTIVE" ? "text-muted-foreground/70 line-through decoration-muted-foreground/40" : ""}`}>
                <td className="tabular-nums">{r.report_date}</td>
                <td>{grp(r)}</td>
                <td>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${r.status === "ACTIVE" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>{r.status}</span>
                </td>
                <td className="font-medium">{r.company}</td>
                <td>{r.location}</td>
                <td>{r.shift}</td>
                {NUMS.map(([k]) => <td key={k} className="text-right tabular-nums">{r[k] ?? 0}</td>)}
                <td>{String(value(r, "reporter") ?? "") || "—"}</td>
                <td className="tabular-nums">{r.report_time ?? "—"}</td>
                <td className="tabular-nums text-muted-foreground">{fmtTs(r.submitted_at)}</td>
                <td className="max-w-[160px] truncate text-muted-foreground" title={r.submission_id}>{r.submission_id}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={20} className="p-6 text-center text-muted-foreground">해당 조건의 기록이 없습니다.</td></tr>}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
