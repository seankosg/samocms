import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { XLSXS } from "@/lib/xlsx-style";
import { buildNcrMatrixBook, ncrMatrixFileName } from "@/lib/ncr-matrix-xlsx";
import { computeNcrStats } from "@/lib/ncr-stats";
import type { NcrDates } from "@/lib/ncr-model";
import type { NcrItem } from "@/lib/ncr.functions";

const ZIP_THRESHOLD = 7;
const sanitize = (name: string) => name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 40) || "Unassigned";
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** NCR 대시보드보내기 — 공정리스트 ExportDialog의 Output 선택 UI 이식 (단일 파일 / 협력사별 분리) */
export function NcrExportDialog({
  open, onOpenChange, lang, asOf, within, rows,
  filters,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lang: "ko" | "en";
  asOf: string;
  within: number;
  rows: NcrItem[];
  filters: { docType?: string | undefined; team?: string | undefined; sub?: string | undefined };
}) {
  const [mode, setMode] = useState<"single" | "per-subcon">("single");
  const [busy, setBusy] = useState(false);

  const preview = useMemo(() => {
    if (!open) return { total: 0, groups: 0 };
    return { total: rows.length, groups: new Set(rows.map((r) => (r.subcontractor ?? "").trim() || "Unassigned")).size };
  }, [open, rows]);

  const buildFor = (list: NcrItem[], sub?: string) => {
    const { stats, closed, noPlanTotal, total } = computeNcrStats(list as unknown as NcrDates[], asOf, within);
    return buildNcrMatrixBook({
      lang, asOf, within, total, closed, noPlanTotal, stats,
      filters: { docType: filters.docType, team: filters.team, sub: sub ?? filters.sub },
      list: { rows: list },
    });
  };

  const exportNow = async () => {
    setBusy(true);
    const id = toast.loading("보내는 중...");
    try {
      if (!rows.length) { toast.error("보낼 행이 없습니다.", { id }); return; }
      if (mode === "single") {
        XLSXS.writeFile(buildFor(rows), ncrMatrixFileName(lang, filters.sub, asOf));
        toast.success(`${rows.length.toLocaleString()}건보내기 완료`, { id });
      } else {
        const groups = new Map<string, NcrItem[]>();
        for (const r of rows) {
          const k = (r.subcontractor ?? "").trim() || "Unassigned";
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k)!.push(r);
        }
        if (groups.size >= ZIP_THRESHOLD) {
          const JSZip = (await import("jszip")).default;
          const zip = new JSZip();
          for (const [k, list] of groups) {
            const buf = XLSXS.write(buildFor(list, k), { bookType: "xlsx", type: "array" }) as ArrayBuffer;
            zip.file(ncrMatrixFileName(lang, sanitize(k), asOf), buf);
          }
          downloadBlob(await zip.generateAsync({ type: "blob" }), `NCR_매트릭스_협력사별_${asOf.replace(/-/g, "")}.zip`);
          toast.success(`${groups.size}개 협력사 → ZIP 다운로드`, { id });
        } else {
          for (const [k, list] of groups) {
            XLSXS.writeFile(buildFor(list, k), ncrMatrixFileName(lang, sanitize(k), asOf));
            await new Promise((r) => setTimeout(r, 0));
          }
          toast.success(`${groups.size}개 파일 다운로드`, { id });
        }
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(`보내기 실패: ${e instanceof Error ? e.message : String(e)}`, { id });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>NCR 매트릭스보내기</DialogTitle>
          <DialogDescription>필터가 적용된 현재 {preview.total.toLocaleString()}건만보냅니다. (매트릭스 + NCR 리스트 시트)</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <div className="mb-2 text-xs font-medium text-muted-foreground">Output</div>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as "single" | "per-subcon")} className="gap-2">
              <div className="flex items-start gap-3 rounded-md border p-3">
                <RadioGroupItem value="single" id="ncr-out-single" className="mt-0.5" />
                <div className="flex-1">
                  <Label htmlFor="ncr-out-single" className="text-sm font-medium">단일 파일</Label>
                  <p className="mt-1 text-xs text-muted-foreground">한 개의 .xlsx 파일로 내려받습니다.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-md border p-3">
                <RadioGroupItem value="per-subcon" id="ncr-out-per" className="mt-0.5" />
                <div className="flex-1">
                  <Label htmlFor="ncr-out-per" className="text-sm font-medium">협력사별 분리</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    현재 {preview.groups}개 협력사. 각 파일에 해당 협력사 기준 매트릭스와 리스트가 들어갑니다. {ZIP_THRESHOLD}개 이상이면 ZIP으로 묶습니다.
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>취소</Button>
          <Button size="sm" onClick={exportNow} disabled={busy}>
            <Download className="mr-1.5 size-3.5" />{busy ? "보내는 중..." : "보내기"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
