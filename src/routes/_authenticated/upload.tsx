import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { AlertTriangle, FileSpreadsheet, Loader2, UploadCloud } from "lucide-react";
import { useAuth } from "@/lib/use-auth";
import { SCOPE_LABEL } from "@/lib/roster";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { projectQuery, useProject } from "@/lib/use-project";
import { parseScheduleFile, sourceKeyFromFileName } from "@/lib/import-schedule";
import { isTcWorkbook, metaFromFileName, parseTcWorkbook, type TcImportRow } from "@/lib/import-tc";
import { importActivities } from "@/lib/activities.functions";
import { importTcItems } from "@/lib/project.functions";
import type { ImportRow } from "@/lib/import-schedule";
import { dayDiff, fmtDate, SLOTS, SLOT_LABEL } from "@/lib/schedule-model";

export const Route = createFileRoute("/_authenticated/upload")({
  head: () => ({ meta: [
    { title: "데이터 업로드 | HMMME PROJECT CMS" },
    { name: "description", content: "공정표와 시운전 워크북을 올리면 공종별 데이터가 최신 파일로 교체됩니다." },
    { property: "og:title", content: "HMMME 공정 데이터 업로드" },
    { property: "og:description", content: "Arch · Elec · Mech · Int · Permit · T&C 워크북 업로드." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(projectQuery),
  errorComponent: () => <div role="alert" className="p-8">업로드 화면을 불러오지 못했습니다.</div>,
  component: UploadPage,
});

type Job = {
  id: string;
  label: string;
  fileName: string;
  existing: number;
  incoming: number;
  added: string[];
  removed: string[];
  payload:
    | { kind: "schedule"; slot: string; fileDate: string | null; rev: number | null; rows: ImportRow[] }
    | { kind: "tc"; disc: "Mech" | "Elec"; fileDate: string | null; rows: TcImportRow[] };
};

const diffKeys = (before: string[], after: string[]) => {
  const b = new Set(before), a = new Set(after);
  return {
    added: [...a].filter((k) => !b.has(k)),
    removed: [...b].filter((k) => !a.has(k)),
  };
};

function UploadPage() {
  const { rows, tcItems, batches, base } = useProject();
  const { canEdit, canWrite, scopes, isAdmin } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [pending, setPending] = useState<Job[] | null>(null);
  const [skip, setSkip] = useState<Record<string, boolean>>({});

  /** 파일을 파싱해 기존 DB 행수와 비교한 작업 목록으로 만듭니다. */
  const buildJobs = async (list: File[]) => {
    const jobs: Job[] = [];
    for (const file of list) {
      const buf = await file.arrayBuffer();
      const meta = metaFromFileName(file.name);
      const wb = XLSX.read(buf, { type: "array", bookSheets: true });
      if (isTcWorkbook(wb)) {
        const disc = meta.disc === "Elec" ? "Elec" : "Mech";
        if (!canEdit(disc)) throw new Error(`${disc} T&C 자료를 업로드할 권한이 없습니다.`);
        const parsed = parseTcWorkbook(buf, file.name);
        const before = tcItems.filter((i) => i.discipline === disc).map((i) => `${i.bldg ?? ""}|${i.item ?? ""}|${i.equip ?? ""}`);
        const after = parsed.map((p) => `${p.bldg ?? ""}|${p.item ?? ""}|${p.equip ?? ""}`);
        jobs.push({
          id: `tc-${disc}-${file.name}`, label: `${disc.toUpperCase()} T&C`, fileName: file.name,
          existing: before.length, incoming: parsed.length, ...diffKeys(before, after),
          payload: { kind: "tc", disc, fileDate: meta.date, rows: parsed },
        });
      } else {
        const slot = sourceKeyFromFileName(file.name);
        if (!canEdit(slot)) throw new Error(`${SLOT_LABEL[slot] ?? slot} 자료를 업로드할 권한이 없습니다.`);
        const parsed = parseScheduleFile(buf, file.name);
        const before = rows.filter((r) => r.slot === slot).map((r, i) => r.no ?? `#${i}`);
        const after = parsed.rows.map((r, i) => r.activity_no ?? `#${i}`);
        jobs.push({
          id: `s-${slot}-${file.name}`, label: SLOT_LABEL[slot] ?? slot, fileName: file.name,
          existing: before.length, incoming: parsed.rows.length, ...diffKeys(before, after),
          payload: { kind: "schedule", slot, fileDate: parsed.fileDate ?? meta.date, rev: meta.rev, rows: parsed.rows.map((r) => ({ ...r, source_file: slot })) },
        });
      }
    }
    return jobs;
  };

  const runJobs = async (jobs: Job[]) => {
    setBusy(true);
    const done: string[] = [];
    try {
      for (const job of jobs) {
        if (job.payload.kind === "tc") {
          const res = await importTcItems({ data: { discipline: job.payload.disc, fileName: job.fileName, fileDate: job.payload.fileDate, rows: job.payload.rows } });
          done.push(`${job.label} ${res.inserted}건`);
        } else {
          const res = await importActivities({ data: {
            sourceFile: job.payload.slot, fileName: job.fileName, fileDate: job.payload.fileDate,
            rev: job.payload.rev, rows: job.payload.rows,
          } });
          done.push(`${job.label} ${res.inserted}건`);
        }
      }
      await qc.invalidateQueries({ queryKey: ["project"] });
      await qc.invalidateQueries({ queryKey: ["progress-history"] });
      if (done.length) toast.success("업로드 반영 완료", { description: done.join(" · ") });
      else toast.info("적용된 파일이 없습니다");
    } catch (e) {
      toast.error("업로드 실패", { description: e instanceof Error ? e.message : "파일을 확인해 주세요." });
    } finally {
      setBusy(false);
    }
  };

  const handle = async (files: FileList | File[] | null) => {
    const list = files ? Array.from(files) : [];
    if (!list.length) return;
    setBusy(true);
    try {
      const jobs = await buildJobs(list);
      const changed = jobs.filter((j) => j.existing !== j.incoming);
      setBusy(false);
      if (changed.length) { setSkip({}); setPending(jobs); }
      else await runJobs(jobs);
    } catch (e) {
      setBusy(false);
      toast.error("파일을 읽지 못했습니다", { description: e instanceof Error ? e.message : "파일을 확인해 주세요." });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const confirmPending = async () => {
    const jobs = (pending ?? []).filter((j) => !skip[j.id]);
    setPending(null);
    await runJobs(jobs);
  };

  const latestOf = (kind: string, slot: string) => batches.find((b) => b.kind === kind && b.slot === slot) ?? null;

  const cards = [
    ...SLOTS.map((s) => ({ key: `s-${s}`, label: SLOT_LABEL[s]!, sub: s, count: rows.filter((r) => r.slot === s).length, batch: latestOf("schedule", s) })),
    ...(["Mech", "Elec"] as const).map((s) => ({
      key: `t-${s}`, label: `${s.toUpperCase()} T&C`, sub: "T&C",
      count: tcItems.filter((i) => i.discipline === s).length, batch: latestOf("tc", s),
    })),
  ];

  return (
    <AppShell title="데이터 업로드" desc={`기준일 ${fmtDate(base)} · 공종 파일을 올리면 해당 공종만 교체됩니다`}>
      <input ref={fileRef} type="file" accept=".xlsx,.xls" multiple className="hidden" aria-label="업로드 파일 선택" onChange={(e) => handle(e.target.files)} />

      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files); }}
        className={`grid place-items-center rounded-md border-2 border-dashed p-10 text-center transition-colors ${drag ? "border-primary bg-primary/5" : "border-border bg-card"}`}
      >
        {busy ? <Loader2 className="mb-2 size-8 animate-spin text-primary" /> : <UploadCloud className="mb-2 size-8 text-muted-foreground" />}
        <p className="text-sm font-semibold">엑셀 파일을 여기로 끌어다 놓으세요</p>
        <p className="mt-1 text-xs font-semibold text-primary">
          {isAdmin ? "관리자: 모든 공종 업로드 가능" : canWrite ? `담당 공종: ${scopes.map((x) => SCOPE_LABEL[x]).join(" · ") || "없음"}` : "조회 전용 계정입니다"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">공정표(Arch · Elec · Mech · Int · Permit)와 시운전(MECH T&C · ELEC T&C) 워크북을 자동으로 구분합니다.</p>
        <Button className="mt-4" disabled={busy || !canWrite} onClick={() => fileRef.current?.click()}>
          {busy ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}파일 선택
        </Button>
      </div>

      <Dialog open={!!pending} onOpenChange={(o) => { if (!o) setPending(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="size-4 text-chart-2" />기존 자료와 행 수가 다릅니다</DialogTitle>
            <DialogDescription>적용하면 해당 공종의 기존 자료가 새 파일로 교체됩니다. 파일별로 적용 여부를 선택하세요.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-3 overflow-auto">
            {(pending ?? []).map((j) => {
              const delta = j.incoming - j.existing;
              const same = delta === 0;
              return (
                <div key={j.id} className={`rounded-md border p-3 text-xs ${same ? "border-border" : "border-chart-2/60 bg-chart-2/5"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <strong className="text-sm">{j.label}</strong>
                      <span className="ml-2 text-muted-foreground">{j.fileName}</span>
                    </div>
                    <span className="font-semibold">
                      기존 {j.existing.toLocaleString()}행 → 새 파일 {j.incoming.toLocaleString()}행{" "}
                      {!same && <span className={delta > 0 ? "text-primary" : "text-destructive"}>({delta > 0 ? "+" : ""}{delta})</span>}
                    </span>
                  </div>
                  {(j.added.length > 0 || j.removed.length > 0) && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      신규 항목 {j.added.length}건{j.added.length ? ` (예: ${j.added.slice(0, 5).join(", ")})` : ""} · 사라진 항목 {j.removed.length}건
                      {j.removed.length ? ` (예: ${j.removed.slice(0, 5).join(", ")})` : ""}
                    </p>
                  )}
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant={skip[j.id] ? "outline" : "default"} onClick={() => setSkip((s) => ({ ...s, [j.id]: false }))}>이 파일 적용</Button>
                    <Button size="sm" variant={skip[j.id] ? "default" : "outline"} onClick={() => setSkip((s) => ({ ...s, [j.id]: true }))}>건너뛰기</Button>
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>전체 취소</Button>
            <Button onClick={confirmPending}>선택한 파일 적용</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => {
          const d = c.batch?.file_date ?? null;
          const stale = d ? dayDiff(d, base) > 7 : true;
          return (
            <div key={c.key} className={`rounded-md border bg-card p-3 shadow-sm ${stale ? "border-chart-2/60" : "border-border"}`}>
              <div className="flex items-center justify-between">
                <strong className="text-sm">{c.label}</strong>
                <span className="text-[10px] text-muted-foreground">{c.sub}</span>
              </div>
              <p className="mt-1.5 text-xl font-bold">{c.count.toLocaleString()}<span className="ml-1 text-xs font-normal text-muted-foreground">행</span></p>
              <p className="mt-1 truncate text-[11px] text-muted-foreground" title={c.batch?.file_name ?? ""}>
                {c.batch ? `${fmtDate(d)} · ${c.batch.file_name}` : "업로드 이력 없음"}
              </p>
              {stale && <p className="mt-1 text-[11px] font-semibold text-chart-2">기준일 대비 오래된 파일입니다</p>}
            </div>
          );
        })}
      </section>

      <section className="mt-5 rounded-md border border-border bg-card shadow-sm">
        <p className="border-b border-border px-3 py-2 text-xs font-bold">업로드 이력</p>
        <div className="max-h-[380px] overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-secondary text-secondary-foreground">
              <tr>{["구분", "공종", "파일명", "파일 기준일", "Rev", "행 수", "등록"].map((h) => <th key={h} className="border-b border-border px-3 py-2 font-bold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} className="border-b border-border">
                  <td className="px-3 py-1.5">{b.kind === "tc" ? "T&C" : "공정표"}</td>
                  <td className="px-3 py-1.5">{SLOT_LABEL[b.slot] ?? b.slot}</td>
                  <td className="max-w-[320px] truncate px-3 py-1.5">{b.file_name}</td>
                  <td className="px-3 py-1.5">{fmtDate(b.file_date)}</td>
                  <td className="px-3 py-1.5">{b.rev ?? "-"}</td>
                  <td className="px-3 py-1.5">{b.row_count.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{b.created_at.slice(0, 16).replace("T", " ")}</td>
                </tr>
              ))}
              {!batches.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">이력이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
