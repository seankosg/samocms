import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { updateActivity } from "./activities.functions";
import { updateTcItem } from "./project.functions";

/** 공정리스트 인라인 수정 */
export function useActivityEdit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number; patch: Record<string, unknown> }) => updateActivity({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project"] });
      toast.success("저장되었습니다.");
    },
    onError: (e: Error) => toast.error(e.message || "저장에 실패했습니다."),
  });
}

/** T&C List 인라인 수정 */
export function useTcEdit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number; patch: Record<string, unknown> }) => updateTcItem({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project"] });
      toast.success("저장되었습니다.");
    },
    onError: (e: Error) => toast.error(e.message || "저장에 실패했습니다."),
  });
}

/** 문자열 입력값 → 숫자(빈 값은 null) */
export const numOrNull = (v: string | null) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
};
