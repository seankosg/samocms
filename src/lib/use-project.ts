import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getPrevActuals, getProgressHistory, getProjectData } from "./project.functions";
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
    refetchInterval: 5 * 60_000, // 일일 스냅샷(자동 채움 포함) 반영을 위한 자동 갱신
  });
}

/** 기준일 직전 스냅샷 실적값 맵 (당일 실적 증분용) */
export function usePrevActuals(base: string) {
  const q = useQuery({
    queryKey: ["prev-actuals", base],
    queryFn: () => getPrevActuals({ data: { base } }),
    staleTime: 120_000,
  });
  return useMemo(() => (q.data ? new Map(Object.entries(q.data.prev)) : undefined), [q.data]);
}



export function useProject() {
  const { data } = useSuspenseQuery(projectQuery);
  const raw = useMemo(() => data.activities.map(toRow), [data.activities]);
  const base = data.settings["baseline_date"] ?? autoBaseline(data.batches) ?? "2026-09-05";
  const rows = useMemo(() => applyBaseline(raw, base), [raw, base]);
  return { ...data, rows, base };
}

/** 업로드된 공종별 최신 파일 기준일 중 가장 빠른 날짜 */
export function autoBaseline(batches: { kind: string; slot: string | null; file_date: string | null }[]): string | null {
  const latest = new Map<string, string | null>();
  batches.forEach((b) => {
    const key = `${b.kind}:${b.slot ?? "-"}`;
    if (!latest.has(key)) latest.set(key, b.file_date);
  });
  const dates = [...latest.values()].filter((d): d is string => !!d).sort();
  return dates[0] ?? null;
}

