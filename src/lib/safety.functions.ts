import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  facts: z.string().min(1).max(12000),
  /** true면 기존 저장 결과를 무시하고 다시 생성 (관리자 "다시 분석") */
  force: z.boolean().optional(),
});

export type SafetyRisk = {
  level: "High" | "Medium";
  title: string;
  bldg: string;
  sub: string;
  hazard: string;
  action: string;
  hazardType: string[];
};

const SYSTEM =
  "당신은 대형 자동차공장 건설현장의 안전관리(HSE) 책임자입니다. 제공된 당일 작업 목록만 근거로 안전상 특별 주의가 필요한 작업을 선별합니다. " +
  "중점 판단 요소: 고소작업, 중량물 양중·인양, 전기 활선·수전, 밀폐공간, 화기작업, 시운전 중 기계·전기 가동(에너지 투입), 동시작업 간섭, 대형 장비 운용, 굴착·가설. " +
  "출력은 반드시 JSON 객체 하나이며 형식은 다음과 같습니다: " +
  '{"risks":[{"level":"High"|"Medium","title":"작업명","bldg":"건물/구역","sub":"협력사","hazardType":["낙하","감전"],"hazard":"위험 요인(한국어 1~2문장)","action":"권고 안전 조치(한국어 1~2문장)"}]} . ' +
  "hazardType은 해당 작업의 위험 종류를 아래 분류 중에서만 1~3개 선택한 배열입니다: 낙하·추락, 전도, 붕괴, 낙하물·비래, 감전, 화재·폭발, 질식·밀폐공간, 협착, 기계·장비, 감김·절단, 유해화학물질, 기타. " +
  "risks는 위험도가 높은 순으로 최대 12개. High는 인명 중대재해 가능성이 있는 작업에만 부여합니다. " +
  "제공되지 않은 작업을 지어내지 말고, 값이 없으면 '-' 로 표기합니다. JSON 외 다른 텍스트는 출력하지 않습니다.";

/** 당일 작업 목록 기반 High Risk 안전 작업 선별 */
export const analyzeSafety = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!data.force) {
      const { data: exist } = await supabaseAdmin
        .from("safety_reports")
        .select("day, risks, generated_at")
        .eq("day", data.day)
        .maybeSingle();
      if (exist) {
        return { day: exist.day, risks: (exist.risks as unknown as SafetyRisk[]) ?? [], generatedAt: exist.generated_at };
      }
    }

    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI 키가 설정되어 있지 않습니다.");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "google/gemini-3.8-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `당일 작업 목록 (json 형식으로 응답):\n${data.facts}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("AI 요청이 일시적으로 많습니다. 잠시 후 다시 시도해 주세요.");
      if (res.status === 402) throw new Error("AI 사용 크레딧이 부족합니다. 워크스페이스 크레딧을 충전해 주세요.");
      if (res.status === 403) throw new Error("AI 사용이 워크스페이스 정책으로 차단되어 있습니다.");
      throw new Error(`AI 안전 분석 실패 (${res.status}) ${msg.slice(0, 200)}`);
    }

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) throw new Error("AI 분석 결과가 비어 있습니다.");

    let risks: SafetyRisk[] = [];
    try {
      const parsed = JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim()) as { risks?: unknown };
      if (Array.isArray(parsed.risks)) {
        risks = (parsed.risks as Record<string, unknown>[])
          .map((r) => ({
            level: String(r["level"]) === "High" ? ("High" as const) : ("Medium" as const),
            title: String(r["title"] ?? "-"),
            bldg: String(r["bldg"] ?? "-"),
            sub: String(r["sub"] ?? "-"),
            hazard: String(r["hazard"] ?? ""),
            action: String(r["action"] ?? ""),
            hazardType: Array.isArray(r["hazardType"]) ? (r["hazardType"] as unknown[]).map(String).filter(Boolean).slice(0, 3) : [],
          }))
          .filter((r) => r.title && r.title !== "-")
          .slice(0, 12);
      }
    } catch {
      throw new Error("AI 분석 결과를 해석하지 못했습니다. 다시 시도해 주세요.");
    }

    const generatedAt = new Date().toISOString();
    await supabaseAdmin
      .from("safety_reports")
      .upsert({ day: data.day, risks, generated_at: generatedAt, created_by: context.userId }, { onConflict: "day" });

    return { day: data.day, risks, generatedAt };
  });

/** 저장된 당일 안전 위험 분석 결과 조회 */
export const getSafetyReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("safety_reports")
      .select("day, risks, generated_at")
      .eq("day", data.day)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    return { day: row.day, risks: (row.risks as unknown as SafetyRisk[]) ?? [], generatedAt: row.generated_at };
  });
