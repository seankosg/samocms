import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getNcrItems } from "./ncr.functions";

export const ncrQuery = queryOptions({
  queryKey: ["ncr-items"],
  queryFn: () => getNcrItems(),
  staleTime: 60_000,
});

export function useNcrItems() {
  return useSuspenseQuery(ncrQuery).data;
}
