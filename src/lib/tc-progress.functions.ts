import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DailyRow } from "./tc-progress-utils";

const schema = z.object({
  from: z.string().min(8),
  to: z.string().min(8),
});

const PAGE = 1000;

/** T&C 일자별 계획/실적 증분 원본 (tc_daily_progress) — 1,000행 제한을 넘기 위해 페이지 단위로 전부 수집 */
export const getTcDailyProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const all: DailyRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data: rows, error } = await context.supabase
        .from("tc_daily_progress")
        .select("event_date, discipline, item_key, stage, bldg, grp, item, equip, supplier, qty, plan_count, plan_qty, actual_count, actual_qty")
        .gte("event_date", data.from)
        .lte("event_date", data.to)
        .order("event_date")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      if (!rows?.length) break;
      all.push(...(rows as DailyRow[]));
      if (rows.length < PAGE) break;
    }
    return all;
  });

/** 전체 기록 범위(최소/최대 event_date) */
export const getTcProgressRange = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [min, max] = await Promise.all([
      context.supabase.from("tc_daily_progress").select("event_date").order("event_date", { ascending: true }).limit(1),
      context.supabase.from("tc_daily_progress").select("event_date").order("event_date", { ascending: false }).limit(1),
    ]);
    const err = min.error ?? max.error;
    if (err) throw new Error(err.message);
    return {
      min: (min.data?.[0]?.event_date as string | undefined) ?? null,
      max: (max.data?.[0]?.event_date as string | undefined) ?? null,
    };
  });
