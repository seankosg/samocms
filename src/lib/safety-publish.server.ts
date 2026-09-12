/**
 * 안전 리포트 PDF·이미지 생성·저장 (서버 전용)
 * 한글·영문 분석 결과가 모두 있을 때 A4 PDF 2개와 언어별 A4 페이지 이미지(JPG)를
 * 만들어 Storage 에 저장하고 safety_reports 의 경로·장수·준비 시각을 갱신합니다.
 */
import { toRow, type ActivityRow, SLOT_LABEL } from "./schedule-model";
import { splitToday, todayTc, byTeam, byBldg } from "./today-model";
import { SLOT_LABEL_EN } from "./today-i18n";
import type { TcItem } from "./tc-model";
import type { SafetyLang, SafetyRisk } from "./safety.server";
import { buildSafetyPdf } from "./safety-pdf.server";

const BUCKET = "safety-reports";

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

export const pdfPath = (day: string, lang: SafetyLang) => `safety/${day}-${lang}.pdf`;

/** 두 언어 결과가 모두 저장되어 있으면 PDF 2개를 만들어 저장합니다. */
export async function publishSafetyPdfs(day: string): Promise<{ ok: boolean; reason?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: row, error } = await supabaseAdmin
    .from("safety_reports")
    .select("day, risks, generated_at, risks_en, generated_at_en")
    .eq("day", day)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const r = row as Record<string, unknown> | null;
  if (!r || !r["risks"] || !r["risks_en"]) return { ok: false, reason: "두 언어 결과가 아직 없습니다." };

  const [acts, tcItems] = await Promise.all([
    fetchAll<ActivityRow>(supabaseAdmin, "activities"),
    fetchAll<TcItem>(supabaseAdmin, "tc_items"),
  ]);
  const rows = acts.map(toRow);
  const groups = splitToday(rows, day);
  const tc = todayTc(tcItems, day);
  const allRows = [...new Map([...groups.start, ...groups.ongoing, ...groups.finish].map((x) => [x.id, x])).values()];
  const kpi = [allRows.length, groups.start.length, groups.ongoing.length, groups.finish.length, tc.length];
  const teamsRaw = byTeam(allRows);
  const bldgs = byBldg(allRows).slice(0, 8);

  const langs: SafetyLang[] = ["ko", "en"];
  for (const lang of langs) {
    const bytes = await buildSafetyPdf({
      day,
      lang,
      risks: (lang === "en" ? r["risks_en"] : r["risks"]) as SafetyRisk[],
      generatedAt: (lang === "en" ? r["generated_at_en"] : r["generated_at"]) as string | null,
      kpi,
      teams: teamsRaw.map((x) => ({
        ...x,
        label: (lang === "en" ? SLOT_LABEL_EN[x.label] : SLOT_LABEL[x.label]) ?? x.label,
      })),
      bldgs,
    });
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(pdfPath(day, lang), bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw new Error(`PDF 저장 실패: ${upErr.message}`);
  }

  const { error: updErr } = await supabaseAdmin
    .from("safety_reports")
    .update({
      pdf_ko_path: pdfPath(day, "ko"),
      pdf_en_path: pdfPath(day, "en"),
      telegram_ready_at: new Date().toISOString(),
    } as never)
    .eq("day", day);
  if (updErr) throw new Error(updErr.message);

  return { ok: true };
}
