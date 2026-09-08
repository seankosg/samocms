import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { ScheduleTable } from "@/components/schedule-table";
import { projectQuery, useProject } from "@/lib/use-project";
import { fmtDate, isLate, pct1 } from "@/lib/schedule-model";
import { searchKey, toInitial, validateListSearch } from "@/lib/list-search";

export const Route = createFileRoute("/_authenticated/delays")({
  head: () => ({ meta: [
    { title: "지연 리스트 | HMMME 통합 공정 관리" },
    { name: "description", content: "계획 대비 실적이 미달한 지연 활동만 모아 공종·건물·협력사별로 확인합니다." },
    { property: "og:title", content: "HMMME 지연 리스트" },
    { property: "og:description", content: "지연 활동과 계획 대비 격차를 확인하세요." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  validateSearch: validateListSearch,
  loader: ({ context }) => context.queryClient.ensureQueryData(projectQuery),
  errorComponent: () => <div role="alert" className="p-8">지연 데이터를 불러오지 못했습니다.</div>,
  component: DelaysPage,
});

function DelaysPage() {
  const { rows, base } = useProject();
  const search = Route.useSearch();
  const late = useMemo(() => rows.filter(isLate), [rows]);
  const gap = late.length ? late.reduce((s, r) => s + ((r.pl ?? 0) - (r.pc ?? 0)), 0) / late.length : 0;

  return (
    <AppShell title="지연 리스트" desc={`기준일 ${fmtDate(base)} · 지연 ${late.length.toLocaleString()}건 · 평균 격차 ${pct1(gap)}%p`}>
      <ScheduleTable
        key={searchKey(search)}
        rows={late}
        fileName="HMMME_지연리스트.xlsx"
        lockLate
        initial={toInitial(search)}
        dueBy={search.duebyBase ? base : null}
      />
    </AppShell>
  );
}

