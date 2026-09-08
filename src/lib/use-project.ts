import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getProgressHistory, getProjectData } from "./project.functions";
import { applyBaseline, toRow } from "./schedule-model";


export const projectQuery = queryOptions({
  queryKey: ["project"],
  queryFn: () => getProjectData(),
  staleTime: 120_000,
});

/** 항목/공종별 진도 이력(추이·일일 진도율) */
export function useProgressHistory(opts: { itemKey?: string; discipline?: string } = {}) {
  return useQuery({
    queryKey: ["progress-history", opts.itemKey ?? null, opts.discipline ?? null],
    queryFn: () => getProgressHistory({ data: opts }),
    staleTime: 120_000,
  });
}


export function useProject() {
  const { data } = useSuspenseQuery(projectQuery);
  const rows = useMemo(() => data.activities.map(toRow), [data.activities]);
  const base = data.settings["baseline_date"] ?? "2026-09-05";
  return { ...data, rows, base };
}
