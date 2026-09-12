import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SAFETY_KEYS, hmTime, normalizeTimes, type SafetySendLog } from "./safety-settings";

type Ctx = { supabase: any; userId: string };

async function assertAdmin(context: Ctx) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("관리자만 사용할 수 있습니다.");
}

/** 안전리포트 설정 화면 데이터 (관리자) */
export const getSafetySettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as Ctx);
    const c = (context as Ctx).supabase;
    const [settings, members, logs, reports] = await Promise.all([
      c.from("app_settings").select("key, value"),
      c.from("manpower_members").select("telegram_id, name, company, role, is_active").order("name"),
      c.from("manpower_ingest_log").select("received_at, warnings").eq("mode", "safety").order("received_at", { ascending: false }).limit(100),
      c.from("safety_reports").select("day, generated_at, generated_at_en, pdf_ko_path, pdf_en_path, telegram_ready_at, telegram_send_seq").order("day", { ascending: false }).limit(14),
    ]);
    const err = settings.error ?? members.error ?? logs.error ?? reports.error;
    if (err) throw new Error(err.message);
    const map: Record<string, string> = {};
    (settings.data ?? []).forEach((s: { key: string; value: string | null }) => { if (s.value) map[s.key] = s.value; });
    return {
      settings: map,
      members: (members.data ?? []) as { telegram_id: string; name: string; company: string | null; role: string; is_active: boolean }[],
      logs: (logs.data ?? []) as SafetySendLog[],
      reports: (reports.data ?? []) as Record<string, string | number | null>[],
    };
  });

const Save = z.object({
  enabled: z.boolean(),
  sendTime: z.string().transform((v) => normalizeTimes(v)[0] ?? "").refine((t) => hmTime.test(t), "발송 시각은 HH:mm 형식으로 입력하세요."),
  retryUntil: z.string().transform((v) => normalizeTimes(v)[0] ?? "").refine((t) => hmTime.test(t), "재시도 종료 시각은 HH:mm 형식으로 입력하세요."),
  retryInterval: z.number().int().min(1).max(60),
  coverKo: z.string().min(1).max(1000),
  coverEn: z.string().min(1).max(1000),
  resultTo: z.array(z.string().min(1)).max(20),
});

/** 설정 저장 (관리자) — 결과 수신자는 HDEC 회원만 허용 */
export const saveSafetySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Save.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.resultTo.length) {
      const { data: rows, error } = await supabaseAdmin
        .from("manpower_members")
        .select("telegram_id")
        .eq("role", "HDEC")
        .in("telegram_id", data.resultTo);
      if (error) throw new Error(error.message);
      const ok = new Set((rows ?? []).map((r: { telegram_id: string }) => r.telegram_id));
      const bad = data.resultTo.filter((id) => !ok.has(id));
      if (bad.length) throw new Error("출면기록 관리자(HDEC)로 등록되지 않은 수신자가 있습니다.");
    }

    const now = new Date().toISOString();
    const rows = [
      { key: SAFETY_KEYS.enabled, value: data.enabled ? "true" : "false" },
      { key: SAFETY_KEYS.sendTime, value: data.sendTime },
      { key: SAFETY_KEYS.retryUntil, value: data.retryUntil },
      { key: SAFETY_KEYS.retryInterval, value: String(data.retryInterval) },
      { key: SAFETY_KEYS.coverKo, value: data.coverKo },
      { key: SAFETY_KEYS.coverEn, value: data.coverEn },
      { key: SAFETY_KEYS.resultTo, value: data.resultTo.join(",") },
    ].map((r) => ({ ...r, updated_at: now }));
    const { error } = await supabaseAdmin.from("app_settings").upsert(rows as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** 오늘 리포트 재발송 신호 — send_seq +1 (관리자) */
export const bumpSafetySendSeq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("safety_reports").select("day, telegram_send_seq").eq("day", data.day).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("해당 날짜의 안전 리포트가 아직 없습니다.");
    const seq = Number((row as { telegram_send_seq: number | null }).telegram_send_seq ?? 0) + 1;
    const { error: upErr } = await supabaseAdmin
      .from("safety_reports").update({ telegram_send_seq: seq } as never).eq("day", data.day);
    if (upErr) throw new Error(upErr.message);
    return { seq };
  });

/** PDF 다시 만들기 (관리자) */
export const rebuildSafetyPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const { publishSafetyPdfs } = await import("./safety-publish.server");
    return await publishSafetyPdfs(data.day);
  });
