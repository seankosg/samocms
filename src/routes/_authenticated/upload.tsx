import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { FileSpreadsheet, Loader2, UploadCloud } from "lucide-react";
import { useAuth } from "@/lib/use-auth";
import { SCOPE_LABEL } from "@/lib/roster";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { projectQuery, useProject } from "@/lib/use-project";
import { parseScheduleFile, sourceKeyFromFileName } from "@/lib/import-schedule";
import { isTcWorkbook, metaFromFileName, parseTcWorkbook } from "@/lib/import-tc";
import { importActivities } from "@/lib/activities.functions";
import { importTcItems } from "@/lib/project.functions";
import { dayDiff, fmtDate, SLOTS, SLOT_LABEL } from "@/lib/schedule-model";

export const Route = createFileRoute("/_authenticated/upload")({
  head: () => ({ meta: [
    { title: "데이터 업로드 | HMMME 통합 공정 관리" },
    { name: "description", content: "공정표와 시운전 워크북을 올리면 공종별 데이터가 최신 파일로 교체됩니다." },
    { property: "og:title", content: "HMMME 공정 데이터 업로드" },
    { property: "og:description", content: "Arch · Elec · Mech · Int · Permit · T&C 워크북 업로드." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(projectQuery),
  errorComponent: () => <div role="alert" className="p-8">업로드 화면을 불러오지 못했습니다.</div>,
  component: UploadPage,
});

function UploadPage() {
  const { rows, tcItems, batches, base } = useProject();
  const { canEdit, canWrite, scopes, isAdmin } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  const handle = async (files: FileList | File[] | null) => {
    const list = files ? Array.from(files) : [];
    if (!list.length) return;
    setBusy(true);
    const done: string[] = [];
    try {
      for (const file of list) {
        const buf = await file.arrayBuffer();
        const meta = metaFromFileName(file.name);
        const wb = XLSX.read(buf, { type: "array", bookSheets: true });
        if (isTcWorkbook(wb)) {
          const parsed = parseTcWorkbook(buf, file.name);
          const disc = meta.disc === "Elec" ? "Elec" : "Mech";
          if (!canEdit(disc)) throw new Error(`${disc} T&C 자료를 업로드할 권한이 없습니다.`);
          const res = await importTcItems({ data: { discipline: disc, fileName: file.name, fileDate: meta.date, rows: parsed } });
          done.push(`${disc} T&C ${res.inserted}건`);
        } else {
          const parsed = parseScheduleFile(buf, file.name);
          const slot = sourceKeyFromFileName(file.name);
          if (!canEdit(slot)) throw new Error(`${SLOT_LABEL[slot] ?? slot} 자료를 업로드할 권한이 없습니다.`);
          const res = await importActivities({
            data: {
              sourceFile: slot,
              fileName: file.name,
              fileDate: parsed.fileDate ?? meta.date,
              rev: meta.rev,
              rows: parsed.rows.map((r) => ({ ...r, source_file: slot })),
            },
          });


          done.push(`${SLOT_LABEL[slot] ?? slot} ${res.inserted}건`);
        }
      }
      await qc.invalidateQueries({ queryKey: ["project"] });
      toast.success("업로드 반영 완료", { description: done.join(" · ") });
    } catch (e) {
      toast.error("업로드 실패", { description: e instanceof Error ? e.message : "파일을 확인해 주세요." });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
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
