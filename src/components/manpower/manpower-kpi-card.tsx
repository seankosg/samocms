import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Building2, UserCheck } from "lucide-react";
import { manpowerRangeQuery } from "@/lib/use-manpower";
import { compliance, fmtDay, isActiveOn, riyadhToday, toDaily, type Card, type CompanyMaster } from "@/lib/manpower-model";
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
  /** 보고 협력사 수 — 분모와 같은 기준(해당 날짜 활성 회사)으로 집계 */
  const activeNames = new Set(companies.filter((c) => isActiveOn(c, day)).map((c) => c.name));
  const reportedActive = new Set(sub.filter((c) => activeNames.has(c.company)).map((c) => c.company)).size;

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
            <Cell label="보고 협력사" value={`${reportedActive}/${activeNames.size}`} day={day} />
            <Cell label={MP.compliance} value={`${Math.round(comp.rate * 100)}%`} day={day} />
            <Cell label={MP.notReported} value={String(comp.missing.length)} day={day} />
          </div>
        </>
      )}
    </div>
  );

  // 조별 협력사(SUB) · 당사(HDEC) · 차이 — 차이는 재집계가 있는 칸끼리만 비교하고, 미집계 칸은 「미확인」으로 분리
  const hdec = cards.filter((c) => c.source === "HDEC");
  const hdecByKey = new Map(hdec.map((c) => [`${c.shift}|${c.company}|${c.location}`, c.subtotal]));
  const shiftDiff = (shift: string) => {
    const subCells = sub.filter((c) => c.shift === shift);
    const subSum = subCells.reduce((a, c) => a + c.subtotal, 0);
    const hdecSum = hdec.filter((c) => c.shift === shift).reduce((a, c) => a + c.subtotal, 0);
    let diff = 0;
    let pending = 0;
    for (const c of subCells) {
      const v = hdecByKey.get(`${c.shift}|${c.company}|${c.location}`);
      if (v == null) pending += 1;
      else diff += v - c.subtotal;
    }
    return { subSum, hdecSum, diff, pending };
  };
  const shiftRows = shifts.map((s) => {
    const sd = s.label === MP.day ? shiftDiff("Day Shift") : s.label === MP.ot ? shiftDiff("Overtime") : shiftDiff("Night Shift");
    return { ...s, ...sd };
  });

  const shiftCard = (
    <Link to="/manpower/compare" search={{ day }} className="rounded-md border border-border bg-card p-4 shadow-sm transition hover:border-primary/50">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">오늘 출면 · 조별 + 차이</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {shiftRows.map((s) => (
          <div key={s.label} className="text-center">
            <p className={`text-sm font-bold ${s.cls}`}>{s.label}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">협력사</p>
            <p className="text-xl font-bold tabular-nums text-foreground">
              {isError ? "—" : isLoading ? "…" : s.subSum.toLocaleString()}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">당사</p>
            <p className="text-xl font-bold tabular-nums text-foreground">
              {isError ? "—" : isLoading ? "…" : s.hdecSum.toLocaleString()}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">차이</p>
            <p className={`text-xl font-bold tabular-nums ${s.diff === 0 ? "text-muted-foreground" : s.diff > 0 ? "text-primary" : "text-destructive"}`}>
              {isError ? "—" : isLoading ? "…" : (s.diff > 0 ? "+" : "") + s.diff.toLocaleString()}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">협력사 보고 vs 당사 재집계 · {fmtDay(day)}</p>
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

  return <>{totalCard}{shiftCard}{bldgCard}</>;
}

const Cell = ({ label, value, day }: { label: string; value: string; day: string }) => (
  <Link to="/manpower" search={{ day, src: "SUB" }} className="rounded bg-muted/50 px-2 py-1.5 transition hover:bg-muted">
    <p className="truncate text-muted-foreground">{label}</p>
    <p className="font-bold text-foreground">{value}</p>
  </Link>
);
