import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getManpower, getManpowerMembers } from "./manpower.functions";
import {
  makeIsWorkday, riyadhToday, addDays, toDaily,
  type Card, type CompareRow, type CompanyMaster, type LocationMaster, type CalendarDay, type PlanRow,
} from "./manpower-model";

export const DEFAULT_TREND_DAYS = 30;

export const manpowerRangeQuery = (from: string, to: string) =>
  queryOptions({
    queryKey: ["manpower", from, to],
    queryFn: () => getManpower({ data: { from, to } }),
    staleTime: 60_000,
  });

/** 최근 N일 기본 범위 (제다 현지 기준) */
export const defaultRange = (days = DEFAULT_TREND_DAYS) => {
  const to = riyadhToday();
  return { from: addDays(to, -(days - 1)), to };
};

export function useManpower(from: string, to: string) {
  const { data } = useSuspenseQuery(manpowerRangeQuery(from, to));
  const cards = data.cards as unknown as Card[];
  const compare = data.compare as unknown as CompareRow[];
  const companies = data.companies as unknown as CompanyMaster[];
  const locations = data.locations as unknown as LocationMaster[];
  const calendar = data.calendar as unknown as CalendarDay[];
  const plan = data.plan as unknown as PlanRow[];
  return {
    cards,
    compare,
    companies,
    locations,
    calendar,
    plan,
    settings: data.settings,
    ingestLog: data.ingestLog,
    daily: toDaily(cards),
    isWorkday: makeIsWorkday(calendar),
    cutoff: data.settings["manpower_cutoff_time"] ?? "09:00",
  };
}

export const manpowerMembersQuery = queryOptions({
  queryKey: ["manpower-members"],
  queryFn: () => getManpowerMembers(),
  staleTime: 60_000,
});

export function useManpowerMembers() {
  return useSuspenseQuery(manpowerMembersQuery).data as {
    telegram_id: string; name: string; company: string | null;
    role: "SUB" | "HDEC"; is_active: boolean; note: string | null;
  }[];
}
