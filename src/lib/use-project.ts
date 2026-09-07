import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getProjectData } from "./project.functions";
import { toRow } from "./schedule-model";

export const projectQuery = queryOptions({
  queryKey: ["project"],
  queryFn: () => getProjectData(),
  staleTime: 120_000,
});

export function useProject() {
  const { data } = useSuspenseQuery(projectQuery);
  const rows = useMemo(() => data.activities.map(toRow), [data.activities]);
  const base = data.settings["baseline_date"] ?? "2026-09-05";
  return { ...data, rows, base };
}
