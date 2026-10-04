import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** 라인마킹 항목의 날짜별 기록. 같은 날짜에 여러 업로드가 있으면 가장 마지막 기록을 사용한다. */
export const getLineMarkingHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rows: Array<{
      item_key: string;
      snapshot_date: string;
      actual_progress: number | null;
    }> = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await context.supabase
        .from("activity_snapshots")
        .select("item_key,snapshot_date,actual_progress")
        .eq("discipline", "Arch")
        .eq("activity", "라인마킹")
        .order("snapshot_date")
        .order("captured_at")
        .order("id")
        .range(offset, offset + 999);
      if (error) throw new Error(error.message);
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    return rows;
  });