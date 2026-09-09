import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, ChevronRight, HardHat, Loader2, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { projectQuery, useProject } from "@/lib/use-project";
import { SLOT_LABEL, fmtShortDate, isLate, pct1, type Row } from "@/lib/schedule-model";
import { TC_STAGE_SUB, TC_DISC_LABEL, type TcStage } from "@/lib/tc-model";
import { TODAY_GROUPS, fmtToday, qatarToday, safetyFacts, splitToday, todayTc, byTeam, byBldg, type TodayGroupKey } from "@/lib/today-model";
import { analyzeSafety, type SafetyRisk } from "@/lib/safety.functions";
import { useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/_authenticated/today")({
  head: () => ({ meta: [
    { title: "오늘의 주요 작업 | HMMME 통합 공정 관리" },
    { name: "description", content: "카타르 현지 날짜 기준 금일 착수·진행·종결 공정과 T&C 계획, AI 안전 위험 작업을 한 화면에서 확인합니다." },
    { property: "og:title", content: "HMMME 오늘의 주요 작업" },
    { property: "og:description", content: "금일 신규 착수·지속 진행·종결 공정, 당일 T&C 계획, High Risk 안전 작업." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(projectQuery),
  errorComponent: () => <div role="alert" className="p-8">오늘의 작업 데이터를 불러오지 못했습니다.</div>,
  component: TodayPage,
});

const card = "rounded-lg border border-border bg-card p-4";

function TodayPage() {
  const { rows, tcItems } = useProject();
  const { isAdmin } = useAuth();
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(qatarToday()), []);

  const groups = useMemo(() => (today ? splitToday(rows, today) : null), [rows, today]);
  const tc = useMemo(() => (today ? todayTc(tcItems, today) : []), [tcItems, today]);

  const safety = useMutation({
    mutationFn: () => analyzeSafety({ data: { day: today!, facts: safetyFacts(groups!, tc, today!) } }),
  });

  if (!today || !groups) {
    return (
      <AppShell title="오늘의 주요 작업" desc="카타르 현지 날짜 기준">
        <div className={card}>날짜를 확인하는 중…</div>
      </AppShell>
    );
  }

  const teamOf = (slot: string) => SLOT_LABEL[slot] ?? slot;
  const kpiCards = [
    { label: "금일 신규 착수", v: groups.start.length, team: byTeam(groups.start).map((x) => ({ ...x, label: teamOf(x.label) })), bldg: byBldg(groups.start) },
    { label: "금일 지속 진행", v: groups.ongoing.length, team: byTeam(groups.ongoing).map((x) => ({ ...x, label: teamOf(x.label) })), bldg: byBldg(groups.ongoing) },
    { label: "금일 종결", v: groups.finish.length, team: byTeam(groups.finish).map((x) => ({ ...x, label: teamOf(x.label) })), bldg: byBldg(groups.finish) },
    { label: "금일 T&C 계획", v: tc.length, team: byTeam(tc).map((x) => ({ ...x, label: teamOf(x.label) })), bldg: byBldg(tc) },
  ];

  return (
    <AppShell title="오늘의 주요 작업" desc={`${fmtToday(today)} · 카타르 현지(UTC+3) 기준 · 기준일 설정과 무관`}>
      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-4">
        {kpiCards.map((c) => (
          <KpiCard key={c.label} label={c.label} value={c.v} team={c.team} bldg={c.bldg} />
        ))}
      </div>

      <section className="mb-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold"><ShieldAlert className="size-4 text-destructive" />Safety Focused Activities</h2>
          {isAdmin && (
            <Button size="sm" disabled={safety.isPending} onClick={() => safety.mutate()}>
              {safety.isPending ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <AlertTriangle className="mr-1.5 size-3.5" />}
              {safety.data ? "다시 분석" : "안전 위험 분석"}
            </Button>
          )}
        </div>
        <SafetyBlock
          pending={safety.isPending}
          error={(safety.error as Error | null) ?? null}
          {...(safety.data ? { risks: safety.data.risks, at: safety.data.generatedAt } : {})}
          empty={groups.start.length + groups.ongoing.length + groups.finish.length + tc.length === 0}
          canAnalyze={isAdmin}
        />
      </section>

      <section className="mb-5">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold"><HardHat className="size-4 text-primary" />Today's Activities</h2>
        <div className="space-y-3">
          {TODAY_GROUPS.map((g) => (
            <ActivityGroup key={g.key} gkey={g.key} label={g.label} desc={g.desc} rows={groups[g.key]} />
          ))}
        </div>
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-sm font-bold">Today's T&amp;C</h2>
        <TcBlock list={tc} />
      </section>

     </AppShell>
  );
}

function KpiCard({ label, value, team, bldg }: { label: string; value: number; team: { label: string; v: number }[]; bldg: { label: string; v: number }[] }) {
  const [tab, setTab] = useState<"team" | "bldg">("team");
  const items = tab === "team" ? team : bldg;
  return (
    <div className={card}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-end gap-3">
        <p className="text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>
        <div className="ml-auto flex gap-0.5 rounded-md bg-muted p-0.5">
          <button
            type="button"
            onClick={() => setTab("team")}
            className={`rounded px-2 py-0.5 text-[11px] font-semibold transition ${tab === "team" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            팀별
          </button>
          <button
            type="button"
            onClick={() => setTab("bldg")}
            className={`rounded px-2 py-0.5 text-[11px] font-semibold transition ${tab === "bldg" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            건물별
          </button>
        </div>
      </div>
      {items.length > 0 && (
        <div className="mt-2 max-h-24 overflow-auto border-t border-border/60 pt-1.5">
          <table className="w-full text-[11px]">
            <tbody>
              {items.map((x) => (
                <tr key={x.label} className="border-b border-border/30 last:border-0">
                  <td className="py-0.5 text-muted-foreground">{x.label}</td>
                  <td className="py-0.5 text-right font-semibold tabular-nums">{x.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ActivityGroup({ gkey, label, desc, rows }: { gkey: TodayGroupKey; label: string; desc: string; rows: Row[] }) {
  const [open, setOpen] = useState(true);
  const tone = gkey === "start" ? "text-primary" : gkey === "finish" ? "text-emerald-600" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        {open ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
        <strong className={`text-sm ${tone}`}>{label}</strong>
        <span className="text-[11px] text-muted-foreground">{desc}</span>
        <span className="ml-auto rounded bg-accent px-2 py-0.5 text-xs font-bold tabular-nums">{rows.length}</span>
      </button>
      {open && (
        rows.length === 0 ? (
          <p className="border-t border-border px-4 py-4 text-xs text-muted-foreground">해당 항목이 없습니다.</p>
        ) : (
          <div className="max-h-[60vh] overflow-auto border-t border-border">
            <table className="w-full min-w-[1000px] text-xs">
              <thead className="text-[11px] uppercase text-muted-foreground">
                <tr>
                  {["공종", "건물", "Room", "Activity", "MS", "협력사", "수량", "계획%", "실적%", "시작", "종료", "상태"].map((h) => (
                    <th key={h} className="sticky top-0 z-10 whitespace-nowrap border-b border-border bg-muted px-2 py-1.5 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const late = isLate(r);
                  return (
                    <tr key={r.id} className={`border-b border-border/60 ${late ? "bg-destructive/5" : ""}`}>
                      <td className="whitespace-nowrap px-2 py-1.5">{SLOT_LABEL[r.slot] ?? r.slot}</td>
                      <td className="whitespace-nowrap px-2 py-1.5">{r.bldg ?? "—"}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">{r.room ?? "—"}</td>
                      <td className="max-w-[320px] truncate px-2 py-1.5" title={r.act}>
                        <Link to="/schedule" search={{ q: r.act }} className="hover:underline">{r.act}</Link>
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5">{r.ms ?? "—"}</td>
                      <td className="max-w-[140px] truncate px-2 py-1.5 text-muted-foreground" title={r.sub ?? ""}>{r.sub ?? "—"}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-muted-foreground">{r.done ?? "—"}/{r.tot ?? "—"}{r.unit ?? ""}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{pct1(r.pl)}</td>
                      <td className={`whitespace-nowrap px-2 py-1.5 text-right tabular-nums ${late ? "font-bold text-destructive" : ""}`}>{pct1(r.pc)}</td>
                      <td className="whitespace-nowrap px-2 py-1.5">{fmtShortDate(r.s)}</td>
                      <td className="whitespace-nowrap px-2 py-1.5">{fmtShortDate(r.e)}</td>
                      <td className="whitespace-nowrap px-2 py-1.5">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          r.pc != null && r.pc >= 0.995 ? "bg-emerald-500/15 text-emerald-600"
                          : late ? "bg-destructive/15 text-destructive"
                          : r.pc ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                          {r.pc != null && r.pc >= 0.995 ? "완료" : late ? "지연" : r.pc ? "진행" : "미착수"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

function TcBlock({ list }: { list: ReturnType<typeof todayTc> }) {
  if (!list.length) return <div className={card}><p className="text-xs text-muted-foreground">금일 계획된 T&amp;C 단계가 없습니다.</p></div>;
  const stages = [...new Set(list.map((t) => t.stage))] as TcStage[];
  return (
    <div className="space-y-3">
      {stages.map((st) => {
        const items = list.filter((t) => t.stage === st);
        return (
          <div key={st} className="rounded-lg border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <strong className="text-sm">{st}</strong>
              <span className="text-[11px] text-muted-foreground">{TC_STAGE_SUB[st]}</span>
              <span className="ml-auto rounded bg-accent px-2 py-0.5 text-xs font-bold tabular-nums">{items.length}</span>
            </div>
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full min-w-[820px] text-xs">
                <thead className="text-[11px] uppercase text-muted-foreground">
                  <tr>
                    {["공종", "건물", "Group", "Item", "Equipment", "수량", "공급사", "상태"].map((h) => (
                      <th key={h} className="sticky top-0 z-10 whitespace-nowrap border-b border-border bg-muted px-2 py-1.5 text-left font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((t) => (
                    <tr key={`${st}-${t.item.id}`} className="border-b border-border/60">
                      <td className="whitespace-nowrap px-2 py-1.5">{TC_DISC_LABEL[t.item.discipline] ?? t.item.discipline}</td>
                      <td className="whitespace-nowrap px-2 py-1.5">
                        <Link
                          to="/tc/list"
                          search={{ disc: t.item.discipline, stage: st, ...(t.item.bldg ? { bldg: t.item.bldg } : {}), ...(t.item.item ? { item: t.item.item } : {}) }}
                          className="hover:underline"
                        >
                          {t.item.bldg ?? "—"}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">{t.item.grp ?? "—"}</td>
                      <td className="max-w-[220px] truncate px-2 py-1.5" title={t.item.item ?? ""}>{t.item.item ?? "—"}</td>
                      <td className="max-w-[220px] truncate px-2 py-1.5 text-muted-foreground" title={t.item.equip ?? ""}>{t.item.equip ?? "—"}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{t.item.qty}</td>
                      <td className="max-w-[140px] truncate px-2 py-1.5 text-muted-foreground" title={t.item.supplier ?? ""}>{t.item.supplier ?? "—"}</td>
                      <td className="whitespace-nowrap px-2 py-1.5">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${t.done ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-700"}`}>
                          {t.done ? "완료" : "미완료"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SafetyBlock({ pending, error, risks, at, empty, canAnalyze }: { pending: boolean; error: Error | null; risks?: SafetyRisk[]; at?: string; empty: boolean; canAnalyze: boolean }) {
  if (pending) return <div className={card}><p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />당일 작업을 분석하는 중입니다…</p></div>;
  if (error) return <div className={`${card} border-destructive/40`}><p className="text-xs text-destructive">{error.message}</p></div>;
  if (!risks) {
    return (
      <div className={card}>
        <p className="text-xs text-muted-foreground">
          {empty ? "금일 해당하는 작업이 없어 분석할 대상이 없습니다." : canAnalyze ? "‘안전 위험 분석’ 버튼을 누르면 금일 공정·시운전 작업 중 안전 주의가 필요한 High Risk 작업을 선별합니다." : "안전 위험 분석은 관리자 권한이 필요합니다. 관리자에게 문의하세요."}
        </p>
      </div>
    );
  }
  if (!risks.length) return <div className={card}><p className="text-xs text-muted-foreground">특별히 주의가 필요한 고위험 작업이 확인되지 않았습니다.</p></div>;
  return (
    <div>
      <div className="grid gap-3 lg:grid-cols-2">
        {risks.map((r, i) => {
          const high = r.level === "High";
          return (
            <div key={i} className={`flex gap-3 rounded-lg border p-4 ${high ? "border-destructive/50 bg-destructive/5" : "border-amber-500/50 bg-amber-500/5"}`}>
              {r.hazardType.length > 0 && (
                <div className="flex w-16 shrink-0 flex-col items-start gap-1 border-r border-border/60 pr-3">
                  {r.hazardType.map((t) => (
                    <span key={t} className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold ${hazardTypeClass(t)}`}>{t}</span>
                  ))}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${high ? "bg-destructive text-destructive-foreground" : "bg-amber-500 text-white"}`}>{r.level}</span>
                  <strong className="text-sm">{r.title}</strong>
                </div>
                <p className="mb-2 text-[11px] text-muted-foreground">{r.bldg} · {r.sub}</p>
                <p className="text-xs leading-relaxed"><b className={high ? "text-destructive" : "text-amber-700"}>위험 요인</b> {r.hazard}</p>
                <p className="mt-1 text-xs leading-relaxed"><b className="text-foreground">권고 조치</b> {r.action}</p>
              </div>
            </div>
          );
        })}
      </div>
      {at && <p className="mt-2 text-[11px] text-muted-foreground">AI 분석 · {new Date(at).toLocaleString("ko-KR")}</p>}
    </div>
  );
}

/** 위험 유형별 뱃지 색상 */
function hazardTypeClass(t: string): string {
  if (t.includes("낙하") || t.includes("추락")) return "bg-sky-600/15 text-sky-700 dark:text-sky-300";
  if (t.includes("전도")) return "bg-violet-600/15 text-violet-700 dark:text-violet-300";
  if (t.includes("붕괴")) return "bg-stone-600/15 text-stone-700 dark:text-stone-300";
  if (t.includes("비래")) return "bg-sky-800/15 text-sky-800 dark:text-sky-200";
  if (t.includes("감전")) return "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300";
  if (t.includes("화재") || t.includes("폭발")) return "bg-red-600/15 text-red-700 dark:text-red-300";
  if (t.includes("질식") || t.includes("밀폐")) return "bg-purple-600/15 text-purple-700 dark:text-purple-300";
  if (t.includes("협착")) return "bg-orange-600/15 text-orange-700 dark:text-orange-300";
  if (t.includes("기계") || t.includes("장비")) return "bg-slate-600/15 text-slate-700 dark:text-slate-300";
  if (t.includes("감김") || t.includes("절단")) return "bg-rose-600/15 text-rose-700 dark:text-rose-300";
  if (t.includes("화학")) return "bg-emerald-600/15 text-emerald-700 dark:text-emerald-300";
  return "bg-muted text-muted-foreground";
}
