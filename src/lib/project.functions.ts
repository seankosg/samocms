import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("데이터를 불러올 수 없습니다.");
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

/** 대시보드·리스트·T&C 화면이 함께 쓰는 전체 데이터 */
export const getProjectData = createServerFn({ method: "GET" }).handler(async () => {
  const c = publicClient();
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
  .inputValidator((d: unknown) => z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert({ key: "baseline_date", value: data.date, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { date: data.date };
  });

export const saveTcMemo = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ discipline: z.string().min(1), block: z.enum(["center", "right"]), itemKey: z.string().min(1), memo: z.string().max(2000) })
      .parse(d),
  )
  .handler(async ({ data }) => {
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
  .handler(async ({ data }) => {
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
    await supabaseAdmin.from("import_batches").insert({
      kind: "tc",
      slot: data.discipline,
      file_name: data.fileName,
      file_date: data.fileDate,
      row_count: rows.length,
    });
    return { discipline: data.discipline, inserted: rows.length };
  });

export const recordScheduleBatch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ slot: z.string().min(1), fileName: z.string().min(1), fileDate: z.string().nullable(), rev: z.number().nullable(), rowCount: z.number() })
      .parse(d),
  )
  .handler(async ({ data }) => {
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
