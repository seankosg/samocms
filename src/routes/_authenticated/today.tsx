import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, ChevronRight, HardHat, Languages, Loader2, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { projectQuery, useProject } from "@/lib/use-project";
import { SLOT_LABEL, fmtShortDate, isLate, pct1, type Row } from "@/lib/schedule-model";
import { TC_STAGE_SUB, TC_DISC_LABEL, type TcStage } from "@/lib/tc-model";
import { TODAY_GROUPS, fmtToday, jeddahToday, safetyFacts, splitToday, todayTc, byTeam, byBldg, type TodayGroupKey } from "@/lib/today-model";
import { T, SLOT_LABEL_EN, TC_STAGE_SUB_EN, fmtTodayEn, type Lang } from "@/lib/today-i18n";
import { analyzeSafety, getSafetyReport, type SafetyRisk } from "@/lib/safety.functions";
import { useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/_authenticated/today")({
  head: () => ({ meta: [
    { title: "오늘의 주요 작업 | HMMME 통합 공정 관리" },
    { name: "description", content: "사우디아라비아 제다 현지 날짜 기준 금일 착수·진행·종결 공정과 T&C 계획, AI 안전 위험 작업을 한 화면에서 확인합니다." },
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
  const [lang, setLang] = useState<Lang>("ko");
  const t = T[lang];
  const [today, setToday] = useState<string | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  // 제다 현지 자정(00:01) 롤오버 자동 감지 — 날짜가 바뀌면 화면·분석을 새 날짜로 갱신
  useEffect(() => {
    setToday(jeddahToday());
    const iv = setInterval(() => setToday((prev) => (prev === jeddahToday() ? prev : jeddahToday())), 30_000);
    return () => clearInterval(iv);
  }, []);

  const groups = useMemo(() => (today ? splitToday(rows, today) : null), [rows, today]);
  const tc = useMemo(() => (today ? todayTc(tcItems, today) : []), [tcItems, today]);

  const qc = useQueryClient();
  const saved = useQuery({
    queryKey: ["safety-report", today, lang],
    queryFn: () => getSafetyReport({ data: { day: today!, lang } }),
    enabled: !!today,
    staleTime: 60_000,
  });

  const safety = useMutation({
    mutationFn: (force: boolean) => analyzeSafety({ data: { day: today!, facts: safetyFacts(groups!, tc, today!), force, lang } }),
    onSuccess: (res) => qc.setQueryData(["safety-report", today, res.lang], res),
  });

  // 당일 저장된 분석이 없으면 자동 생성 (언어별 1회, 사용자 조작 불필요)
  const autoRef = useRef<string | null>(null);
  const hasWork = !!groups && groups.start.length + groups.ongoing.length + groups.finish.length + tc.length > 0;
  useEffect(() => {
    if (!today || !saved.isSuccess || saved.data || !hasWork) return;
    const k = `${today}:${lang}`;
    if (autoRef.current === k || safety.isPending) return;
    autoRef.current = k;
    safety.mutate(false);
  }, [today, lang, saved.isSuccess, saved.data, hasWork, safety]);

  const report = (safety.data?.lang === lang ? safety.data : null) ?? saved.data ?? null;

  const toggle = (
    <div className="flex shrink-0 gap-0.5 rounded-md bg-muted p-0.5">
      {(["ko", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold transition ${lang === l ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          {l === "ko" ? <Languages className="size-3.5" /> : null}
          {l === "ko" ? "한국어" : "ENG"}
        </button>
      ))}
    </div>
  );

  if (!today || !groups) {
    return (
      <AppShell title={t.pageTitle} desc={t.pageDesc}>
        <div className={card}>{t.loadingDate}</div>
      </AppShell>
    );
  }

  const teamOf = (slot: string) => (lang === "en" ? SLOT_LABEL_EN[slot] ?? slot : SLOT_LABEL[slot] ?? slot);
  const bldgOf = (b: string | null | undefined) => (b == null || b === "(미지정)" ? t.unassigned : b);
  const allRows = [...new Map([...groups.start, ...groups.ongoing, ...groups.finish].map((r) => [r.id, r])).values()];
  const kpiCards: { key: FocusCard; label: string; desc: string; v: number; team: { label: string; v: number }[]; bldg: { label: string; v: number }[]; tone: string }[] = [
    { key: "all", label: t.cards.all[0], desc: t.cards.all[1], v: allRows.length, team: byTeam(allRows).map((x) => ({ ...x, label: teamOf(x.label) })), bldg: byBldg(allRows).map((x) => ({ ...x, label: bldgOf(x.label) })), tone: "text-foreground" },
    { key: "start", label: t.cards.start[0], desc: t.cards.start[1], v: groups.start.length, team: byTeam(groups.start).map((x) => ({ ...x, label: teamOf(x.label) })), bldg: byBldg(groups.start).map((x) => ({ ...x, label: bldgOf(x.label) })), tone: "text-primary" },
    { key: "ongoing", label: t.cards.ongoing[0], desc: t.cards.ongoing[1], v: groups.ongoing.length, team: byTeam(groups.ongoing).map((x) => ({ ...x, label: teamOf(x.label) })), bldg: byBldg(groups.ongoing).map((x) => ({ ...x, label: bldgOf(x.label) })), tone: "text-foreground" },
    { key: "finish", label: t.cards.finish[0], desc: t.cards.finish[1], v: groups.finish.length, team: byTeam(groups.finish).map((x) => ({ ...x, label: teamOf(x.label) })), bldg: byBldg(groups.finish).map((x) => ({ ...x, label: bldgOf(x.label) })), tone: "text-emerald-600" },
    { key: "tc", label: t.cards.tc[0], desc: t.cards.tc[1], v: tc.length, team: byTeam(tc).map((x) => ({ ...x, label: teamOf(x.label) })), bldg: byBldg(tc).map((x) => ({ ...x, label: bldgOf(x.label) })), tone: "text-sky-600" },
  ];

  const matchRow = (r: Row) => !focus || !focus.val || (focus.by === "team" ? teamOf(r.dept) === focus.val : bldgOf(r.bldg) === focus.val);
  const matchTc = (x: (typeof tc)[number]) =>
    !focus || !focus.val || (focus.by === "team" ? teamOf(x.item.discipline) === focus.val : bldgOf(x.item.bldg) === focus.val);

  const shownGroups = TODAY_GROUPS.filter((g) => !focus || focus.card === "all" || focus.card === g.key);
  const showActivities = !focus || focus.card !== "tc";
  const showTc = !focus || focus.card === "tc";
  const shownTc = tc.filter(matchTc);

  return (
    <AppShell title={t.pageTitle} desc={`${lang === "en" ? fmtTodayEn(today) : fmtToday(today)} · ${t.pageDesc}`}>
      <div className="mb-3 flex justify-end">{toggle}</div>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {kpiCards.map((c) => (
          <KpiCard
            key={c.key}
            label={c.label}
            desc={c.desc}
            tone={c.tone}
            value={c.v}
            team={c.team}
            bldg={c.bldg}
            lang={lang}
            active={focus?.card === c.key ? focus : null}
            onPick={(by, val) => setFocus((f) => (f && f.card === c.key && f.by === by && f.val === val ? null : { card: c.key, by, val }))}
          />
        ))}
      </div>

      {focus && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-xs">
          <span className="font-semibold text-primary">{t.drill}</span>
          <span className="rounded bg-background px-2 py-0.5 font-medium">{kpiCards.find((c) => c.key === focus.card)?.label}</span>
          {focus.val && <span className="rounded bg-background px-2 py-0.5 font-medium">{focus.by === "team" ? t.team : t.bldg} · {focus.val}</span>}
          <Button size="sm" variant="ghost" className="ml-auto h-7 px-2 text-xs" onClick={() => setFocus(null)}>{t.clearFilter}</Button>
        </div>
      )}

      <section className="mb-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold"><ShieldAlert className="size-4 text-destructive" />{t.safety}</h2>
          {isAdmin && (
            <Button size="sm" disabled={safety.isPending} onClick={() => safety.mutate(true)}>
              {safety.isPending ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <AlertTriangle className="mr-1.5 size-3.5" />}
              {report ? t.reanalyze : t.analyze}
            </Button>
          )}
        </div>
        <SafetyBlock
          lang={lang}
          pending={safety.isPending || saved.isLoading}
          error={(safety.error as Error | null) ?? null}
          {...(report ? { risks: report.risks, at: report.generatedAt ?? undefined } : {})}
          empty={groups.start.length + groups.ongoing.length + groups.finish.length + tc.length === 0}
        />
      </section>

      {showActivities && (
        <section id="today-activities" className="mb-5">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold"><HardHat className="size-4 text-primary" />{t.activities}</h2>
          <div className="space-y-3">
            {shownGroups.map((g) => (
              <ActivityGroup
                key={g.key}
                gkey={g.key}
                lang={lang}
                label={t.groups[g.key][0]}
                desc={t.groups[g.key][1]}
                rows={groups[g.key].filter(matchRow)}
              />
            ))}
          </div>
        </section>
      )}

      {showTc && (
        <section id="today-tc" className="mb-5">
          <h2 className="mb-2 text-sm font-bold">{t.tcSection}</h2>
          <TcBlock list={shownTc} lang={lang} />
        </section>
      )}

     </AppShell>
  );
}

type FocusCard = "all" | TodayGroupKey | "tc";
type Focus = { card: FocusCard; by: "team" | "bldg"; val: string | null };

function KpiCard({ label, desc, tone, value, team, bldg, active, onPick, lang }: {
  label: string; desc: string; tone: string; value: number;
  team: { label: string; v: number }[]; bldg: { label: string; v: number }[];
  active: Focus | null; onPick: (by: "team" | "bldg", val: string | null) => void; lang: Lang;
}) {
  const t = T[lang];
  const [tab, setTab] = useState<"team" | "bldg">("team");
  const items = tab === "team" ? team : bldg;
  return (
    <div className={`${card} flex min-h-[190px] flex-col ${active ? "border-primary ring-1 ring-primary/40" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{label}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{desc}</p>
        </div>
        <div className="flex shrink-0 gap-0.5 rounded-md bg-muted p-0.5">
          {(["team", "bldg"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`rounded px-2 py-1 text-xs font-semibold transition ${tab === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {k === "team" ? t.tabTeam : t.tabBldg}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-1 items-stretch gap-3">
        <button
          type="button"
          onClick={() => onPick(tab, null)}
          className={`flex w-[38%] shrink-0 flex-col justify-center rounded-md px-2 py-1 text-left transition hover:bg-accent ${active && !active.val ? "bg-accent" : ""}`}
        >
          <span className={`text-4xl font-bold leading-none tabular-nums ${tone}`}>{value.toLocaleString()}</span>
          <span className="mt-1 text-xs text-muted-foreground">{t.unitClick}</span>
        </button>
        <div className="min-w-0 flex-1 border-l border-border/60 pl-3">
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t.noDetail}</p>
          ) : (
            <div className="max-h-[124px] overflow-auto pr-1">
              <table className="w-full text-xs">
                <tbody>
                  {items.map((x) => {
                    const on = active?.by === tab && active.val === x.label;
                    return (
                      <tr key={x.label} className="border-b border-border/30 last:border-0">
                        <td colSpan={2} className="p-0">
                          <button
                            type="button"
                            onClick={() => onPick(tab, x.label)}
                            className={`flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left transition hover:bg-accent ${on ? "bg-accent font-semibold" : ""}`}
                          >
                            <span className="truncate text-muted-foreground">{x.label}</span>
                            <span className="shrink-0 font-semibold tabular-nums">{x.v}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


function ActivityGroup({ gkey, label, desc, rows, lang }: { gkey: TodayGroupKey; label: string; desc: string; rows: Row[]; lang: Lang }) {
  const t = T[lang];
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
          <p className="border-t border-border px-4 py-4 text-xs text-muted-foreground">{t.noRows}</p>
        ) : (
          <div className="max-h-[60vh] overflow-auto border-t border-border">
            <table className="w-full min-w-[1000px] text-xs">
              <thead className="text-[11px] uppercase text-muted-foreground">
                <tr>
                  {t.actCols.map((h) => (
                    <th key={h} className="sticky top-0 z-10 whitespace-nowrap border-b border-border bg-muted px-2 py-1.5 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const late = isLate(r);
                  const slot = lang === "en" ? SLOT_LABEL_EN[r.slot] ?? r.slot : SLOT_LABEL[r.slot] ?? r.slot;
                  return (
                    <tr key={r.id} className={`border-b border-border/60 ${late ? "bg-destructive/5" : ""}`}>
                      <td className="whitespace-nowrap px-2 py-1.5">{slot}</td>
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
                          {r.pc != null && r.pc >= 0.995 ? t.st.done : late ? t.st.late : r.pc ? t.st.wip : t.st.ns}
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

function TcBlock({ list, lang }: { list: ReturnType<typeof todayTc>; lang: Lang }) {
  const t = T[lang];
  if (!list.length) return <div className={card}><p className="text-xs text-muted-foreground">{t.noTc}</p></div>;
  const stages = [...new Set(list.map((x) => x.stage))] as TcStage[];
  return (
    <div className="space-y-3">
      {stages.map((st) => {
        const items = list.filter((x) => x.stage === st);
        return (
          <div key={st} className="rounded-lg border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <strong className="text-sm">{st}</strong>
              <span className="text-[11px] text-muted-foreground">{lang === "en" ? TC_STAGE_SUB_EN[st] : TC_STAGE_SUB[st]}</span>
              <span className="ml-auto rounded bg-accent px-2 py-0.5 text-xs font-bold tabular-nums">{items.length}</span>
            </div>
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full min-w-[820px] text-xs">
                <thead className="text-[11px] uppercase text-muted-foreground">
                  <tr>
                    {t.tcCols.map((h) => (
                      <th key={h} className="sticky top-0 z-10 whitespace-nowrap border-b border-border bg-muted px-2 py-1.5 text-left font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((x) => (
                    <tr key={`${st}-${x.item.id}`} className="border-b border-border/60">
                      <td className="whitespace-nowrap px-2 py-1.5">{TC_DISC_LABEL[x.item.discipline] ?? x.item.discipline}</td>
                      <td className="whitespace-nowrap px-2 py-1.5">
                        <Link
                          to="/tc/list"
                          search={{ disc: x.item.discipline, stage: st, ...(x.item.bldg ? { bldg: x.item.bldg } : {}), ...(x.item.item ? { item: x.item.item } : {}) }}
                          className="hover:underline"
                        >
                          {x.item.bldg ?? "—"}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">{x.item.grp ?? "—"}</td>
                      <td className="max-w-[220px] truncate px-2 py-1.5" title={x.item.item ?? ""}>{x.item.item ?? "—"}</td>
                      <td className="max-w-[220px] truncate px-2 py-1.5 text-muted-foreground" title={x.item.equip ?? ""}>{x.item.equip ?? "—"}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{x.item.qty}</td>
                      <td className="max-w-[140px] truncate px-2 py-1.5 text-muted-foreground" title={x.item.supplier ?? ""}>{x.item.supplier ?? "—"}</td>
                      <td className="whitespace-nowrap px-2 py-1.5">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${x.done ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-700"}`}>
                          {x.done ? t.st.done : t.st.incomplete}
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

function SafetyBlock({ pending, error, risks, at, empty, lang }: { pending: boolean; error: Error | null; risks?: SafetyRisk[]; at?: string; empty: boolean; lang: Lang }) {
  const t = T[lang];
  if (pending) return <div className={card}><p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />{t.analyzing}</p></div>;
  if (error) return <div className={`${card} border-destructive/40`}><p className="text-xs text-destructive">{error.message}</p></div>;
  if (!risks) {
    return (
      <div className={card}>
        <p className="text-xs text-muted-foreground">{empty ? t.noTarget : t.preparing}</p>
      </div>
    );
  }
  if (!risks.length) return <div className={card}><p className="text-xs text-muted-foreground">{t.noRisk}</p></div>;
  return (
    <div>
      <div className="grid gap-3 lg:grid-cols-2">
        {risks.map((r, i) => {
          const high = r.level === "High";
          return (
            <div key={i} className={`flex gap-3 rounded-lg border p-4 ${high ? "border-destructive/50 bg-destructive/5" : "border-amber-500/50 bg-amber-500/5"}`}>
              {r.hazardType.length > 0 && (
                <div className="flex w-16 shrink-0 flex-col items-start gap-1 border-r border-border/60 pr-3">
                  {r.hazardType.map((h) => (
                    <span key={h} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold leading-tight ${hazardTypeClass(h)}`}>{h}</span>
                  ))}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${high ? "bg-destructive text-destructive-foreground" : "bg-amber-500 text-white"}`}>{r.level}</span>
                  <strong className="text-sm">{r.title}</strong>
                </div>
                <p className="mb-2 text-[11px] text-muted-foreground">{r.bldg} · {r.sub}</p>
                <p className="text-xs leading-relaxed"><b className={high ? "text-destructive" : "text-amber-700"}>{t.hazard}</b> {r.hazard}</p>
                <p className="mt-1 text-xs leading-relaxed"><b className="text-foreground">{t.action}</b> {r.action}</p>
              </div>
            </div>
          );
        })}
      </div>
      {at && <p className="mt-2 text-[11px] text-muted-foreground">{t.aiAt} · {new Date(at).toLocaleString(lang === "en" ? "en-GB" : "ko-KR")}</p>}
    </div>
  );
}

/** 위험 유형별 뱃지 색상 (한/영 공통) */
function hazardTypeClass(t: string): string {
  const s = t.toLowerCase();
  if (t.includes("낙하물") || t.includes("비래") || s.includes("falling object")) return "bg-sky-800/15 text-sky-800 dark:text-sky-200";
  if (t.includes("낙하") || t.includes("추락") || s.includes("fall")) return "bg-sky-600/15 text-sky-700 dark:text-sky-300";
  if (t.includes("전도") || s.includes("overturn")) return "bg-violet-600/15 text-violet-700 dark:text-violet-300";
  if (t.includes("붕괴") || s.includes("collapse")) return "bg-stone-600/15 text-stone-700 dark:text-stone-300";
  if (t.includes("감전") || s.includes("electric")) return "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300";
  if (t.includes("화재") || t.includes("폭발") || s.includes("fire") || s.includes("explos")) return "bg-red-600/15 text-red-700 dark:text-red-300";
  if (t.includes("질식") || t.includes("밀폐") || s.includes("asphyx") || s.includes("confined")) return "bg-purple-600/15 text-purple-700 dark:text-purple-300";
  if (t.includes("협착") || s.includes("crush") || s.includes("caught")) return "bg-orange-600/15 text-orange-700 dark:text-orange-300";
  if (t.includes("기계") || t.includes("장비") || s.includes("machinery") || s.includes("equipment")) return "bg-slate-600/15 text-slate-700 dark:text-slate-300";
  if (t.includes("감김") || t.includes("절단") || s.includes("entangle") || s.includes("cut")) return "bg-rose-600/15 text-rose-700 dark:text-rose-300";
  if (t.includes("화학") || s.includes("chemical")) return "bg-emerald-600/15 text-emerald-700 dark:text-emerald-300";
  return "bg-muted text-muted-foreground";
}
