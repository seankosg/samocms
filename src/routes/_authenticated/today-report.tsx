import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { projectQuery, useProject } from "@/lib/use-project";
import { SLOT_LABEL } from "@/lib/schedule-model";
import { jeddahToday, splitToday, todayTc, byTeam, byBldg, fmtToday } from "@/lib/today-model";
import { SLOT_LABEL_EN, fmtTodayEn, type Lang } from "@/lib/today-i18n";
import { getSafetyReport } from "@/lib/safety.functions";

export const Route = createFileRoute("/_authenticated/today-report")({
  head: () => ({ meta: [
    { title: "일일 안전 리포트 | HMMME 통합 공정 관리" },
    { name: "description", content: "제다 현지 날짜 기준 금일 작업 요약과 High Risk 안전 작업을 담은 A4 1장 근로자 배포용 안전 리포트." },
    { property: "og:title", content: "HMMME 일일 안전 리포트" },
    { property: "og:description", content: "금일 작업 요약 · High Risk 작업 · 안전 조치 · 근로자 배포용 A4 1장" },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  validateSearch: (s: Record<string, unknown>) =>
    z.object({ lang: z.enum(["ko", "en"]), print: z.boolean().optional() }).parse({
      lang: s["lang"] === "en" ? "en" : "ko",
      print: s["print"] === true || s["print"] === "1" || s["print"] === "true" ? true : undefined,
    }),
  loader: ({ context }) => context.queryClient.ensureQueryData(projectQuery),
  errorComponent: () => <div role="alert" className="p-8">안전 리포트 데이터를 불러오지 못했습니다.</div>,
  component: TodayReportPage,
});

const L = {
  ko: {
    title: "SAMO 현장 일일 안전 리포트",
    sub: "근로자 배포용 · 제다 현지(UTC+3) 기준",
    print: "인쇄 / PDF 저장",
    close: "닫기",
    kpi: ["금일 전체 작업", "신규 착수", "지속 진행", "금일 종결", "T&C 계획"],
    byTeam: "팀별 금일 작업",
    byBldg: "건물별 금일 작업",
    riskTitle: "금일 중점 안전 관리 작업 (SAFETY FOCUSED ACTIVITIES)",
    high: "High", med: "Medium",
    hazard: "위험 요인",
    action: "권고 안전 조치",
    none: "AI 안전 분석 결과가 아직 없습니다. ‘오늘의 주요 작업’ 화면에서 분석을 생성한 뒤 다시 출력해 주세요.",
    rules: "공통 안전 수칙",
    ruleList: [
      "작업 전 TBM(Tool Box Meeting) 및 위험성 평가 확인",
      "안전모·안전화·안전대 등 개인보호구 상시 착용",
      "고소작업·화기작업·밀폐공간은 반드시 작업허가서(PTW) 발급 후 착수",
      "중량물 양중 시 신호수 배치 및 하부 출입 통제",
      "전기 작업은 정전 확인 및 LOTO(잠금·표찰) 시행",
      "이상 징후 발견 시 즉시 작업 중지 후 관리감독자 보고",
    ],
    sign: "확인 (관리감독자)",
    signW: "확인 (작업반장)",
    at: "AI 분석",
  },
  en: {
    title: "SAMO Site Daily Safety Report",
    sub: "For workforce distribution · Jeddah local time (UTC+3)",
    print: "Print / Save as PDF",
    close: "Close",
    kpi: ["Total Activities", "Commencing", "Ongoing", "Completing", "T&C Scheduled"],
    byTeam: "Activities by Trade",
    byBldg: "Activities by Building",
    riskTitle: "SAFETY FOCUSED ACTIVITIES OF THE DAY",
    high: "High", med: "Medium",
    hazard: "Hazard",
    action: "Control Measure",
    none: "No AI safety analysis is available yet. Generate it on the Today's Main Activities page and print again.",
    rules: "General Safety Rules",
    ruleList: [
      "Attend TBM (Tool Box Meeting) and confirm the risk assessment before starting work",
      "Wear PPE at all times: hard hat, safety shoes, full body harness",
      "Work at height, hot work and confined space entry require a valid Permit To Work (PTW)",
      "Provide a banksman for lifting operations and barricade the area beneath the load",
      "Isolate and verify dead before electrical work; apply LOTO (Lock Out / Tag Out)",
      "Stop work immediately and report to the supervisor when an unsafe condition is found",
    ],
    sign: "Verified by (Supervisor)",
    signW: "Verified by (Foreman)",
    at: "AI analysis",
  },
} as const;

function TodayReportPage() {
  const { rows, tcItems } = useProject();
  const { lang, print } = Route.useSearch();
  const t = L[lang as Lang];
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(jeddahToday()), []);

  const groups = useMemo(() => (today ? splitToday(rows, today) : null), [rows, today]);
  const tc = useMemo(() => (today ? todayTc(tcItems, today) : []), [tcItems, today]);

  const saved = useQuery({
    queryKey: ["safety-report", today, lang],
    queryFn: () => getSafetyReport({ data: { day: today!, lang } }),
    enabled: !!today,
    staleTime: 60_000,
  });

  const printed = useRef(false);
  useEffect(() => {
    if (!print || printed.current || !today || saved.isLoading) return;
    printed.current = true;
    const h = setTimeout(() => window.print(), 500);
    return () => clearTimeout(h);
  }, [print, today, saved.isLoading]);

  if (!today || !groups) return <div className="p-8 text-sm">…</div>;

  const teamOf = (s: string) => (lang === "en" ? SLOT_LABEL_EN[s] ?? s : SLOT_LABEL[s] ?? s);
  const allRows = [...new Map([...groups.start, ...groups.ongoing, ...groups.finish].map((r) => [r.id, r])).values()];
  const kpi = [allRows.length, groups.start.length, groups.ongoing.length, groups.finish.length, tc.length];
  const teams = byTeam(allRows).map((x) => ({ ...x, label: teamOf(x.label) }));
  const bldgs = byBldg(allRows).slice(0, 8);
  const risks = saved.data?.risks ?? [];
  const dateLabel = lang === "en" ? fmtTodayEn(today) : fmtToday(today);
  const title = `${t.title} [${dateLabel}]`;

  return (
    <div className="min-h-screen bg-muted/40 py-6 print:bg-white print:py-0">
      <style>{`
        @page { size: A4 portrait; margin: 10mm; }
        @media print {
          html, body { background: #fff !important; }
          .no-print { display: none !important; }
          .sheet { width: auto !important; min-height: 0 !important; margin: 0 !important; box-shadow: none !important; border: 0 !important; }
          .avoid-break { page-break-inside: avoid; break-inside: avoid; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-2 px-2">
        <p className="text-sm font-semibold">{title}</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => window.print()}><Printer className="mr-1 size-4" />{t.print}</Button>
          <Button size="sm" variant="outline" asChild><Link to="/today"><X className="mr-1 size-4" />{t.close}</Link></Button>
        </div>
      </div>

      <div className="sheet mx-auto w-[210mm] bg-white p-[10mm] text-slate-900 shadow-lg">
        <header className="flex items-end justify-between border-b-2 border-[#1e3a5f] pb-2">
          <div>
            <h1 className="text-[17px] font-bold text-[#1e3a5f]">{t.title}</h1>
            <p className="mt-0.5 text-[10px] text-slate-500">{t.sub}</p>
          </div>
          <div className="text-right">
            <p className="text-[13px] font-bold tabular-nums">{dateLabel}</p>
            {saved.data?.generatedAt && (
              <p className="text-[9px] text-slate-500">{t.at} {new Date(saved.data.generatedAt).toLocaleString(lang === "en" ? "en-GB" : "ko-KR")}</p>
            )}
          </div>
        </header>

        <section className="avoid-break mt-3 grid grid-cols-5 gap-2">
          {t.kpi.map((k, i) => (
            <div key={k} className="rounded border border-slate-300 px-2 py-1.5 text-center">
              <p className="text-[9px] text-slate-500">{k}</p>
              <p className="text-[19px] font-bold leading-tight tabular-nums text-[#1e3a5f]">{kpi[i]}</p>
            </div>
          ))}
        </section>

        <section className="avoid-break mt-2 grid grid-cols-2 gap-2">
          {[{ h: t.byTeam, list: teams }, { h: t.byBldg, list: bldgs }].map((b) => (
            <div key={b.h} className="rounded border border-slate-300">
              <p className="border-b border-slate-300 bg-slate-100 px-2 py-1 text-[9px] font-bold tracking-wide text-slate-700">{b.h}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-2 py-1.5 text-[10px]">
                {b.list.length === 0 ? <span className="text-slate-400">—</span> : b.list.map((x) => (
                  <span key={x.label}><span className="text-slate-600">{x.label}</span> <b className="tabular-nums">{x.v}</b></span>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="mt-3">
          <div className="flex items-center gap-2 rounded-t bg-[#b91c1c] px-2 py-1">
            <span className="text-[10px] font-bold tracking-[0.12em] text-white">{t.riskTitle}</span>
            <span className="ml-auto text-[9px] text-red-100">{risks.length}</span>
          </div>
          <div className="rounded-b border border-t-0 border-slate-300">
            {risks.length === 0 ? (
              <p className="px-2 py-3 text-[10px] text-slate-500">{t.none}</p>
            ) : (
              <table className="w-full text-[9.5px]">
                <thead>
                  <tr className="bg-slate-100 text-left text-[9px] text-slate-600">
                    <th className="w-[46px] border-b border-slate-300 px-1.5 py-1">Risk</th>
                    <th className="border-b border-slate-300 px-1.5 py-1">Activity</th>
                    <th className="w-[92px] border-b border-slate-300 px-1.5 py-1">Area / Sub</th>
                    <th className="border-b border-slate-300 px-1.5 py-1">{t.hazard}</th>
                    <th className="border-b border-slate-300 px-1.5 py-1">{t.action}</th>
                  </tr>
                </thead>
                <tbody>
                  {risks.map((r, i) => (
                    <tr key={i} className="avoid-break align-top">
                      <td className="border-b border-slate-200 px-1.5 py-1">
                        <span className={`rounded px-1 py-0.5 text-[8.5px] font-bold ${r.level === "High" ? "bg-red-600 text-white" : "bg-amber-400 text-slate-900"}`}>
                          {r.level === "High" ? t.high : t.med}
                        </span>
                        {r.hazardType.length > 0 && (
                          <div className="mt-0.5 space-y-0.5">
                            {r.hazardType.map((h) => (
                              <div key={h} className="rounded bg-slate-200 px-1 py-[1px] text-[8px] font-semibold text-slate-700">{h}</div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="border-b border-slate-200 px-1.5 py-1 font-semibold">{r.title}</td>
                      <td className="border-b border-slate-200 px-1.5 py-1 text-slate-600">{r.bldg}<br />{r.sub}</td>
                      <td className="border-b border-slate-200 px-1.5 py-1">
                        {Array.isArray(r.hazard) ? (
                          <ul className="space-y-[1px]">{r.hazard.map((k) => <li key={k}>· {k}</li>)}</ul>
                        ) : r.hazard}
                        {r.hazardDetail ? <div className="mt-[1px] text-[8.5px] text-slate-500">{r.hazardDetail}</div> : null}
                      </td>
                      <td className="border-b border-slate-200 px-1.5 py-1 text-slate-700">
                        {Array.isArray(r.action) ? (
                          <ul className="space-y-[1px]">{r.action.map((k) => <li key={k}>· {k}</li>)}</ul>
                        ) : r.action}
                        {r.actionDetail ? <div className="mt-[1px] text-[8.5px] text-slate-500">{r.actionDetail}</div> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className="avoid-break mt-3 rounded border border-slate-300">
          <p className="border-b border-slate-300 bg-slate-100 px-2 py-1 text-[9px] font-bold tracking-wide text-slate-700">{t.rules}</p>
          <ol className="grid grid-cols-2 gap-x-4 gap-y-0.5 px-3 py-1.5 text-[9.5px] text-slate-700">
            {t.ruleList.map((r, i) => (
              <li key={r} className="list-none">{i + 1}. {r}</li>
            ))}
          </ol>
        </section>

        <footer className="avoid-break mt-3 flex gap-3 text-[9px] text-slate-500">
          {[t.sign, t.signW].map((s) => (
            <div key={s} className="flex-1 border-t border-slate-400 pt-1">{s}</div>
          ))}
        </footer>
      </div>
    </div>
  );
}
