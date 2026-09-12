import { toRow, type ActivityRow } from "./schedule-model";
import { jeddahToday, safetyFacts, splitToday, todayTc } from "./today-model";
import type { TcItem } from "./tc-model";
import { generateSafety, safetyCol, type SafetyLang } from "./safety.server";

/** 전수 조회 (제한 없이 1,000행 단위로 모두 수집) */
async function fetchAll<T>(client: any, table: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from(table).select("*").order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

/**
 * 제다 현지 오늘 날짜의 안전 리포트를 한국어·영문 모두 생성합니다.
 * 이미 저장된 언어는 건너뛰며, 모두 있으면 아무 것도 하지 않습니다(재시도 스케줄용).
 */
export async function generateTodaySafetyReports(): Promise<{
  day: string;
  generated: SafetyLang[];
  skipped: SafetyLang[];
  reason?: string;
}> {
  const day = jeddahToday();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: exist, error: exErr } = await supabaseAdmin
    .from("safety_reports")
    .select("day, risks, generated_at, risks_en, generated_at_en")
    .eq("day", day)
    .maybeSingle();
  if (exErr) throw new Error(exErr.message);
  const row = exist as Record<string, unknown> | null;

  const langs: SafetyLang[] = ["ko", "en"];
  const missing = langs.filter((l) => !(row && row[safetyCol(l).risks]));
  const skipped = langs.filter((l) => !missing.includes(l));
  if (missing.length === 0) {
    // 이미 두 언어가 있으면 PDF 만 보강 (없을 때만 생성됨)
    if (!row?.["telegram_ready_at"]) {
      const { publishSafetyPdfs } = await import("./safety-publish.server");
      await publishSafetyPdfs(day).catch((e) => console.error("safety pdf publish failed:", e));
    }
    return { day, generated: [], skipped, reason: "이미 생성됨" };
  }

  const [acts, tcItems] = await Promise.all([
    fetchAll<ActivityRow>(supabaseAdmin, "activities"),
    fetchAll<TcItem>(supabaseAdmin, "tc_items"),
  ]);

  const rows = acts.map(toRow);
  const groups = splitToday(rows, day);
  const tc = todayTc(tcItems, day);
  const count = groups.start.length + groups.ongoing.length + groups.finish.length + tc.length;
  if (count === 0) return { day, generated: [], skipped, reason: "당일 작업 없음" };

  const facts = safetyFacts(groups, tc, day);
  const generated: SafetyLang[] = [];
  for (const lang of missing) {
    await generateSafety(day, facts, lang, null);
    generated.push(lang);
  }

  const { publishSafetyPdfs } = await import("./safety-publish.server");
  await publishSafetyPdfs(day).catch((e) => console.error("safety pdf publish failed:", e));

  return { day, generated, skipped };
}
