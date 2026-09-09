import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  base: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  facts: z.string().min(1).max(12000),
  /** true면 저장된 요약을 무시하고 다시 생성 */
  force: z.boolean().optional(),
});

/** 저장된 기준일 Executive Summary 조회 */
export const getExecSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ base: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("exec_summaries")
      .select("base, summary, generated_at")
      .eq("base", data.base)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    return { summary: row.summary as string, generatedAt: row.generated_at as string };
  });

/** 기준일 현황 수치를 바탕으로 한국어 Executive Summary 생성 */
export const generateExecSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!data.force) {
      const { data: exist } = await supabaseAdmin
        .from("exec_summaries")
        .select("summary, generated_at")
        .eq("base", data.base)
        .maybeSingle();
      if (exist) return { summary: exist.summary as string, generatedAt: exist.generated_at as string };
    }

    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI 키가 설정되어 있지 않습니다.");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "google/gemini-3.8-flash",
        messages: [
          {
            role: "system",
            content:
              "당신은 대형 자동차공장 건설현장의 공정관리 책임자입니다. 제공된 수치만 근거로 경영진 보고용 Executive Summary를 한국어로 작성합니다. " +
              "형식: 정확히 4개 문단, 각 문단 2~3문장, 전체 700자 이내. 각 문단은 반드시 '[진도] ', '[공종] ', '[리스크] ', '[조치] ' 중 하나의 라벨로 시작합니다(순서 고정). " +
              "강조: 핵심 수치와 핵심 키워드(지연 건수, 격차, 위험 마일스톤, 문제 협력사·건물명, 권고 조치)는 **이렇게** 이중 별표로 감쌉니다. 문단당 2~4개만 강조하고, 그 외 마크다운 기호(#, -, 목록)는 쓰지 않습니다. " +
              "내용: [진도] 기준일 기준 전체 진도와 계획 대비 격차, [공종] 공종별 강·약점, [리스크] 지연 집중 영역(건물·협력사)과 마일스톤 리스크, [조치] 시운전(T&C) T1·T2 현황과 권고 조치. " +
              "수치는 제공된 값만 사용하고 추정하지 마십시오.",
          },
          { role: "user", content: `기준일: ${data.base}\n\n[현황 수치]\n${data.facts}` },
        ],
      }),
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("AI 요청이 일시적으로 많습니다. 잠시 후 다시 시도해 주세요.");
      if (res.status === 402) throw new Error("AI 사용 크레딧이 부족합니다. 워크스페이스 크레딧을 충전해 주세요.");
      throw new Error(`AI 요약 생성 실패 (${res.status}) ${msg.slice(0, 200)}`);
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) throw new Error("AI 요약 결과가 비어 있습니다.");
    return { summary: text, generatedAt: new Date().toISOString() };
  });
