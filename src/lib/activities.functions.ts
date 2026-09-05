import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Tables } from "@/integrations/supabase/types";

export type Activity = Tables<"activities">;

export const getActivities = createServerFn({ method: "GET" }).handler(async () => {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("공정 데이터를 불러올 수 없습니다.");
  const client = createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.from("activities").select("*").order("id");
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
  rows: z.array(rowSchema).min(1).max(5000),
});

/** 특정 공종(source_file)의 데이터를 업로드한 파일 내용으로 교체합니다. */
export const importActivities = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => importSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = data.rows.map((r) => ({ ...r, source_file: data.sourceFile }));

    const { error: delError } = await supabaseAdmin.from("activities").delete().eq("source_file", data.sourceFile);
    if (delError) throw new Error(delError.message);

    const { error: insError } = await supabaseAdmin.from("activities").insert(rows);
    if (insError) throw new Error(insError.message);

    return { sourceFile: data.sourceFile, inserted: rows.length };
  });
