import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Lang = z.enum(["ko", "en"]);

const Input = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  facts: z.string().min(1).max(12000),
  /** 요청 언어와 반대 언어의 공정명 사전을 적용한 분석 입력 */
  otherFacts: z.string().min(1).max(12000).optional(),
  /** true면 기존 저장 결과를 무시하고 다시 생성 (관리자 "다시 분석") */
  force: z.boolean().optional(),
  /** 출력 언어 (ko: 한국어, en: 건설 영어) */
  lang: Lang.optional(),
});

export type SafetyLang = "ko" | "en";

export type SafetyRisk = {
  level: "High" | "Medium";
  title: string;
  bldg: string;
  sub: string;
  /** 핵심 키워드·문구 배열 (구형 저장 데이터는 문자열일 수 있음) */
  hazard: string | string[];
  action: string | string[];
  /** 선택적 세부 설명 1문장 */
  hazardDetail?: string;
  actionDetail?: string;
  hazardType: string[];
};

const col = (lang: SafetyLang) => (lang === "en" ? { risks: "risks_en", at: "generated_at_en" } : { risks: "risks", at: "generated_at" });

/** 당일 작업 목록 기반 High Risk 안전 작업 선별 */
export const analyzeSafety = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { generateSafety } = await import("@/lib/safety.server");
    const lang: SafetyLang = data.lang ?? "ko";
    const c = col(lang);

    let existing: Record<string, unknown> | null = null;
    if (!data.force) {
      const { data: exist } = await supabaseAdmin
        .from("safety_reports")
        .select("day, risks, generated_at, risks_en, generated_at_en")
        .eq("day", data.day)
        .maybeSingle();
      existing = exist as Record<string, unknown> | null;
      if (existing && existing[c.risks]) {
        return { day: data.day, lang, risks: (existing[c.risks] as unknown as SafetyRisk[]) ?? [], generatedAt: (existing[c.at] as string | null) ?? null };
      }
    }

    const out = await generateSafety(data.day, data.facts, lang, context.userId);

    // 다른 언어 결과가 없으면 함께 생성 (실패해도 요청 언어 결과는 정상 반환)
    const other: SafetyLang = lang === "en" ? "ko" : "en";
    const hasOther = existing && existing[col(other).risks];
    if (data.force || !hasOther) {
      try {
        await generateSafety(data.day, data.otherFacts ?? data.facts, other, context.userId);
      } catch {
        // 보조 언어 생성 실패는 무시 — 다음 조회 시 다시 시도됨
      }
    }

    // 두 언어가 준비되면 A4 PDF 를 다시 만들어 저장 (텔레그램 발송용)
    try {
      const { publishSafetyPdfs } = await import("@/lib/safety-publish.server");
      await publishSafetyPdfs(data.day);
    } catch (e) {
      console.error("safety pdf publish failed:", e);
    }

    return { day: data.day, lang, risks: out.risks as SafetyRisk[], generatedAt: out.generatedAt };
  });

/** 저장된 당일 안전 위험 분석 결과 조회 */
export const getSafetyReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), lang: Lang.optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const lang: SafetyLang = data.lang ?? "ko";
    const c = col(lang);
    const { data: row, error } = await context.supabase
      .from("safety_reports")
      .select("day, risks, generated_at, risks_en, generated_at_en, pdf_ko_path, pdf_en_path, telegram_ready_at")
      .eq("day", data.day)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const r = row as Record<string, unknown> | null;
    if (!r || !r[c.risks]) return null;
    const ready = r["telegram_ready_at"] as string | null;
    const hasPdf = !!r[lang === "en" ? "pdf_en_path" : "pdf_ko_path"];
    return {
      day: data.day,
      lang,
      risks: (r[c.risks] as unknown as SafetyRisk[]) ?? [],
      generatedAt: (r[c.at] as string | null) ?? null,
      pdfUrl: hasPdf
        ? `/api/public/safety-pdf?day=${data.day}&lang=${lang}&v=${ready ? Math.floor(new Date(ready).getTime() / 1000) : 0}`
        : null,
    };
  });
