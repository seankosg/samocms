import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { ScheduleTable } from "@/components/schedule-table";
import { projectQuery, useProject } from "@/lib/use-project";
import { fmtDate } from "@/lib/schedule-model";
import { searchKey, toInitial, validateListSearch } from "@/lib/list-search";

export const Route = createFileRoute("/_authenticated/schedule")({
  head: () => ({ meta: [
    { title: "공정리스트 | HMMME PROJECT CMS" },
    { name: "description", content: "통합공정표 전체 활동을 검색·필터·정렬하고 Excel로 내보냅니다." },
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
  const search = Route.useSearch();
  return (
    <AppShell title="공정리스트" desc={`기준일 ${fmtDate(base)} · 전체 ${rows.length.toLocaleString()}개 활동`}>
      <ScheduleTable
        key={searchKey(search)}
        rows={rows}
        fileName="HMMME_공정리스트.xlsx"
        initial={toInitial(search)}
        dueBy={search.duebyBase ? base : null}
      />
    </AppShell>
  );
}

