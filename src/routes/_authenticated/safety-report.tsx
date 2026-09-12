import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Printer, RefreshCw, Download, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { projectQuery, useProject } from "@/lib/use-project";
import { jeddahToday, splitToday, todayTc, safetyFacts, fmtToday } from "@/lib/today-model";
import { fmtTodayEn, type Lang } from "@/lib/today-i18n";
import { analyzeSafety, getSafetyReport } from "@/lib/safety.functions";
import { useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/_authenticated/safety-report")({
  head: () => ({ meta: [
    { title: "Safety Report | HMMME PROJECT CMS" },
    { name: "description", content: "일자별 일일 안전 리포트 한국어·영문본 열람, PDF 내려받기, 인쇄 및 AI 재분석." },
    { property: "og:title", content: "HMMME Safety Report" },
    { property: "og:description", content: "일일 안전 리포트 한·영 PDF 열람과 인쇄" },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(projectQuery),
  errorComponent: () => <div role="alert" className="p-8">안전 리포트를 불러오지 못했습니다.</div>,
  component: SafetyReportPage,
});

function SafetyReportPage() {
  const { rows, tcItems } = useProject();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [day, setDay] = useState<string>("");
  const [lang, setLang] = useState<Lang>("ko");
  useEffect(() => setDay(jeddahToday()), []);

  const groups = useMemo(() => (day ? splitToday(rows, day) : null), [rows, day]);
  const tc = useMemo(() => (day ? todayTc(tcItems, day) : []), [tcItems, day]);

  const saved = useQuery({
    queryKey: ["safety-report", day, lang],
    queryFn: () => getSafetyReport({ data: { day, lang } }),
    enabled: !!day,
    staleTime: 60_000,
  });

  const run = useMutation({
    mutationFn: () => analyzeSafety({ data: { day, facts: safetyFacts(groups!, tc, day, lang), force: true, lang } }),
    onSuccess: () => { toast.success("안전 리포트를 다시 생성했습니다."); qc.invalidateQueries({ queryKey: ["safety-report"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "생성에 실패했습니다."),
  });

  if (!day) return <div className="p-8 text-sm">…</div>;

  const risks = saved.data?.risks ?? [];
  const pdfUrl = saved.data?.pdfUrl ?? null;
  const dateLabel = lang === "en" ? fmtTodayEn(day) : fmtToday(day);

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 text-lg font-bold"><FileText className="size-5" />Safety Report</h1>
        <Badge variant="outline" className="tabular-nums">{dateLabel}</Badge>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="h-9 w-[9.5rem]" />
          <Tabs value={lang} onValueChange={(v) => setLang(v as Lang)}>
            <TabsList className="h-9"><TabsTrigger value="ko">한국어</TabsTrigger><TabsTrigger value="en">English</TabsTrigger></TabsList>
          </Tabs>
          <Button size="sm" variant="outline" asChild>
            <Link to="/today-report" search={{ lang, print: true }} target="_blank"><Printer className="mr-1 size-4" />인쇄 / PDF 저장</Link>
          </Button>
          <Button size="sm" variant="outline" disabled={!pdfUrl} asChild={!!pdfUrl}>
            {pdfUrl
              ? <a href={pdfUrl} target="_blank" rel="noreferrer"><Download className="mr-1 size-4" />생성된 PDF</a>
              : <span><Download className="mr-1 size-4" />생성된 PDF</span>}
          </Button>
          {isAdmin && (
            <Button size="sm" onClick={() => run.mutate()} disabled={run.isPending || !groups}>
              <RefreshCw className={`mr-1 size-4 ${run.isPending ? "animate-spin" : ""}`} />다시 분석
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle className="size-4 text-destructive" />
            금일 중점 안전 관리 작업
            <span className="tabular-nums text-muted-foreground">{risks.length}건</span>
            {saved.data?.generatedAt && (
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                AI 분석 {new Date(saved.data.generatedAt).toLocaleString("ko-KR")}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {saved.isLoading ? (
            <p className="py-6 text-sm text-muted-foreground">불러오는 중…</p>
          ) : risks.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              해당 날짜의 분석 결과가 없습니다. 리포트는 매일 현지 새벽에 자동 생성됩니다.
            </p>
          ) : (
            <table className="w-full min-w-[54rem] text-xs">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                  <th className="w-20 px-2 py-1.5">Risk</th>
                  <th className="px-2 py-1.5">Activity</th>
                  <th className="w-40 px-2 py-1.5">Area / Sub</th>
                  <th className="px-2 py-1.5">위험 요인</th>
                  <th className="px-2 py-1.5">권고 안전 조치</th>
                </tr>
              </thead>
              <tbody>
                {risks.map((r, i) => (
                  <tr key={i} className="border-b align-top">
                    <td className="px-2 py-1.5">
                      <Badge variant={r.level === "High" ? "destructive" : "secondary"}>{r.level}</Badge>
                      <div className="mt-1 space-y-0.5 text-[0.65rem] text-muted-foreground">
                        {r.hazardType.map((h) => <div key={h}>{h}</div>)}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 font-medium">{r.title}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{r.bldg}<br />{r.sub}</td>
                    <td className="px-2 py-1.5">
                      {Array.isArray(r.hazard) ? r.hazard.map((k) => <div key={k}>· {k}</div>) : r.hazard}
                      {r.hazardDetail ? <div className="text-[0.65rem] text-muted-foreground">{r.hazardDetail}</div> : null}
                    </td>
                    <td className="px-2 py-1.5">
                      {Array.isArray(r.action) ? r.action.map((k) => <div key={k}>· {k}</div>) : r.action}
                      {r.actionDetail ? <div className="text-[0.65rem] text-muted-foreground">{r.actionDetail}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
