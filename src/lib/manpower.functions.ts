import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sheetIdFrom } from "./manpower-sheet";

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
    const [cards, compare, companies, locations, calendar, plan, settings, log, lastEntry, reminders] = await Promise.all([
      c.from("v_manpower_cards").select("*").gte("report_date", data.from).lte("report_date", data.to),
      c.from("v_manpower_compare").select("*").gte("report_date", data.from).lte("report_date", data.to),
      c.from("manpower_companies").select("*").order("sort_order"),
      c.from("manpower_locations").select("*").order("sort_order"),
      c.from("manpower_calendar").select("*").gte("day", data.from).lte("day", data.to),
      c.from("manpower_plan").select("company, plan_date, granularity, planned_total").gte("plan_date", data.from).lte("plan_date", data.to),
      c.from("app_settings").select("*"),
      c.from("manpower_ingest_log").select("*").order("received_at", { ascending: false }).limit(5),
      c.from("manpower_entries").select("synced_at").order("synced_at", { ascending: false }).limit(1),
      // 오늘 발송된 미보고 알림 로그 (봇이 mode='reminder' 로 기록, warnings 에 {date, missing[], ...})
      c.from("manpower_ingest_log").select("warnings").eq("mode", "reminder").filter("warnings->>date", "eq", data.to),
    ]);
    const err = cards.error ?? compare.error ?? companies.error ?? locations.error ?? calendar.error ?? plan.error ?? settings.error ?? log.error ?? lastEntry.error ?? reminders.error;
    if (err) throw new Error(err.message);
    const settingMap: Record<string, string> = {};
    (settings.data ?? []).forEach((s: { key: string; value: string | null }) => {
      if (s.value) settingMap[s.key] = s.value;
    });
    // 「마지막 수신」 = 시트 동기화 시각과 기록 저장 시각 중 더 최근 값
    const candidates = [settingMap["manpower_last_sync_at"], lastEntry.data?.[0]?.synced_at as string | undefined]
      .filter((v): v is string => !!v)
      .sort();
    return {
      cards: cards.data ?? [],
      compare: compare.data ?? [],
      companies: companies.data ?? [],
      locations: locations.data ?? [],
      calendar: calendar.data ?? [],
      plan: plan.data ?? [],
      settings: settingMap,
      ingestLog: log.data ?? [],
      lastReceivedAt: candidates.at(-1) ?? null,
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
      .upsert({
        telegram_id: data.telegram_id,
        name: data.name,
        company: data.company ?? null,
        role: data.role,
        is_active: data.is_active,
        note: data.note ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "telegram_id" });
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
    const { syncManpowerFromSheet } = await import("./manpower-sync.server");
    return syncManpowerFromSheet({
      sheetId, subTab: data.subTab, hdecTab: data.hdecTab, apply: data.apply, mode: "manual-sheet",
    });
  });

/* ─────────────── 출면 마스터 (회사·장소·별칭) ─────────────── */

const kindSchema = z.enum(["company", "location"]);
type Kind = z.infer<typeof kindSchema>;
const tableOf = (k: Kind) => (k === "company" ? "manpower_companies" : "manpower_locations");

/** 마스터 화면 데이터 — 회사·장소·별칭 + 기록 수 + 회원 소속 */
export const getManpowerMasters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = context.supabase;
    const [companies, locations, aliases, usage, members, lastEntry] = await Promise.all([
      c.from("manpower_companies").select("*").order("sort_order"),
      c.from("manpower_locations").select("*").order("sort_order"),
      c.from("manpower_aliases").select("*").order("kind").order("alias"),
      c.rpc("manpower_name_usage"),
      c.from("manpower_members").select("telegram_id, name, company, role"),
      c.from("manpower_entries").select("synced_at").order("synced_at", { ascending: false }).limit(1),
    ]);
    const err = companies.error ?? locations.error ?? aliases.error ?? usage.error ?? members.error ?? lastEntry.error;
    if (err) throw new Error(err.message);
    return {
      companies: companies.data ?? [],
      locations: locations.data ?? [],
      aliases: aliases.data ?? [],
      usage: (usage.data ?? []) as { kind: string; name: string; entry_count: number }[],
      members: members.data ?? [],
      lastEntrySyncedAt: lastEntry.data?.[0]?.synced_at ?? null,
    };
  });

const masterSchema = z.object({
  kind: kindSchema,
  name: z.string().min(1).max(80),
  sort_order: z.number().int().min(0).max(100000),
  is_active: z.boolean().default(true),
  short_name: z.string().max(40).nullable().optional(),
  discipline: z.string().max(40).nullable().optional(),
  contract_no: z.string().max(80).nullable().optional(),
  bldg_code: z.string().max(40).nullable().optional(),
  zone: z.string().max(40).nullable().optional(),
  isNew: z.boolean().default(false),
});

/** 회사·장소 추가/수정 (이름은 신규일 때만 결정, 관리자 전용) */
export const saveManpowerMaster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => masterSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const name = data.name.trim();
    if (!name) throw new Error("이름을 입력해 주세요.");
    const table = tableOf(data.kind);

    const { data: found, error: findErr } = await supabaseAdmin.from(table).select("name").eq("name", name).maybeSingle();
    if (findErr) throw new Error(findErr.message);
    if (data.isNew && found) throw new Error("같은 이름이 이미 등록되어 있습니다.");
    if (!data.isNew && !found) throw new Error("등록되지 않은 이름입니다.");

    const row: Record<string, unknown> = {
      name, sort_order: data.sort_order, is_active: data.is_active, updated_at: new Date().toISOString(),
    };
    if (data.kind === "company") {
      row["short_name"] = data.short_name || null;
      row["discipline"] = data.discipline || null;
      row["contract_no"] = data.contract_no || null;
    } else {
      row["bldg_code"] = data.bldg_code || null;
      row["zone"] = data.zone || null;
    }
    const { error } = await supabaseAdmin.from(table).upsert(row as never, { onConflict: "name" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** 순서만 갱신 (관리자 전용) */
export const setManpowerMasterOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ kind: kindSchema, items: z.array(z.object({ name: z.string().min(1), sort_order: z.number().int().min(0) })).min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    for (const it of data.items) {
      const { error } = await supabaseAdmin.from(tableOf(data.kind))
        .update({ sort_order: it.sort_order, updated_at: now }).eq("name", it.name);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/** 활성/비활성 토글 (관리자 전용) */
export const setManpowerMasterActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ kind: kindSchema, name: z.string().min(1), is_active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from(tableOf(data.kind))
      .update({ is_active: data.is_active, updated_at: new Date().toISOString() }).eq("name", data.name);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function countEntries(admin: any, kind: Kind, name: string) {
  const col = kind === "company" ? "company" : "location";
  const { count, error } = await admin.from("manpower_entries").select("*", { count: "exact", head: true }).eq(col, name);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** 삭제 — 기록 0건이고 별칭·회원이 쓰지 않을 때만 (관리자 전용) */
export const deleteManpowerMaster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ kind: kindSchema, name: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const n = await countEntries(supabaseAdmin, data.kind, data.name);
    if (n > 0) throw new Error(`기록 ${n}건이 있어 삭제할 수 없습니다 — 비활성 처리하거나 별칭으로 합치세요.`);

    const { data: al, error: alErr } = await supabaseAdmin.from("manpower_aliases")
      .select("alias").eq("kind", data.kind).eq("canonical", data.name);
    if (alErr) throw new Error(alErr.message);
    if ((al ?? []).length) throw new Error("이 이름을 정식 이름으로 쓰는 별칭이 있어 삭제할 수 없습니다.");

    if (data.kind === "company") {
      const { data: mem, error: memErr } = await supabaseAdmin.from("manpower_members").select("telegram_id").eq("company", data.name);
      if (memErr) throw new Error(memErr.message);
      if ((mem ?? []).length) throw new Error("이 회사를 소속으로 쓰는 봇 사용자가 있어 삭제할 수 없습니다.");
    }

    const { error } = await supabaseAdmin.from(tableOf(data.kind)).delete().eq("name", data.name);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function assertAliasRules(admin: any, kind: Kind, alias: string, canonical: string) {
  if (alias === canonical) throw new Error("별칭과 정식 이름이 같을 수 없습니다.");
  const table = tableOf(kind);
  const { data: canon, error: cErr } = await admin.from(table).select("name").eq("name", canonical).maybeSingle();
  if (cErr) throw new Error(cErr.message);
  if (!canon) throw new Error("정식 이름이 마스터에 없습니다.");

  const { data: act, error: aErr } = await admin.from(table).select("name, is_active").eq("name", alias).maybeSingle();
  if (aErr) throw new Error(aErr.message);
  if (act?.is_active) throw new Error("활성 마스터 이름은 별칭으로 등록할 수 없습니다.");

  const { data: chain, error: chErr } = await admin.from("manpower_aliases").select("alias").eq("kind", kind).eq("alias", canonical).maybeSingle();
  if (chErr) throw new Error(chErr.message);
  if (chain) throw new Error("별칭의 별칭은 만들 수 없습니다.");
}

/** 별칭 등록 (관리자 전용) */
export const saveManpowerAlias = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    kind: kindSchema, alias: z.string().min(1).max(80), canonical: z.string().min(1).max(80), note: z.string().max(300).nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const alias = data.alias.trim();
    const canonical = data.canonical.trim();
    await assertAliasRules(supabaseAdmin, data.kind, alias, canonical);
    const { error } = await supabaseAdmin.from("manpower_aliases")
      .upsert({ kind: data.kind, alias, canonical, note: data.note || null }, { onConflict: "kind,alias" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** 별칭 삭제 (관리자 전용) */
export const deleteManpowerAlias = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ kind: kindSchema, alias: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("manpower_aliases").delete().eq("kind", data.kind).eq("alias", data.alias);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** 이름 변경 마법사 — 새 이름 추가 → 옛 이름 별칭 등록 → 옛 이름 비활성 → 회원 소속 갱신 */
export const renameManpowerMaster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    kind: kindSchema, oldName: z.string().min(1).max(80), newName: z.string().min(1).max(80),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const oldName = data.oldName.trim();
    const newName = data.newName.trim();
    if (oldName === newName) throw new Error("새 이름이 기존 이름과 같습니다.");
    const table = tableOf(data.kind);
    const now = new Date().toISOString();

    const { data: oldRow, error: oErr } = await supabaseAdmin.from(table).select("*").eq("name", oldName).maybeSingle();
    if (oErr) throw new Error(oErr.message);
    if (!oldRow) throw new Error("기존 이름을 찾을 수 없습니다.");
    const prev = oldRow as Record<string, unknown>;

    const base: Record<string, unknown> = { name: newName, sort_order: prev["sort_order"] as number, is_active: true, updated_at: now };
    if (data.kind === "company") {
      base["short_name"] = (prev["short_name"] as string | null) ?? null;
      base["discipline"] = (prev["discipline"] as string | null) ?? null;
      base["contract_no"] = (prev["contract_no"] as string | null) ?? null;
    } else {
      base["bldg_code"] = (prev["bldg_code"] as string | null) ?? null;
      base["zone"] = (prev["zone"] as string | null) ?? null;
    }
    const { error: insErr } = await supabaseAdmin.from(table).upsert(base as never, { onConflict: "name" });
    if (insErr) throw new Error(insErr.message);

    const { error: offErr } = await supabaseAdmin.from(table).update({ is_active: false, updated_at: now }).eq("name", oldName);
    if (offErr) throw new Error(offErr.message);

    await assertAliasRules(supabaseAdmin, data.kind, oldName, newName);
    const { error: alErr } = await supabaseAdmin.from("manpower_aliases")
      .upsert({ kind: data.kind, alias: oldName, canonical: newName, note: "이름 변경" }, { onConflict: "kind,alias" });
    if (alErr) throw new Error(alErr.message);

    if (data.kind === "company") {
      const { error: memErr } = await supabaseAdmin.from("manpower_members")
        .update({ company: newName, updated_at: now }).eq("company", oldName);
      if (memErr) throw new Error(memErr.message);
    }
    return { ok: true };
  });

