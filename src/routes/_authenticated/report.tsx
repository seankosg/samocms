import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { projectQuery, useProject } from "@/lib/use-project";
import { fmtDate, fmtShortDate, pct1, SLOT_LABEL } from "@/lib/schedule-model";
import { buildReportMetrics, buildTcT1T2 } from "@/lib/report-metrics";
import { TC_DISC_LABEL } from "@/lib/tc-model";
import { generateExecSummary } from "@/lib/report.functions";

export const Route = createFileRoute("/_authenticated/report")({
  head: () => ({ meta: [
    { title: "Progress Report | SAMO 현장" },
    { name: "description", content: "기준일 기준 공정 진도, 지연 상세, 시운전 T1·T2 현황을 담은 A4 3페이지 리포트." },
    { property: "og:title", content: "SAMO 현장 Progress Report" },
    { property: "og:description", content: "대시보드 요약 · 지연 상세 · T&C T1/T2 현황" },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  validateSearch: (s: Record<string, unknown>) => z.object({ print: z.boolean().optional() }).parse({
    print: s["print"] === true || s["print"] === "1" || s["print"] === "true" ? true : undefined,
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(projectQuery),
  errorComponent: () => <div role="alert" className="p-8">리포트 데이터를 불러오지 못했습니다.</div>,
  component: ReportPage,
});

const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "");
const gapColor = (v: number) => (v < 0 ? "#b91c1c" : v > 0 ? "#1d4ed8" : "#475569");

function ReportPage() {
  const { rows, base, tcItems } = useProject();
  const { print } = Route.useSearch();
  const m = useMemo(() => buildReportMetrics(rows, base), [rows, base]);
  const tc = useMemo(() => buildTcT1T2(tcItems, base, (k) => TC_DISC_LABEL[k] ?? k.toUpperCase()), [tcItems, base]);

  const facts = useMemo(() => {
    const l: string[] = [];
    l.push(`전체 활동 ${m.total}건, 완료 ${m.done}건(${pct1(m.donePct)}%), 지연 ${m.late}건(${pct1(m.latePct)}%)`);
    l.push(`평균 계획 진도 ${pct1(m.pl)}%, 평균 실적 진도 ${pct1(m.pc)}%, 격차 ${pct1(m.pc - m.pl)}%p`);
    m.bySlot.forEach((s) => l.push(`공종 ${s.label}: 활동 ${s.total}건, 계획 ${pct1(s.pl)}%, 실적 ${pct1(s.pc)}%, 지연 ${s.late}건`));
    m.byMs.forEach((x) => l.push(`마일스톤 ${x.key}(${x.name}) 목표일 ${x.due ?? "미정"}, 총 ${x.total}건, 평균 실적 ${x.pc == null ? "—" : pct1(x.pc) + "%"}, 지연 ${x.late}건, D${x.dd == null ? "—" : (x.dd >= 0 ? "-" : "+") + Math.abs(x.dd)}`));
    m.bldg.slice(0, 5).forEach((b) => l.push(`건물 지연 상위: ${b.k} ${b.late}건`));
    m.sub.slice(0, 5).forEach((b) => l.push(`협력사 지연 상위: ${b.k} ${b.late}건`));
    tc.forEach((d) => l.push(`T&C ${d.label}: 총 ${d.qty} Qty, T1 완료 ${d.t1.doneQty}/잔여 ${d.t1.rem}(지연 ${d.t1.lateQty}), T2 완료 ${d.t2.doneQty}/잔여 ${d.t2.rem}(지연 ${d.t2.lateQty}), Pass ${d.pass}, Fail ${d.fail}`));
    return l.join("\n");
  }, [m, tc]);

  const ai = useQuery({
    queryKey: ["exec-summary", base, m.total, m.late],
    queryFn: () => generateExecSummary({ data: { base, facts } }),
    staleTime: 10 * 60_000,
    retry: false,
  });

  const printed = useRef(false);
  useEffect(() => {
    if (!print || printed.current) return;
    if (ai.isLoading) return;
    printed.current = true;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [print, ai.isLoading]);

  const title = `SAMO 현장 Progress Report [기준일 ${base}]`;

  return (
    <div className="min-h-screen bg-muted/40 py-6 print:bg-white print:py-0">
      <style>{`
        @page { size: A4 portrait; margin: 12mm 10mm; }
        @media print {
          html, body { background: #fff !important; }
          .no-print { display: none !important; }
          .sheet { width: auto !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; border: 0 !important; page-break-after: always; break-after: page; }
          .sheet:last-child { page-break-after: auto; break-after: auto; }
          thead { display: table-header-group; }
          tr, .avoid-break { page-break-inside: avoid; break-inside: avoid; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-2 px-2">
        <p className="text-sm font-semibold">{title}</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => window.print()}><Printer className="mr-1 size-4" />인쇄 / PDF 저장</Button>
          <Button size="sm" variant="outline" asChild><Link to="/dashboard"><X className="mr-1 size-4" />닫기</Link></Button>
        </div>
      </div>

      <Sheet>
        <Header title={title} page="1 / 3" sub="대시보드 요약" />
        <section className="avoid-break mt-3 rounded border border-slate-300 bg-slate-50 p-3">
          <h2 className="mb-1 text-[11px] font-bold tracking-wide text-slate-700">EXECUTIVE SUMMARY</h2>
          {ai.isLoading && <p className="text-[10px] text-slate-500">AI가 기준일 현황을 분석해 요약을 작성하는 중입니다…</p>}
          {ai.isError && <p className="text-[10px] text-red-700">AI 요약을 생성하지 못했습니다: {(ai.error as Error).message}</p>}
          {ai.data && (
            <div className="space-y-1.5 text-[10.5px] leading-relaxed text-slate-800">
              {ai.data.summary.split(/\n{1,}/).filter((p) => p.trim()).map((p, i) => <p key={i}>{p.trim()}</p>)}
            </div>
          )}
        </section>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <KpiCard label="총 활동" value={`${m.total.toLocaleString()}`} unit="행"
            note={`완료 ${m.done.toLocaleString()}행 · ${pct1(m.donePct)}%`} bar={m.donePct} />
          <KpiCard label="계획 대비 실적" value={`${pct1(m.pc)}%`} unit={`/ ${pct1(m.pl)}%`}
            note={`격차 ${sign(m.pc - m.pl)}${pct1(Math.abs(m.pc - m.pl))}%p · 대상 ${m.withP.toLocaleString()}행`} bar={m.pc} marker={m.pl} />
          <KpiCard label="지연" value={`${m.late.toLocaleString()}`} unit="건" tone="bad"
            note={`대상 ${m.withP.toLocaleString()}행 중 ${pct1(m.latePct)}%`} bar={m.latePct} />
        </div>

        <Block title="공종별 계획 · 실적 · 지연">
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                {["공종", "활동", "계획 완료(건)", "실적 완료(건)", "차이", "계획%", "실적%", "격차%p", "지연(건)"].map((h) => (
                  <th key={h} className="border border-slate-300 px-1.5 py-1 text-right first:text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.bySlot.map((s) => (
                <tr key={s.slot}>
                  <td className="border border-slate-300 px-1.5 py-1 font-semibold">{s.label}</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-right">{s.total}</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-right">{s.plan}</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-right font-semibold">{s.act}</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-right" style={{ color: gapColor(s.gap) }}>{sign(s.gap)}{Math.abs(s.gap)}</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-right">{pct1(s.pl)}</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-right font-semibold">{pct1(s.pc)}</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-right" style={{ color: gapColor(s.pc - s.pl) }}>{sign(s.pc - s.pl)}{pct1(Math.abs(s.pc - s.pl))}</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-right" style={{ color: s.late ? "#b91c1c" : undefined }}>{s.late}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Block>

        <Block title="마일스톤 현황 (M1~M8)">
          <div className="grid grid-cols-4 gap-1.5">
            {m.byMs.map((x) => (
              <div key={x.key} className="avoid-break rounded border p-1.5" style={{ borderColor: x.late ? "#fca5a5" : "#cbd5e1" }}>
                <div className="flex items-baseline justify-between">
                  <strong className="text-[10.5px]">{x.key}</strong>
                  <span className="text-[8.5px] text-slate-500">{fmtDate(x.due)}</span>
                </div>
                <p className="truncate text-[8.5px] text-slate-500" title={x.name}>{x.name}</p>
                <MiniBar v={x.pc ?? 0} />
                <p className="mt-1 text-[8.5px] text-slate-600">
                  총 {x.total} · 평균 {x.pc == null ? "—" : `${pct1(x.pc)}%`} · <span style={{ color: x.late ? "#b91c1c" : undefined }}>지연 {x.late}</span>
                  {x.dd != null && <> · D{x.dd >= 0 ? "-" : "+"}{Math.abs(x.dd)}</>}
                </p>
                <p className="text-[8.5px] text-slate-600">계획 {x.plan} / 실적 {x.act} / 차이 <span style={{ color: gapColor(x.gap) }}>{sign(x.gap)}{Math.abs(x.gap)}</span></p>
              </div>
            ))}
          </div>
        </Block>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <RankList title="건물별 지연 상위" rows={m.bldg} />
          <RankList title="협력사별 지연 상위" rows={m.sub} />
        </div>
      </Sheet>

      <Sheet>
        <Header title={title} page="2 / 3" sub={`지연 리스트 상세 · 총 ${m.delays.length.toLocaleString()}건`} />
        <table className="mt-3 w-full border-collapse text-[8.5px]">
          <thead>
            <tr className="bg-slate-100 text-slate-700">
              {["No.", "공종", "건물", "Room", "협력사", "활동", "MS", "시작", "종료", "계획%", "실적%", "격차%p"].map((h) => (
                <th key={h} className="border border-slate-300 px-1 py-1 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.delays.map(({ r, gap }) => (
              <tr key={r.id}>
                <td className="border border-slate-300 px-1 py-0.5">{r.no ?? "—"}</td>
                <td className="border border-slate-300 px-1 py-0.5">{SLOT_LABEL[r.slot] ?? r.slot}</td>
                <td className="border border-slate-300 px-1 py-0.5">{r.bldg ?? "—"}</td>
                <td className="border border-slate-300 px-1 py-0.5">{r.room ?? "—"}</td>
                <td className="border border-slate-300 px-1 py-0.5">{r.sub ?? "—"}</td>
                <td className="border border-slate-300 px-1 py-0.5">{r.act}</td>
                <td className="border border-slate-300 px-1 py-0.5">{r.ms ?? "—"}</td>
                <td className="border border-slate-300 px-1 py-0.5 whitespace-nowrap">{fmtShortDate(r.s)}</td>
                <td className="border border-slate-300 px-1 py-0.5 whitespace-nowrap">{fmtShortDate(r.e)}</td>
                <td className="border border-slate-300 px-1 py-0.5 text-right">{pct1(r.pl)}</td>
                <td className="border border-slate-300 px-1 py-0.5 text-right">{pct1(r.pc)}</td>
                <td className="border border-slate-300 px-1 py-0.5 text-right font-semibold" style={{ color: "#b91c1c" }}>−{pct1(gap)}</td>
              </tr>
            ))}
            {m.delays.length === 0 && (
              <tr><td colSpan={12} className="border border-slate-300 px-2 py-3 text-center text-slate-500">지연 항목이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </Sheet>

      <Sheet>
        <Header title={title} page="3 / 3" sub="시운전(T&C) 공종별 T1 · T2 현황" />
        {tc.length === 0 && <p className="mt-4 text-[10px] text-slate-500">등록된 T&amp;C 자료가 없습니다.</p>}
        {tc.map((d) => (
          <div key={d.key} className="mt-3">
            <h3 className="mb-1 text-[11px] font-bold">{d.label} <span className="font-normal text-slate-500">총 {d.qty.toLocaleString()} Qty · Pass {d.pass} / Fail {d.fail}</span></h3>
            <div className="avoid-break mb-1.5 grid grid-cols-2 gap-2">
              {(["t1", "t2"] as const).map((k) => {
                const c = d[k];
                const label = k === "t1" ? "T1 · Internal T&C" : "T2 · Consultant Inspection";
                const pctv = c.qty ? c.doneQty / c.qty : 0;
                return (
                  <div key={k} className="rounded border border-slate-300 p-2">
                    <p className="text-[10px] font-bold">{label}</p>
                    <p className="mt-0.5 text-[15px] font-bold">{pct1(pctv)}%</p>
                    <MiniBar v={pctv} />
                    <p className="mt-1 text-[9px] text-slate-600">
                      완료 {c.doneQty.toLocaleString()} · 잔여 {c.rem.toLocaleString()} · <span style={{ color: c.lateQty ? "#b91c1c" : undefined }}>지연 {c.lateQty.toLocaleString()}</span>
                    </p>
                  </div>
                );
              })}
            </div>
            <table className="w-full border-collapse text-[9px]">
              <thead>
                <tr className="bg-slate-100 text-slate-700">
                  <th className="border border-slate-300 px-1 py-1 text-left" rowSpan={2}>건물</th>
                  <th className="border border-slate-300 px-1 py-1 text-right" rowSpan={2}>Qty</th>
                  <th className="border border-slate-300 px-1 py-1 text-center" colSpan={3}>T1</th>
                  <th className="border border-slate-300 px-1 py-1 text-center" colSpan={3}>T2</th>
                  <th className="border border-slate-300 px-1 py-1 text-right" rowSpan={2}>Pass</th>
                  <th className="border border-slate-300 px-1 py-1 text-right" rowSpan={2}>Fail</th>
                </tr>
                <tr className="bg-slate-50 text-slate-700">
                  {["완료", "잔여", "지연", "완료", "잔여", "지연"].map((h, i) => (
                    <th key={`${h}${i}`} className="border border-slate-300 px-1 py-0.5 text-right">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.byBldg.map((b) => (
                  <tr key={b.bldg}>
                    <td className="border border-slate-300 px-1 py-0.5">{b.bldg}</td>
                    <td className="border border-slate-300 px-1 py-0.5 text-right">{b.qty}</td>
                    {(["t1", "t2"] as const).map((k) => (
                      <Fragment key={k}>
                        <td key={`${k}d`} className="border border-slate-300 px-1 py-0.5 text-right">{b[k].doneQty}</td>
                        <td key={`${k}r`} className="border border-slate-300 px-1 py-0.5 text-right">{b[k].rem}</td>
                        <td key={`${k}l`} className="border border-slate-300 px-1 py-0.5 text-right font-semibold" style={{ background: b[k].lateQty ? "#fef3c7" : undefined, color: b[k].lateQty ? "#b91c1c" : "#94a3b8" }}>{b[k].lateQty}</td>
                      </Fragment>
                    ))}
                    <td className="border border-slate-300 px-1 py-0.5 text-right">{b.pass}</td>
                    <td className="border border-slate-300 px-1 py-0.5 text-right" style={{ color: b.fail ? "#b91c1c" : undefined }}>{b.fail}</td>
                  </tr>
                ))}
                <tr className="bg-slate-100 font-bold">
                  <td className="border border-slate-300 px-1 py-0.5">Total</td>
                  <td className="border border-slate-300 px-1 py-0.5 text-right">{d.qty}</td>
                  {(["t1", "t2"] as const).map((k) => (
                    <Fragment key={k}>
                      <td key={`${k}d`} className="border border-slate-300 px-1 py-0.5 text-right">{d[k].doneQty}</td>
                      <td key={`${k}r`} className="border border-slate-300 px-1 py-0.5 text-right">{d[k].rem}</td>
                      <td key={`${k}l`} className="border border-slate-300 px-1 py-0.5 text-right" style={{ color: d[k].lateQty ? "#b91c1c" : undefined }}>{d[k].lateQty}</td>
                    </Fragment>
                  ))}
                  <td className="border border-slate-300 px-1 py-0.5 text-right">{d.pass}</td>
                  <td className="border border-slate-300 px-1 py-0.5 text-right">{d.fail}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ))}
      </Sheet>
    </div>
  );
}

function Sheet({ children }: { children: React.ReactNode }) {
  return (
    <div className="sheet mx-auto mb-6 w-[210mm] min-h-[297mm] bg-white p-[12mm] text-slate-900 shadow-sm print:shadow-none">
      {children}
    </div>
  );
}

function Header({ title, page, sub }: { title: string; page: string; sub: string }) {
  return (
    <div className="flex items-end justify-between border-b-2 border-slate-800 pb-1.5">
      <div>
        <h1 className="text-[14px] font-bold leading-tight">{title}</h1>
        <p className="text-[9.5px] text-slate-500">{sub}</p>
      </div>
      <span className="text-[9.5px] text-slate-500">{page}</span>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-3">
      <h2 className="mb-1 text-[11px] font-bold">{title}</h2>
      {children}
    </section>
  );
}

function KpiCard({ label, value, unit, note, bar, marker, tone }: { label: string; value: string; unit?: string | undefined; note: string; bar: number; marker?: number | undefined; tone?: "bad" | undefined }) {
  return (
    <div className="avoid-break rounded border p-2" style={{ borderColor: tone === "bad" ? "#fca5a5" : "#cbd5e1", background: tone === "bad" ? "#fef2f2" : "#f8fafc" }}>
      <p className="text-[9.5px] font-bold text-slate-500">{label}</p>
      <p className="mt-0.5 flex items-baseline gap-1">
        <span className="text-[20px] font-bold leading-none" style={{ color: tone === "bad" ? "#b91c1c" : undefined }}>{value}</span>
        {unit && <span className="text-[9.5px] text-slate-500">{unit}</span>}
      </p>
      <p className="mt-1 text-[9px] text-slate-600">{note}</p>
      <MiniBar v={bar} marker={marker} tone={tone} />
    </div>
  );
}

function MiniBar({ v, marker, tone }: { v: number; marker?: number | undefined; tone?: "bad" | undefined }) {
  return (
    <div className="relative mt-1.5 h-1.5 w-full overflow-hidden rounded" style={{ background: "#e2e8f0" }}>
      <div className="h-full" style={{ width: `${Math.min(100, Math.max(0, v * 100))}%`, background: tone === "bad" ? "#dc2626" : "#1d4ed8" }} />
      {marker != null && <span className="absolute top-0 h-full" style={{ left: `${Math.min(100, marker * 100)}%`, width: 1, background: "#0f172a" }} />}
    </div>
  );
}

function RankList({ title, rows }: { title: string; rows: { k: string; late: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.late));
  return (
    <div className="avoid-break rounded border border-slate-300 p-2">
      <p className="mb-1 text-[10px] font-bold text-slate-600">{title}</p>
      {rows.length === 0 && <p className="text-[9px] text-slate-500">지연 항목이 없습니다.</p>}
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.k} className="flex items-center gap-2 text-[9px]">
            <span className="w-[40%] truncate">{r.k}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded" style={{ background: "#e2e8f0" }}>
              <span className="block h-full" style={{ width: `${(r.late / max) * 100}%`, background: "#dc2626" }} />
            </span>
            <span className="w-10 text-right font-semibold">{r.late}건</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
