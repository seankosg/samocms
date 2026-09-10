import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { UserCheck } from "lucide-react";
import { manpowerRangeQuery } from "@/lib/use-manpower";
import { compliance, fmtDay, riyadhToday, toDaily, type Card, type CompanyMaster } from "@/lib/manpower-model";
import { MP } from "@/lib/manpower-i18n";

/** 대시보드용 오늘 출면 요약 카드 (제다 현지 기준) */
export function ManpowerKpiCard() {
  const day = riyadhToday();
  const { data, isLoading, isError } = useQuery({ ...manpowerRangeQuery(day, day), retry: 1 });

  const cards = (data?.cards ?? []) as unknown as Card[];
  const companies = (data?.companies ?? []) as unknown as CompanyMaster[];
  const sub = cards.filter((c) => c.source === "SUB");
  const daily = toDaily(sub);
  const total = daily.reduce((a, d) => a + d.total, 0);
  const comp = compliance(cards, companies, day, data?.settings?.["manpower_cutoff_time"] ?? "09:00");

  return (
    <Link to="/manpower" className="block rounded-md border border-border bg-card p-4 shadow-sm transition hover:border-primary/50">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        <UserCheck className="size-3.5" />오늘 출면 · {fmtDay(day)}
      </div>
      {isError ? (
        <p className="mt-2 text-xs text-muted-foreground">출면 자료를 불러오지 못했습니다.</p>
      ) : (
        <>
          <p className="mt-1 text-2xl font-bold">{isLoading ? "…" : `${total.toLocaleString()}명`}</p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
            <Cell label="보고 협력사" value={`${new Set(sub.map((c) => c.company)).size}/${companies.filter((c) => c.is_active).length}`} />
            <Cell label={MP.compliance} value={`${Math.round(comp.rate * 100)}%`} />
            <Cell label={MP.notReported} value={String(comp.missing.length)} />
          </div>
        </>
      )}
    </Link>
  );
}

const Cell = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded bg-muted/50 px-2 py-1.5">
    <p className="truncate text-muted-foreground">{label}</p>
    <p className="font-bold text-foreground">{value}</p>
  </div>
);
