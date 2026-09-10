import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getManpower, getManpowerMembers, getManpowerMasters } from "./manpower.functions";

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
    // 시트 자동 동기화 결과를 화면에 자동 반영 (5분 주기 + 화면 복귀 시)
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
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
    lastReceivedAt: (data as { lastReceivedAt?: string | null }).lastReceivedAt ?? null,

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

export const manpowerMastersQuery = queryOptions({
  queryKey: ["manpower-masters"],
  queryFn: () => getManpowerMasters(),
  staleTime: 60_000,
});

export type MasterRow = {
  name: string; sort_order: number; is_active: boolean; updated_at?: string;
  short_name?: string | null; discipline?: string | null; contract_no?: string | null;
  bldg_code?: string | null; zone?: string | null;
};
export type AliasRow = { kind: "company" | "location"; alias: string; canonical: string; note: string | null };

export function useManpowerMasters() {
  const data = useSuspenseQuery(manpowerMastersQuery).data;
  return {
    companies: data.companies as unknown as MasterRow[],
    locations: data.locations as unknown as MasterRow[],
    aliases: data.aliases as unknown as AliasRow[],
    usage: data.usage,
    members: data.members as unknown as { telegram_id: string; name: string; company: string | null; role: string }[],
    lastEntrySyncedAt: data.lastEntrySyncedAt as string | null,
  };
}

