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
    <div className="rounded-md border border-border bg-card p-4 shadow-sm transition hover:border-primary/50">
      <Link to="/manpower" search={{ day }} className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground hover:text-primary">
        <UserCheck className="size-3.5" />오늘 출면 · {fmtDay(day)}
      </Link>
      {isError ? (
        <p className="mt-2 text-xs text-muted-foreground">출면 자료를 불러오지 못했습니다.</p>
      ) : (
        <>
          <p className="mt-1 text-2xl font-bold">
            <Link to="/manpower" search={{ day, src: "SUB" }} className="underline-offset-2 hover:text-primary hover:underline">
              {isLoading ? "…" : `${total.toLocaleString()}명`}
            </Link>
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
            <Cell label="보고 협력사" value={`${new Set(sub.map((c) => c.company)).size}/${companies.filter((c) => c.is_active).length}`} day={day} />
            <Cell label={MP.compliance} value={`${Math.round(comp.rate * 100)}%`} day={day} />
            <Cell label={MP.notReported} value={String(comp.missing.length)} day={day} />
          </div>
        </>
      )}
    </div>
  );
}

const Cell = ({ label, value, day }: { label: string; value: string; day: string }) => (
  <Link to="/manpower" search={{ day, src: "SUB" }} className="rounded bg-muted/50 px-2 py-1.5 transition hover:bg-muted">
    <p className="truncate text-muted-foreground">{label}</p>
    <p className="font-bold text-foreground">{value}</p>
  </Link>
);
