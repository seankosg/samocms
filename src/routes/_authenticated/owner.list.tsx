import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { ScheduleTable } from "@/components/schedule-table";
import { projectQuery, useProject } from "@/lib/use-project";
import { applyBaseline, fmtDate, hasProgress, OWNER_SLOT } from "@/lib/schedule-model";
import type { TableInitial } from "@/components/schedule-table";

type OwnerListSearch = TableInitial & { base?: string; duebyBase?: boolean };

export const Route = createFileRoute("/_authenticated/owner/list")({
  head: () => ({ meta: [
    { title: "발주처 공정 리스트 | HMMME PROJECT CMS" },
    { name: "description", content: "발주처(HMMME) 업역 공정을 부서·건물·마일스톤별로 검색·정렬하고 Excel로 내보냅니다." },
    { property: "og:title", content: "HMMME 발주처 공정 리스트" },
    { property: "og:description", content: "발주처 업역 공정 원천 데이터." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  validateSearch: (raw: Record<string, unknown>): OwnerListSearch => {
    const out: OwnerListSearch = {};
    const b = raw["base"]; if (typeof b === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b)) out.base = b;
    const d = raw["dept"]; if (typeof d === "string" && d.trim()) out.dept = d;
    for (const key of ["q", "bldg", "ms", "sub", "mgr", "status", "efrom", "eto"] as const) {
      const value = raw[key]; if (typeof value === "string" && value.trim()) out[key] = value;
    }
    if (raw["duebyBase"] === true || raw["duebyBase"] === "true") out.duebyBase = true;
    return out;
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(projectQuery),
  errorComponent: () => <div role="alert" className="p-8">발주처 공정 데이터를 불러오지 못했습니다.</div>,
  component: OwnerListPage,
});

function OwnerListPage() {
  const { ownerRows, batches, base: globalBase } = useProject();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const fileBase = batches.find((b) => b.kind === "schedule" && b.slot === OWNER_SLOT)?.file_date ?? null;
  const base = search.base ?? fileBase ?? globalBase;

  const all = useMemo(() => applyBaseline(ownerRows, base), [ownerRows, base]);
  const depts = useMemo(
    () => [...new Set(all.map((r) => r.ownerDept ?? r.dept))].filter(Boolean).sort((a, b) => a.localeCompare(b, "ko")),
    [all],
  );
  const rows = useMemo(
    () => (search.dept ? all.filter((r) => (r.ownerDept ?? r.dept) === search.dept) : all),
    [all, search.dept],
  );

  const setSearch = (patch: OwnerListSearch) => navigate({ search: (prev) => ({ ...prev, ...patch }) });

  return (
    <AppShell
      title="발주처 공정 리스트"
      desc={`기준일 ${fmtDate(base)} · ${search.dept ? `부서 ${search.dept} · ` : "전체 "}${rows.length.toLocaleString()}개 활동 · 진도 보유 ${rows.filter(hasProgress).length.toLocaleString()}건`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">기준일</span>
          <Input
            type="date" aria-label="발주처 기준일" value={base} className="h-8 w-[150px] text-xs"
            onChange={(e) => setSearch(e.target.value ? { base: e.target.value } : {})}
          />
        </div>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-bold text-muted-foreground">부서</span>
        <button
          type="button" data-active={!search.dept}
          className="ui-filter h-7 cursor-pointer rounded-full px-2.5 text-[11px] transition-colors"
          onClick={() => navigate({ search: (prev) => { const { dept: _drop, ...rest } = prev; return rest; } })}
        >
          전체
        </button>
        {depts.map((d) => (
          <button
            key={d} type="button" data-active={search.dept === d}
            className="ui-filter h-7 cursor-pointer rounded-full px-2.5 text-[11px] transition-colors"
            onClick={() => setSearch({ dept: d })}
          >
            {d}
          </button>
        ))}
      </div>

      <ScheduleTable
        key={`${base}|${JSON.stringify(search)}`}
        rows={rows}
        fileName="HMMME_발주처_공정리스트.xlsx"
        initial={search}
        dueBy={search.duebyBase ? base : null}
      />
    </AppShell>
  );
}
