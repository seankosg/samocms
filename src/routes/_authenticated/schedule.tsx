import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { EyeOff, Undo2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ScheduleTable } from "@/components/schedule-table";
import { Button } from "@/components/ui/button";
import { projectQuery, useHiddenActivities, useProject } from "@/lib/use-project";
import { unhideActivity } from "@/lib/project.functions";
import { useAuth } from "@/lib/use-auth";
import { fmtDate, hasProgress, SLOT_LABEL } from "@/lib/schedule-model";
import { searchKey, toInitial, validateListSearch } from "@/lib/list-search";

export const Route = createFileRoute("/_authenticated/schedule")({
  head: () => ({ meta: [
    { title: "공정리스트 | HMMME PROJECT CMS" },
    { name: "description", content: "통합공정표 전체 활동을 검색·필터·정렬하고 Excel로보냅니다." },
    { property: "og:title", content: "HMMME 공정리스트" },
    { property: "og:description", content: "공종·건물·마일스톤·협력사별 공정 원천 데이터." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  validateSearch: validateListSearch,
  loader: ({ context }) => context.queryClient.ensureQueryData(projectQuery),
  errorComponent: () => <div role="alert" className="p-8">공정 데이터를 불러오지 못했습니다.</div>,
  component: SchedulePage,
});

function SchedulePage() {
  const { rows, base } = useProject();
  const { canEdit } = useAuth();
  const qc = useQueryClient();
  const search = Route.useSearch();
  const [showHidden, setShowHidden] = useState(false);
  const hiddenQ = useHiddenActivities(showHidden);
  const hidden = hiddenQ.data ?? [];

  const unhide = useMutation({
    mutationFn: (id: number) => unhideActivity({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project"] });
      qc.invalidateQueries({ queryKey: ["hidden-activities"] });
      toast.success("항목을 되살렸습니다.");
    },
    onError: (e: Error) => toast.error(e.message || "되살리기에 실패했습니다."),
  });

  const scoped = useMemo(() => rows.filter((r) => {
    if (search.slot && !(r.slot === search.slot || r.dept === search.slot)) return false;
    if (search.hasProgress && !hasProgress(r)) return false;
    return true;
  }), [rows, search.slot, search.hasProgress]);
  const scope = [
    search.slot ? `공종 ${SLOT_LABEL[search.slot] ?? search.slot}` : null,
    search.hasProgress ? "진도 보유 행" : null,
  ].filter(Boolean).join(" · ");
  return (
    <AppShell
      title="공정리스트"
      desc={`기준일 ${fmtDate(base)} · ${scope ? `${scope} · ` : "전체 "}${scoped.length.toLocaleString()}개 활동`}
      actions={
        <Button variant={showHidden ? "default" : "outline"} size="sm" onClick={() => setShowHidden((v) => !v)}>
          <EyeOff />{showHidden ? "숨김 항목 닫기" : "숨김 항목 보기"}
        </Button>
      }
    >
      <ScheduleTable
        key={searchKey(search)}
        rows={scoped}
        fileName="HMMME_공정리스트.xlsx"
        initial={toInitial(search)}
        dueBy={search.duebyBase ? base : null}
      />

      {showHidden && (
        <section className="mt-5 rounded-md border border-border bg-card shadow-sm">
          <p className="border-b border-border px-3 py-2 text-xs font-bold">
            숨김(보관) 항목 {hiddenQ.isLoading ? "…" : `${hidden.length.toLocaleString()}건`}
            <span className="ml-2 font-normal text-muted-foreground">최신 파일에서 빠진 항목입니다. 집계·대시보드에서는 제외됩니다.</span>
          </p>
          <div className="max-h-[380px] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-secondary text-secondary-foreground">
                <tr>{["공종", "Activity No", "작업명", "건물", "담당", "보관일", "마지막 파일 기준일", ""].map((h) => <th key={h} className="border-b border-border px-3 py-2 font-bold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {hidden.map((a) => (
                  <tr key={a.id} className="border-b border-border bg-muted/40 text-muted-foreground">
                    <td className="px-3 py-1.5">{SLOT_LABEL[a.source_file] ?? a.source_file}</td>
                    <td className="px-3 py-1.5"><span className="line-through">{a.activity_no ?? "-"}</span></td>
                    <td className="max-w-[320px] truncate px-3 py-1.5"><span className="line-through">{a.activity}</span></td>
                    <td className="px-3 py-1.5">{a.building ?? "-"}</td>
                    <td className="px-3 py-1.5">{a.manager ?? "-"}</td>
                    <td className="px-3 py-1.5">{a.hidden_at ? a.hidden_at.slice(0, 10) : "-"}</td>
                    <td className="px-3 py-1.5">{fmtDate(a.hidden_source_date)}</td>
                    <td className="px-3 py-1.5">
                      {canEdit(a.source_file) && (
                        <Button size="sm" variant="outline" disabled={unhide.isPending} onClick={() => unhide.mutate(a.id)}>
                          <Undo2 />되살리기
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {!hiddenQ.isLoading && !hidden.length && (
                  <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">숨김 항목이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </AppShell>
  );
}
