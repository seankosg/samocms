import { useMemo, useState } from "react";
import { styledAoaSheet, styledSheet, XLSXS as XLSX } from "@/lib/xlsx-style";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

export type ExportRow = { group: string; rec: Record<string, unknown> };
/** 단일 파일 모드에서 함께 저장할 추가 시트 (매트릭스 등 2차원 표) */
export type ExtraSheet = { name: string; aoa: unknown[][]; headerRows?: number; title?: string; subtitle?: string };

const ZIP_THRESHOLD = 7;

function sanitize(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 40) || "Unassigned";
}
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
/** 문서 제목(파일명/시트 상단 제목) 규칙 */
const docTitle = (base: string, docLabel?: string, group?: string) =>
  [docLabel ?? base, group].filter(Boolean).join(" - ");

/** QAIL Snag Raw Data 내보내기의 Output 섹션 UI를 이식한 공통 내보내기 다이얼로그 */
export function ExportDialog({
  open, onOpenChange, title, getRows, fileBase, sheetName, docLabel, subtitle, extraSheets,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  getRows: () => ExportRow[];
  fileBase: string;
  sheetName: string;
  /** 시트 상단 제목에 쓸 문서명 (기본: fileBase) */
  docLabel?: string;
  /** 시트 상단 부제 (기준일 등) */
  subtitle?: string;
  /** 단일 파일 모드에서 함께 저장할 추가 시트 */
  extraSheets?: () => ExtraSheet[];
}) {
  const bookOf = (recs: Record<string, unknown>[], group?: string) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, styledSheet(recs, { title: docTitle(fileBase, docLabel, group), subtitle }), sheetName);
    return wb;
  };
  const [mode, setMode] = useState<"single" | "per-subcon">("single");
  const [busy, setBusy] = useState(false);

  const preview = useMemo(() => {
    if (!open) return { total: 0, groups: 0 };
    const rows = getRows();
    return { total: rows.length, groups: new Set(rows.map((r) => r.group || "Unassigned")).size };
  }, [open, getRows]);

  const exportNow = async () => {
    setBusy(true);
    const id = toast.loading("내보내는 중...");
    try {
      const rows = getRows();
      if (!rows.length) { toast.error("내보낼 행이 없습니다.", { id }); return; }
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");

      if (mode === "single") {
        XLSX.writeFile(bookOf(rows.map((r) => r.rec), sheetName), `${fileBase}_${stamp}.xlsx`);
        toast.success(`${rows.length.toLocaleString()}건 내보내기 완료`, { id });
      } else {
        const groups = new Map<string, Record<string, unknown>[]>();
        for (const r of rows) {
          const k = (r.group || "").trim() || "Unassigned";
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k)!.push(r.rec);
        }
        if (groups.size >= ZIP_THRESHOLD) {
          const JSZip = (await import("jszip")).default;
          const zip = new JSZip();
          for (const [k, recs] of groups) {
            const buf = XLSX.write(bookOf(recs, sheetName), { bookType: "xlsx", type: "array" }) as ArrayBuffer;
            zip.file(`${fileBase}_${sanitize(k)}.xlsx`, buf);
          }
          downloadBlob(await zip.generateAsync({ type: "blob" }), `${fileBase}_협력사별_${stamp}.zip`);
          toast.success(`${groups.size}개 협력사 → ZIP 다운로드`, { id });
        } else {
          for (const [k, recs] of groups) {
            XLSX.writeFile(bookOf(recs, sheetName), `${fileBase}_${sanitize(k)}_${stamp}.xlsx`);
            await new Promise((r) => setTimeout(r, 0));
          }
          toast.success(`${groups.size}개 파일 다운로드`, { id });
        }
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(`내보내기 실패: ${e instanceof Error ? e.message : String(e)}`, { id });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>필터가 적용된 현재 {preview.total.toLocaleString()}건만 내보냅니다.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <div className="mb-2 text-xs font-medium text-muted-foreground">Output</div>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as "single" | "per-subcon")} className="gap-2">
              <div className="flex items-start gap-3 rounded-md border p-3">
                <RadioGroupItem value="single" id="out-single" className="mt-0.5" />
                <div className="flex-1">
                  <Label htmlFor="out-single" className="text-sm font-medium">단일 파일</Label>
                  <p className="mt-1 text-xs text-muted-foreground">한 개의 .xlsx 파일로 내려받습니다.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-md border p-3">
                <RadioGroupItem value="per-subcon" id="out-per" className="mt-0.5" />
                <div className="flex-1">
                  <Label htmlFor="out-per" className="text-sm font-medium">협력사별 분리</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    현재 {preview.groups}개 협력사. {ZIP_THRESHOLD}개 이상이면 ZIP으로 묶습니다.
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>취소</Button>
          <Button size="sm" onClick={exportNow} disabled={busy}>
            <Download className="mr-1.5 size-3.5" />{busy ? "내보내는 중..." : "내보내기"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
