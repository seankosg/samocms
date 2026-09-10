import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CloudDownload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { importManpowerSheet } from "@/lib/manpower.functions";

type Preview = {
  preview: boolean; rows: number; added: number; changed: number; unchanged: number;
  upserted?: number; errors: { row: number; reason: string; tab: string }[];
};

/** 관리자 전용 — 구글 시트(봇 장부)에서 출면 자료를 가져옵니다. */
export function SheetImportDialog({ settings }: { settings: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(settings["manpower_sheet_id"] ?? "");
  const [subTab, setSubTab] = useState(settings["manpower_sheet_sub_tab"] ?? "Submissions");
  const [hdecTab, setHdecTab] = useState(settings["manpower_sheet_hdec_tab"] ?? "Verification");
  const [preview, setPreview] = useState<Preview | null>(null);
  const qc = useQueryClient();

  const run = useMutation({
    mutationFn: (apply: boolean) => importManpowerSheet({ data: { sheet, subTab, hdecTab, apply } }),
    onSuccess: (r) => {
      setPreview(r as unknown as Preview);
      if (!r.preview) {
        qc.invalidateQueries({ queryKey: ["manpower"] });
        toast.success("가져오기 완료", { description: `${r.upserted ?? 0}행 반영 (신규 ${r.added} · 변경 ${r.changed})` });
      }
    },
    onError: (e: Error) => toast.error("가져오기 실패", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setPreview(null); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><CloudDownload className="size-3.5" />구글 시트에서 가져오기</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>구글 시트에서 출면 자료 가져오기</DialogTitle>
          <DialogDescription>봇이 기록한 시트를 읽어 미리보기 후 저장합니다. 시트 행 번호 기준으로 갱신되며 기존 기록은 지워지지 않습니다. 미리보기에는 별칭으로 합치기 전의 원래 이름이 그대로 보입니다.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs">
          <div className="space-y-1">
            <Label htmlFor="mp-sheet" className="text-xs">시트 주소 또는 ID</Label>
            <Input id="mp-sheet" value={sheet} onChange={(e) => setSheet(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="mp-sub" className="text-xs">협력사 보고 탭</Label>
              <Input id="mp-sub" value={subTab} onChange={(e) => setSubTab(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mp-hdec" className="text-xs">HDEC 재집계 탭</Label>
              <Input id="mp-hdec" value={hdecTab} onChange={(e) => setHdecTab(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>

          {preview && (
            <div className="rounded-md border border-border p-2">
              <p className="font-semibold">
                읽은 행 {preview.rows.toLocaleString()} · 신규 {preview.added} · 변경 {preview.changed} · 동일 {preview.unchanged}
                {preview.preview ? "" : ` · 저장 ${preview.upserted ?? 0}`}
              </p>
              {preview.errors.length > 0 && (
                <div className="mt-2 max-h-40 overflow-y-auto text-[11px] text-destructive">
                  <p className="font-semibold">건너뛴 행 {preview.errors.length}건</p>
                  <ul className="mt-1 space-y-0.5">
                    {preview.errors.slice(0, 50).map((e, i) => (
                      <li key={i}>{e.tab} {e.row}행 · {e.reason}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" disabled={!sheet || run.isPending} onClick={() => run.mutate(false)}>미리보기</Button>
            <Button size="sm" disabled={!preview?.preview || run.isPending} onClick={() => run.mutate(true)}>저장</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
