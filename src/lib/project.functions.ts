import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

/** 공종(파일 종류) 편집 권한 검사 — 관리자 전체, 사용자는 담당 공종만 */
export async function assertCanEdit(context: Ctx, slot: string) {
  const { data, error } = await context.supabase.rpc("can_edit_slot", { _user_id: context.userId, _slot: slot });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("해당 공종을 수정할 권한이 없습니다.");
}

/** 공통 쓰기 권한 (게스트 차단) */
export async function assertCanWrite(context: Ctx) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "guest" });
  if (error) throw new Error(error.message);
  if (data) throw new Error("게스트는 자료를 수정할 수 없습니다.");
}

/** 대시보드·리스트·T&C 화면이 함께 쓰는 전체 데이터 */
export const getProjectData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
  const c = context.supabase;
  const [acts, tc, manual, batches, settings] = await Promise.all([
    c.from("activities").select("*").order("id"),
    c.from("tc_items").select("*").order("id"),
    c.from("tc_manual").select("*"),
    c.from("import_batches").select("*").order("created_at", { ascending: false }),
    c.from("app_settings").select("*"),
  ]);
  const err = acts.error ?? tc.error ?? manual.error ?? batches.error ?? settings.error;
  if (err) throw new Error(err.message);
  const settingMap: Record<string, string> = {};
  (settings.data ?? []).forEach((s) => {
    if (s.value) settingMap[s.key] = s.value;
  });
  return {
    activities: acts.data ?? [],
    tcItems: tc.data ?? [],
    tcManual: manual.data ?? [],
    batches: batches.data ?? [],
    settings: settingMap,
  };
});

export const setBaselineDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCanWrite(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert({ key: "baseline_date", value: data.date, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { date: data.date };
  });

export const saveTcMemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ discipline: z.string().min(1), block: z.enum(["center", "right"]), itemKey: z.string().min(1), memo: z.string().max(2000) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCanEdit(context as never, data.discipline);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("tc_manual").upsert(
      {
        discipline: data.discipline,
        block: data.block,
        item_key: data.itemKey,
        memo: data.memo || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "discipline,block,item_key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const tcRow = z.object({
  row_no: z.number().nullable(),
  bldg: z.string().nullable(),
  bldg_raw: z.string().nullable(),
  grp: z.string().nullable(),
  item: z.string().nullable(),
  equip: z.string().nullable(),
  qty: z.number(),
  supplier: z.string().nullable(),
  t0_p: z.string().nullable(), t0_a: z.string().nullable(), t0_d: z.number().nullable(), t0_rem: z.number().nullable(),
  t1_p: z.string().nullable(), t1_a: z.string().nullable(), t1_d: z.number().nullable(), t1_rem: z.number().nullable(),
  rp_p: z.string().nullable(), rp_a: z.string().nullable(), rp_d: z.number().nullable(), rp_rem: z.number().nullable(),
  rfi_p: z.string().nullable(), rfi_a: z.string().nullable(), rfi_d: z.number().nullable(), rfi_rem: z.number().nullable(),
  t2_p: z.string().nullable(), t2_a: z.string().nullable(),
  resp_p: z.string().nullable(), resp_a: z.string().nullable(),
  status: z.string().nullable(),
  docref: z.string().nullable(),
});

/** T&C 워크북 업로드 — 해당 공종 데이터 교체, 수기 메모는 유지 */
export const importTcItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        discipline: z.string().min(1).max(32),
        fileName: z.string().min(1).max(200),
        fileDate: z.string().nullable(),
        rows: z.array(tcRow).min(1).max(5000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCanEdit(context as never, data.discipline);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const del = await supabaseAdmin.from("tc_items").delete().eq("discipline", data.discipline);
    if (del.error) throw new Error(del.error.message);
    const rows = data.rows.map((r) => ({
      ...r,
      discipline: data.discipline,
      source_file: data.fileName,
      file_date: data.fileDate,
    }));
    const ins = await supabaseAdmin.from("tc_items").insert(rows);
    if (ins.error) throw new Error(ins.error.message);
    const batch = await supabaseAdmin
      .from("import_batches")
      .insert({
        kind: "tc",
        slot: data.discipline,
        file_name: data.fileName,
        file_date: data.fileDate,
        row_count: rows.length,
      })
      .select("id")
      .single();
    if (batch.error) throw new Error(batch.error.message);

    const seen = new Set<string>();
    const snaps: Array<Record<string, unknown>> = [];
    for (const r of rows) {
      const key = `${data.discipline}|${r.bldg ?? ""}|${r.item ?? ""}|${r.equip ?? ""}|${r.row_no ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const rest: Record<string, unknown> = { ...(r as Record<string, unknown>) };
      delete rest["row_no"];
      delete rest["bldg_raw"];
      delete rest["source_file"];
      snaps.push({
        ...rest,

        batch_id: batch.data.id,
        snapshot_date: data.fileDate ?? new Date().toISOString().slice(0, 10),
        file_date: data.fileDate,
        discipline: data.discipline,
        item_key: key,
      });
    }
    for (let i = 0; i < snaps.length; i += 500) {
      const { error } = await supabaseAdmin.from("tc_snapshots").insert(snaps.slice(i, i + 500) as never);
      if (error) throw new Error(error.message);
    }
    return { discipline: data.discipline, inserted: rows.length, batchId: batch.data.id, snapshots: snaps.length };
  });

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const tcPatch = z
  .object({
    bldg: z.string().nullable(),
    grp: z.string().nullable(),
    item: z.string().nullable(),
    equip: z.string().nullable(),
    qty: z.number(),
    supplier: z.string().nullable(),
    status: z.string().nullable(),
    docref: z.string().nullable(),
    t0_p: dateStr, t0_a: dateStr, t0_rem: z.number().nullable(),
    t1_p: dateStr, t1_a: dateStr, t1_rem: z.number().nullable(),
    rp_p: dateStr, rp_a: dateStr, rp_rem: z.number().nullable(),
    rfi_p: dateStr, rfi_a: dateStr, rfi_rem: z.number().nullable(),
    t2_p: dateStr, t2_a: dateStr,
    resp_p: dateStr, resp_a: dateStr,
  })
  .partial();

/** T&C List 인라인 수정 — 담당 공종만 수정 가능 */
export const updateTcItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.number(), patch: tcPatch }).parse(d))
  .handler(async ({ data, context }) => {
    const cur = await context.supabase.from("tc_items").select("discipline").eq("id", data.id).single();
    if (cur.error) throw new Error("항목을 찾을 수 없습니다.");
    await assertCanEdit(context as never, cur.data.discipline);
    if (Object.keys(data.patch).length === 0) return { ok: true };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("tc_items").update(data.patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


/** 항목별 이력(스냅샷) 조회 — 추이·일일 진도율 계산용 */
export const getProgressHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ itemKey: z.string().min(1).max(300).optional(), discipline: z.string().max(32).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const c = context.supabase;
    let q = c
      .from("activity_snapshots")
      .select("snapshot_date,discipline,item_key,activity,planned_progress,actual_progress,done_quantity,total_quantity")
      .order("snapshot_date");
    if (data.itemKey) q = q.eq("item_key", data.itemKey);
    if (data.discipline) q = q.eq("discipline", data.discipline);
    const { data: rows, error } = await q.limit(5000);
    if (error) throw new Error(error.message);

    // 날짜별 평균 계획/실적 + 일일 진도율
    const byDate = new Map<string, { p: number; a: number; n: number }>();
    (rows ?? []).forEach((r) => {
      const d = r.snapshot_date;
      const cur = byDate.get(d) ?? { p: 0, a: 0, n: 0 };
      cur.p += Number(r.planned_progress ?? 0);
      cur.a += Number(r.actual_progress ?? 0);
      cur.n += 1;
      byDate.set(d, cur);
    });
    const series = [...byDate.entries()]
      .sort((x, y) => x[0].localeCompare(y[0]))
      .map(([date, v], i, arr) => {
        const planned = v.n ? v.p / v.n : 0;
        const actual = v.n ? v.a / v.n : 0;
        const prev = i > 0 ? arr[i - 1]! : null;
        const prevActual = prev && prev[1].n ? prev[1].a / prev[1].n : null;
        const days = prev ? Math.max(1, (new Date(date).getTime() - new Date(prev[0]).getTime()) / 86400000) : 0;
        return {
          date,
          planned,
          actual,
          count: v.n,
          dailyRate: prevActual === null ? null : (actual - prevActual) / days,
        };
      });
    return { rows: rows ?? [], series };
  });


export const recordScheduleBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ slot: z.string().min(1), fileName: z.string().min(1), fileDate: z.string().nullable(), rev: z.number().nullable(), rowCount: z.number() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCanEdit(context as never, data.slot);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("import_batches").insert({
      kind: "schedule",
      slot: data.slot,
      file_name: data.fileName,
      file_date: data.fileDate,
      rev: data.rev,
      row_count: data.rowCount,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** 기준일 직전 스냅샷의 항목별 실적 진도율 — 당일 실적 증분 계산용 */
export const getPrevActuals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ base: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("activity_snapshots")
      .select("snapshot_date,item_key,actual_progress")
      .lt("snapshot_date", data.base)
      .order("snapshot_date")
      .limit(20000);
    if (error) throw new Error(error.message);
    // 같은 item_key는 가장 최근(기준일 직전) 값으로 덮어쓴다
    const map: Record<string, number> = {};
    (rows ?? []).forEach((r: { item_key: string; actual_progress: number | null }) => {
      if (r.actual_progress != null) map[r.item_key] = Number(r.actual_progress);
    });
    return { prev: map };
  });
