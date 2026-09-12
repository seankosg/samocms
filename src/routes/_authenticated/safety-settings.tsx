import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Send, RefreshCw, FileText } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AdminGate } from "@/components/manpower/admin-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSafetySettings, saveSafetySettings, bumpSafetySendSeq, rebuildSafetyPdf } from "@/lib/safety-settings.functions";
import { saveManpowerSettings } from "@/lib/manpower.functions";
import { SAFETY_KEYS, SAFETY_DEFAULTS } from "@/lib/safety-settings";
import { MP } from "@/lib/manpower-i18n";
import { jeddahToday } from "@/lib/today-model";

export const Route = createFileRoute("/_authenticated/safety-settings")({
  head: () => ({ meta: [
    { title: "안전리포트 설정 | HMMME PROJECT CMS" },
    { name: "description", content: "일일 안전 리포트 텔레그램 발송 시각, 재시도, 본문, 결과 수신자와 출면 독촉 알림을 설정합니다." },
    { property: "og:title", content: "HMMME 안전리포트 설정" },
    { property: "og:description", content: "안전 리포트 발송 설정과 최근 발송 결과" },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  errorComponent: ({ error }) => <div role="alert" className="p-8 text-sm">설정을 불러오지 못했습니다. {(error as Error).message}</div>,
  component: SafetySettingsPage,
});

function SafetySettingsPage() {
  return (
    <AdminGate title="안전리포트 설정">
      <AppShell title="안전리포트 설정" desc="매일 자동 생성되는 안전 리포트의 발송 조건과 본문, 결과 수신자를 관리합니다.">
        <Inner />
      </AppShell>
    </AdminGate>
  );
}

function Inner() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["safety-settings"], queryFn: () => getSafetySettings(), staleTime: 30_000 });
  if (q.isLoading || !q.data) return <p className="text-sm text-muted-foreground">불러오는 중…</p>;
  return <Body data={q.data} onDone={() => qc.invalidateQueries({ queryKey: ["safety-settings"] })} />;
}

type Data = Awaited<ReturnType<typeof getSafetySettings>>;

function Body({ data, onDone }: { data: Data; onDone: () => void }) {
  const s = data.settings;
  const [enabled, setEnabled] = useState(s[SAFETY_KEYS.enabled] === "true");
  const [sendTime, setSendTime] = useState(s[SAFETY_KEYS.sendTime] ?? SAFETY_DEFAULTS.sendTime);
  const [retryUntil, setRetryUntil] = useState(s[SAFETY_KEYS.retryUntil] ?? SAFETY_DEFAULTS.retryUntil);
  const [retryInterval, setRetryInterval] = useState(String(s[SAFETY_KEYS.retryInterval] ?? SAFETY_DEFAULTS.retryInterval));
  const [coverKo, setCoverKo] = useState(s[SAFETY_KEYS.coverKo] ?? SAFETY_DEFAULTS.coverKo);
  const [coverEn, setCoverEn] = useState(s[SAFETY_KEYS.coverEn] ?? SAFETY_DEFAULTS.coverEn);
  const [resultTo, setResultTo] = useState<string[]>((s[SAFETY_KEYS.resultTo] ?? "").split(",").filter(Boolean));

  const hdec = data.members.filter((m) => m.role === "HDEC" && m.is_active);
  const today = jeddahToday();
  const todayReport = data.reports.find((r) => r["day"] === today) ?? null;

  const save = useMutation({
    mutationFn: () => saveSafetySettings({ data: {
      enabled, sendTime, retryUntil, retryInterval: Number(retryInterval) || 5, coverKo, coverEn, resultTo,
    } }),
    onSuccess: () => { onDone(); toast.success("안전리포트 설정이 저장되었습니다"); },
    onError: (e: Error) => toast.error("저장 실패", { description: e.message }),
  });

  const resend = useMutation({
    mutationFn: () => bumpSafetySendSeq({ data: { day: today } }),
    onSuccess: (r) => { onDone(); toast.success(`재발송 신호를 보냈습니다 (회차 ${r.seq})`); },
    onError: (e: Error) => toast.error("재발송 실패", { description: e.message }),
  });

  const rebuild = useMutation({
    mutationFn: () => rebuildSafetyPdf({ data: { day: today } }),
    onSuccess: (r) => { onDone(); r.ok ? toast.success("PDF 를 다시 만들었습니다") : toast.warning(r.reason ?? "만들 수 없습니다"); },
    onError: (e: Error) => toast.error("PDF 생성 실패", { description: e.message }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm"><Send className="size-4" />텔레그램 발송</CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            리포트는 매일 현지 새벽에 자동으로 만들어집니다. 아래 값은 발송을 맡은 봇이 읽어 갑니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="flex items-center gap-2">
            <Switch id="tg-enabled" checked={enabled} onCheckedChange={setEnabled} />
            <Label htmlFor="tg-enabled" className="text-xs">발송 사용</Label>
          </div>
          <Field id="tg-time" label="발송 시각 (현지, HH:mm)">
            <Input id="tg-time" value={sendTime} onChange={(e) => setSendTime(e.target.value)} className="h-8 w-24 text-xs" placeholder="05:00" />
          </Field>
          <Field id="tg-until" label="재시도 종료 시각">
            <Input id="tg-until" value={retryUntil} onChange={(e) => setRetryUntil(e.target.value)} className="h-8 w-24 text-xs" placeholder="05:20" />
          </Field>
          <Field id="tg-int" label="재시도 간격 (분)">
            <Input id="tg-int" type="number" min={1} max={60} value={retryInterval} onChange={(e) => setRetryInterval(e.target.value)} className="h-8 w-20 text-xs" />
          </Field>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>저장</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">안내 본문</CardTitle>
          <CardDescription className="text-xs">{"{date}"} 자리에 발송일이 자동으로 들어갑니다. 저장하면 다음 발송부터 바로 적용됩니다.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">
          <Field id="cov-ko" label="한국어 본문">
            <Textarea id="cov-ko" value={coverKo} onChange={(e) => setCoverKo(e.target.value)} rows={10} className="text-xs" />
          </Field>
          <Field id="cov-en" label="영문 본문">
            <Textarea id="cov-en" value={coverEn} onChange={(e) => setCoverEn(e.target.value)} rows={10} className="text-xs" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">발송 결과 수신자</CardTitle>
          <CardDescription className="text-xs">출면기록 관리자(HDEC)로 등록된 사람만 선택할 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {hdec.length === 0 && <p className="text-xs text-muted-foreground">등록된 관리자가 없습니다.</p>}
          {hdec.map((m) => {
            const on = resultTo.includes(m.telegram_id);
            return (
              <Button key={m.telegram_id} size="sm" variant={on ? "default" : "outline"}
                onClick={() => setResultTo(on ? resultTo.filter((x) => x !== m.telegram_id) : [...resultTo, m.telegram_id])}>
                {m.name}
              </Button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm"><FileText className="size-4" />오늘 리포트 상태</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 text-xs">
          <Badge variant="outline">{today}</Badge>
          <span>한국어 {todayReport?.["generated_at"] ? "생성됨" : "없음"}</span>
          <span>영문 {todayReport?.["generated_at_en"] ? "생성됨" : "없음"}</span>
          <span>PDF {todayReport?.["telegram_ready_at"] ? "준비됨" : "없음"}</span>
          <span>발송 회차 {String(todayReport?.["telegram_send_seq"] ?? 0)}</span>
          <Button size="sm" variant="outline" onClick={() => rebuild.mutate()} disabled={rebuild.isPending}>
            <RefreshCw className={`mr-1 size-4 ${rebuild.isPending ? "animate-spin" : ""}`} />PDF 다시 만들기
          </Button>
          <Button size="sm" variant="outline" onClick={() => resend.mutate()} disabled={resend.isPending}>
            <Send className="mr-1 size-4" />재발송 요청
          </Button>
        </CardContent>
      </Card>

      <ReminderCard settings={s} onDone={onDone} />

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">최근 발송 기록</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {data.logs.length === 0 ? (
            <p className="text-xs text-muted-foreground">아직 발송 기록이 없습니다.</p>
          ) : (
            <table className="w-full min-w-[36rem] text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-2 py-1.5">수신 시각</th><th className="px-2 py-1.5">대상일</th>
                  <th className="px-2 py-1.5">회차</th><th className="px-2 py-1.5">한국어</th>
                  <th className="px-2 py-1.5">영문</th><th className="px-2 py-1.5">실패</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.map((l, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-2 py-1.5">{new Date(l.received_at).toLocaleString("ko-KR")}</td>
                    <td className="px-2 py-1.5">{l.warnings?.day ?? "-"}</td>
                    <td className="px-2 py-1.5 tabular-nums">{l.warnings?.seq ?? "-"}</td>
                    <td className="px-2 py-1.5 tabular-nums">{l.warnings?.sent_ko ?? "-"}</td>
                    <td className="px-2 py-1.5 tabular-nums">{l.warnings?.sent_en ?? "-"}</td>
                    <td className="px-2 py-1.5">{l.warnings?.failed?.length ? l.warnings.failed.map((f) => f.name ?? f.id).join(", ") : "-"}</td>
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

/** 출면 미보고 독촉 알림 설정 — 봇이 읽는 app_settings 값 */
function ReminderCard({ settings, onDone }: { settings: Record<string, string>; onDone: () => void }) {
  const [enabled, setEnabled] = useState(settings["manpower_reminder_enabled"] === "true");
  const [times, setTimes] = useState(settings["manpower_remind_times"] ?? "09:00,11:00");
  const [cutoff, setCutoff] = useState(settings["manpower_cutoff_time"] ?? "09:00");

  const save = useMutation({
    mutationFn: () => saveManpowerSettings({ data: { reminderEnabled: enabled, remindTimes: times, cutoffTime: cutoff } }),
    onSuccess: () => { onDone(); toast.success("알림 설정이 저장되었습니다"); },
    onError: (e: Error) => toast.error("저장 실패", { description: e.message }),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{MP.reminderSettings}</CardTitle>
        <CardDescription className="text-xs leading-relaxed">{MP.reminderGuide}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-4">
        <div className="flex items-center gap-2">
          <Switch id="reminder-enabled" checked={enabled} onCheckedChange={setEnabled} />
          <Label htmlFor="reminder-enabled" className="text-xs">{MP.reminderEnabled}</Label>
        </div>
        <Field id="remind-times" label={`${MP.remindTimes} (HH:mm, 쉼표 구분)`}>
          <Input id="remind-times" value={times} onChange={(e) => setTimes(e.target.value)} className="h-8 w-40 text-xs" placeholder="09:00,11:00" />
        </Field>
        <Field id="cutoff-time" label={MP.cutoffTime}>
          <Input id="cutoff-time" value={cutoff} onChange={(e) => setCutoff(e.target.value)} className="h-8 w-24 text-xs" placeholder="09:00" />
        </Field>
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>저장</Button>
      </CardContent>
    </Card>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label htmlFor={id} className="text-xs">{label}</Label>{children}</div>;
}
