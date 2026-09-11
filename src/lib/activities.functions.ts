import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCanEdit } from "./project.functions";
import type { Tables } from "@/integrations/supabase/types";

export type Activity = Tables<"activities">;

export const getActivities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("activities").select("*").order("id");
    if (error) throw new Error(error.message);
    return data;
  });

const rowSchema = z.object({
  activity_no: z.string().nullable(),
  discipline: z.string().min(1),
  building: z.string().nullable(),
  room: z.string().nullable(),
  work_scope: z.string().nullable(),
  milestone: z.string().nullable(),
  subcontractor: z.string().nullable(),
  manager: z.string().nullable().optional(),
  activity: z.string().min(1),
  unit: z.string().nullable(),
  done_quantity: z.number().nullable(),
  total_quantity: z.number().nullable(),
  planned_progress: z.number().nullable(),
  actual_progress: z.number().nullable(),
  predecessor: z.string().nullable(),
  successor: z.string().nullable(),
  start_date: z.string().nullable(),
  finish_date: z.string().nullable(),
  source_file: z.string().min(1),
});

const importSchema = z.object({
  sourceFile: z.string().min(1).max(64),
  fileName: z.string().max(200).optional(),
  fileDate: z.string().nullable().optional(),
  rev: z.number().nullable().optional(),
  rows: z.array(rowSchema).min(1).max(5000),
});

/** 특정 공종(source_file)의 데이터를 업로드한 파일 내용으로 교체하고, 이력(스냅샷)을 남깁니다. */
export const importActivities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => importSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertCanEdit(context as never, data.sourceFile);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = data.rows.map((r) => ({ ...r, manager: r.manager ?? null, source_file: data.sourceFile }));

    const { error: delError } = await supabaseAdmin.from("activities").delete().eq("source_file", data.sourceFile);
    if (delError) throw new Error(delError.message);

    const { error: insError } = await supabaseAdmin.from("activities").insert(rows);
    if (insError) throw new Error(insError.message);

    // 업로드 배치 기록
    const batch = await supabaseAdmin
      .from("import_batches")
      .insert({
        kind: "schedule",
        slot: data.sourceFile,
        file_name: data.fileName ?? data.sourceFile,
        file_date: data.fileDate ?? null,
        rev: data.rev ?? null,
        row_count: rows.length,
      })
      .select("id")
      .single();
    if (batch.error) throw new Error(batch.error.message);

    // 항목별 스냅샷 기록 (같은 배치 내 중복 키 제거)
    const seen = new Set<string>();
    const snaps: Array<Record<string, unknown>> = [];
    for (const r of rows) {
      const key = `${r.discipline}|${r.activity_no ?? ""}|${r.activity}`;
      if (seen.has(key)) continue;
      seen.add(key);
      snaps.push({
        batch_id: batch.data.id,
        snapshot_date: data.fileDate ?? new Date().toISOString().slice(0, 10),
        baseline_date: data.fileDate ?? null,
        discipline: r.discipline,
        item_key: key,
        activity_no: r.activity_no,
        activity: r.activity,
        building: r.building,
        room: r.room,
        work_scope: r.work_scope,
        milestone: r.milestone,
        subcontractor: r.subcontractor,
        unit: r.unit,
        done_quantity: r.done_quantity,
        total_quantity: r.total_quantity,
        planned_progress: r.planned_progress,
        actual_progress: r.actual_progress,
        start_date: r.start_date,
        finish_date: r.finish_date,
        source_file: data.sourceFile,
      });
    }
    for (let i = 0; i < snaps.length; i += 500) {
      const chunk = snaps.slice(i, i + 500);
      const { error } = await supabaseAdmin.from("activity_snapshots").insert(chunk as never);
      if (error) throw new Error(error.message);
    }

    // 일일 증분(계획/실적) 자동 집계: 해당 기준일과 다음 날짜분 갱신
    const base = data.fileDate ?? new Date().toISOString().slice(0, 10);
    const next = new Date(`${base}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    for (const d of [base, next.toISOString().slice(0, 10)]) {
      const { error } = await supabaseAdmin.rpc("refresh_activity_daily", { _date: d } as never);
      if (error) console.error("refresh_activity_daily", d, error.message);
    }

    return { sourceFile: data.sourceFile, inserted: rows.length, batchId: batch.data.id, snapshots: snaps.length };
  });

const activityPatch = z
  .object({
    building: z.string().nullable(),
    room: z.string().nullable(),
    work_scope: z.string().nullable(),
    milestone: z.string().nullable(),
    subcontractor: z.string().nullable(),
    activity: z.string().min(1),
    unit: z.string().nullable(),
    done_quantity: z.number().nullable(),
    total_quantity: z.number().nullable(),
    actual_progress: z.number().nullable(),
    predecessor: z.string().nullable(),
    successor: z.string().nullable(),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    finish_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  })
  .partial();

/** 공정리스트 인라인 수정 — 담당 공종만 수정 가능 */
export const updateActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.number(), patch: activityPatch }).parse(d))
  .handler(async ({ data, context }) => {
    const cur = await context.supabase.from("activities").select("source_file, baseline_date").eq("id", data.id).single();
    if (cur.error) throw new Error("항목을 찾을 수 없습니다.");
    await assertCanEdit(context as never, cur.data.source_file);
    if (Object.keys(data.patch).length === 0) return { ok: true };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("activities").update(data.patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    // 인라인 수정 후에도 일일 증분(계획/실적) 자동 재계산 — 기준일과 다음 날짜
    const base = cur.data.baseline_date as string;
    if (base) {
      const next = new Date(`${base}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      const nextStr = next.toISOString().slice(0, 10);
      for (const d of [base, nextStr]) {
        const rf = await supabaseAdmin.rpc("refresh_activity_daily", { _date: d } as never);
        if (rf.error) console.error("refresh_activity_daily", d, rf.error.message);
      }
    }
    return { ok: true };
  });


