import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseSheet, diffAgainstExisting, sheetIdFrom, type SheetEntry } from "./manpower-sheet";

type Ctx = { supabase: any; userId: string };

async function assertAdmin(context: Ctx) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("관리자만 사용할 수 있습니다.");
}

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** 출면 화면 공통 데이터 — 기간 내 카드/대조/마스터/설정 */
export const getManpower = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ from: dateStr, to: dateStr }).parse(d))
  .handler(async ({ data, context }) => {
    const c = context.supabase;
    const [cards, compare, companies, locations, calendar, plan, settings, log] = await Promise.all([
      c.from("v_manpower_cards").select("*").gte("report_date", data.from).lte("report_date", data.to),
      c.from("v_manpower_compare").select("*").gte("report_date", data.from).lte("report_date", data.to),
      c.from("manpower_companies").select("*").order("sort_order"),
      c.from("manpower_locations").select("*").order("sort_order"),
      c.from("manpower_calendar").select("*").gte("day", data.from).lte("day", data.to),
      c.from("manpower_plan").select("company, plan_date, granularity, planned_total").gte("plan_date", data.from).lte("plan_date", data.to),
      c.from("app_settings").select("*"),
      c.from("manpower_ingest_log").select("*").order("received_at", { ascending: false }).limit(5),
    ]);
    const err = cards.error ?? compare.error ?? companies.error ?? locations.error ?? calendar.error ?? plan.error ?? settings.error ?? log.error;
    if (err) throw new Error(err.message);
    const settingMap: Record<string, string> = {};
    (settings.data ?? []).forEach((s: { key: string; value: string | null }) => {
      if (s.value) settingMap[s.key] = s.value;
    });
    return {
      cards: cards.data ?? [],
      compare: compare.data ?? [],
      companies: companies.data ?? [],
      locations: locations.data ?? [],
      calendar: calendar.data ?? [],
      plan: plan.data ?? [],
      settings: settingMap,
      ingestLog: log.data ?? [],
    };
  });

/** 봇 사용자(회원) 목록 — 관리자 화면용 */
export const getManpowerMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("manpower_members").select("*").order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const memberSchema = z.object({
  telegram_id: z.string().min(3).max(32),
  name: z.string().min(1).max(80),
  company: z.string().max(80).nullable().optional(),
  role: z.enum(["SUB", "HDEC"]),
  is_active: z.boolean(),
  note: z.string().max(300).nullable().optional(),
});

/** 봇 사용자 추가·수정 (관리자 전용) */
export const saveManpowerMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => memberSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("manpower_members")
      .upsert({ ...data, updated_at: new Date().toISOString() }, { onConflict: "telegram_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** 봇 사용자 사용중지/재개 (관리자 전용) */
export const setManpowerMemberActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ telegram_id: z.string().min(3), is_active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("manpower_members")
      .update({ is_active: data.is_active, updated_at: new Date().toISOString() })
      .eq("telegram_id", data.telegram_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

async function readTab(sheetId: string, tab: string) {
  const key = process.env["LOVABLE_API_KEY"];
  const conn = process.env["GOOGLE_SHEETS_API_KEY"];
  if (!key || !conn) throw new Error("구글 시트 연결이 설정되지 않았습니다.");
  const res = await fetch(`${GATEWAY}/spreadsheets/${sheetId}/values/${tab}!A1:R2000`, {
    headers: { Authorization: `Bearer ${key}`, "X-Connection-Api-Key": conn },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Sheets read failed [${res.status}]: ${body}`);
    throw new Error(`구글 시트를 읽지 못했습니다 [${res.status}] ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { values?: unknown[][] };
  return json.values;
}

const importSchema = z.object({
  sheet: z.string().min(10).max(200),
  subTab: z.string().min(1).max(80).default("Submissions"),
  hdecTab: z.string().min(1).max(80).default("Verification"),
  apply: z.boolean().default(false),
});

/** 구글 시트에서 출면 자료 가져오기 — 미리보기/저장 (관리자 전용) */
export const importManpowerSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => importSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const sheetId = sheetIdFrom(data.sheet);
    if (!sheetId) throw new Error("구글 시트 주소를 확인해 주세요.");

    const [subValues, hdecValues] = await Promise.all([readTab(sheetId, data.subTab), readTab(sheetId, data.hdecTab)]);
    const sub = parseSheet(subValues, "SUB");
    const hdec = parseSheet(hdecValues, "HDEC");
    const rows: SheetEntry[] = [...sub.rows, ...hdec.rows];
    const errors = [
      ...sub.errors.map((e) => ({ ...e, tab: data.subTab })),
      ...hdec.errors.map((e) => ({ ...e, tab: data.hdecTab })),
    ];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing, error: exErr } = await supabaseAdmin
      .from("manpower_entries")
      .select("source, sheet_row, submission_id, status, subtotal, company, report_date");
    if (exErr) throw new Error(exErr.message);
    const summary = diffAgainstExisting(rows, (existing ?? []) as never);

    if (!data.apply) {
      return { preview: true, rows: rows.length, ...summary, errors, sheetId, sample: rows.slice(0, 20) };
    }

    let upserted = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500).map((r) => ({ ...r, synced_at: new Date().toISOString() }));
      const { error } = await supabaseAdmin.from("manpower_entries").upsert(chunk, { onConflict: "source,sheet_row" });
      if (error) throw new Error(error.message);
      upserted += chunk.length;
    }
    await supabaseAdmin.from("manpower_ingest_log").insert({
      mode: "manual-sheet",
      rows_in: rows.length,
      rows_upserted: upserted,
      warnings: errors.length ? errors : null,
      ok: true,
    });
    await supabaseAdmin.from("app_settings").upsert([
      { key: "manpower_sheet_id", value: sheetId, updated_at: new Date().toISOString() },
      { key: "manpower_sheet_sub_tab", value: data.subTab, updated_at: new Date().toISOString() },
      { key: "manpower_sheet_hdec_tab", value: data.hdecTab, updated_at: new Date().toISOString() },
    ]);
    return { preview: false, rows: rows.length, ...summary, upserted, errors, sheetId };
  });
