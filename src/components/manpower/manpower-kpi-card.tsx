import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Building2, UserCheck } from "lucide-react";
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
  const shifts = [
    { label: MP.day, value: daily.reduce((a, d) => a + d.day_total, 0), cls: "text-ncr-progress-plan" },
    { label: MP.ot, value: daily.reduce((a, d) => a + d.ot_total, 0), cls: "text-ncr-upcoming" },
    { label: MP.night, value: daily.reduce((a, d) => a + d.night_total, 0), cls: "text-ncr-progress-actual" },
  ];
  const comp = compliance(cards, companies, day, data?.settings?.["manpower_cutoff_time"] ?? "09:00");

  // 건물별 집계 (화면에는 건물명으로 표시)
  const byBldg = new Map<string, number>();
  for (const c of sub) byBldg.set(c.location, (byBldg.get(c.location) ?? 0) + c.subtotal);
  const bldgTop = [...byBldg.entries()]
    .map(([loc, n]) => ({ loc, n }))
    .sort((a, b) => b.n - a.n);
  const top1 = bldgTop[0];
  const rest = bldgTop.slice(1, 5);

  const totalCard = (
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

  const shiftCard = (
    <Link to="/manpower" search={{ day, src: "SUB" }} className="rounded-md border border-border bg-card p-4 shadow-sm transition hover:border-primary/50">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">오늘 출면 · 조별</p>
      <div className="mt-1 grid grid-cols-3 gap-2">
        {shifts.map((s) => (
          <div key={s.label} className="text-center">
            <p className="text-[11px] font-bold text-muted-foreground">{s.label}</p>
            <p className={`text-2xl font-bold tabular-nums ${s.cls}`}>
              {isError ? "—" : isLoading ? "…" : s.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">협력사 보고 · {fmtDay(day)}</p>
    </Link>
  );

  const bldgCard = (
    <div className="rounded-md border border-border bg-card p-4 shadow-sm transition hover:border-primary/50">
      <Link to="/manpower" search={{ day, src: "SUB" }} className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground hover:text-primary">
        <Building2 className="size-3.5" />오늘 최대 출면 건물
      </Link>
      {isError ? (
        <p className="mt-2 text-xs text-muted-foreground">출면 자료를 불러오지 못했습니다.</p>
      ) : (
        <div className="mt-1 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-extrabold leading-tight" title={top1?.loc}>
              {isLoading ? "…" : top1 ? top1.loc : "—"}
            </p>
            <p className="text-2xl font-bold tabular-nums text-primary">
              {isLoading ? "…" : top1 ? `${top1.n.toLocaleString()}명` : ""}
            </p>
          </div>
          <div className="shrink-0 space-y-1 text-right text-[11px]">
            {rest.map((b, i) => (
              <div key={b.loc} className="flex items-baseline justify-end gap-1.5">
                <span className="max-w-[110px] truncate font-semibold text-muted-foreground" title={b.loc}>
                  {i + 2}. {b.loc}
                </span>
                <span className="font-bold tabular-nums">{b.n.toLocaleString()}</span>
              </div>
            ))}
            {!isLoading && rest.length === 0 && <p className="text-muted-foreground">자료 없음</p>}
          </div>
        </div>
      )}
    </div>
  );

  // 출면 차이 카드 — 협력사(SUB) vs 당사(HDEC) 조별 집계
  const hdec = cards.filter((c) => c.source === "HDEC");
  const shiftDiff = (shift: string) => {
    const subSum = sub.filter((c) => c.shift === shift).reduce((a, c) => a + c.subtotal, 0);
    const hdecSum = hdec.filter((c) => c.shift === shift).reduce((a, c) => a + c.subtotal, 0);
    return { subSum, hdecSum, diff: hdecSum - subSum };
  };
  const diffRows = [
    { label: MP.day, ...shiftDiff("Day Shift"), cls: "text-ncr-progress-plan" },
    { label: MP.ot, ...shiftDiff("Overtime"), cls: "text-ncr-upcoming" },
    { label: MP.night, ...shiftDiff("Night Shift"), cls: "text-ncr-progress-actual" },
  ];
  const diffTotal = diffRows.reduce((a, r) => a + r.diff, 0);

  const diffCard = (
    <Link to="/manpower/compare" search={{ day }} className="rounded-md border border-border bg-card p-4 shadow-sm transition hover:border-primary/50">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">출면 차이 · 당사 재집계 vs 협력사 보고</p>
      {isError ? (
        <p className="mt-2 text-xs text-muted-foreground">출면 자료를 불러오지 못했습니다.</p>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {diffRows.map((r) => (
              <div key={r.label} className="text-center">
                <p className={`text-sm font-bold ${r.cls}`}>{r.label}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">협력사</p>
                <p className="text-lg font-bold tabular-nums text-foreground">{isLoading ? "…" : r.subSum.toLocaleString()}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">당사</p>
                <p className="text-lg font-bold tabular-nums text-foreground">{isLoading ? "…" : r.hdecSum.toLocaleString()}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">차이</p>
                <p className={`text-lg font-bold tabular-nums ${r.diff === 0 ? "text-muted-foreground" : r.diff > 0 ? "text-primary" : "text-destructive"}`}>
                  {isLoading ? "…" : (r.diff > 0 ? "+" : "") + r.diff.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-right text-[11px] text-muted-foreground">
            합계 차이 <span className={`font-bold ${diffTotal === 0 ? "text-muted-foreground" : diffTotal > 0 ? "text-primary" : "text-destructive"}`}>
              {isLoading ? "…" : (diffTotal > 0 ? "+" : "") + diffTotal.toLocaleString()}
            </span> · {fmtDay(day)}
          </p>
        </>
      )}
    </Link>
  );

  return <>{totalCard}{shiftCard}{bldgCard}{diffCard}</>;
}

const Cell = ({ label, value, day }: { label: string; value: string; day: string }) => (
  <Link to="/manpower" search={{ day, src: "SUB" }} className="rounded bg-muted/50 px-2 py-1.5 transition hover:bg-muted">
    <p className="truncate text-muted-foreground">{label}</p>
    <p className="font-bold text-foreground">{value}</p>
  </Link>
);
