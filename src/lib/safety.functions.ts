import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Lang = z.enum(["ko", "en"]);

const Input = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  facts: z.string().min(1).max(12000),
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

const toList = (v: unknown): string | string[] => {
  if (Array.isArray(v)) return (v as unknown[]).map(String).filter(Boolean).slice(0, 4);
  return String(v ?? "");
};

const SYSTEM_KO =
  "당신은 대형 자동차공장 건설현장의 안전관리(HSE) 책임자입니다. 제공된 당일 작업 목록만 근거로 안전상 특별 주의가 필요한 작업을 선별합니다. " +
  "중점 판단 요소: 고소작업, 중량물 양중·인양, 전기 활선·수전, 밀폐공간, 화기작업, 시운전 중 기계·전기 가동(에너지 투입), 동시작업 간섭, 대형 장비 운용, 굴착·가설. " +
  "출력은 반드시 JSON 객체 하나이며 형식은 다음과 같습니다: " +
  '{"risks":[{"level":"High"|"Medium","title":"작업명","bldg":"건물/구역","sub":"협력사","hazardType":["낙하","감전"],"hazard":["핵심 위험 키워드·문구 2~4개"],"hazardDetail":"세부 설명 1문장(선택)","action":["권고 안전 조치 키워드·문구 2~4개"],"actionDetail":"세부 설명 1문장(선택)"}]} . ' +
  "hazard와 action은 완결된 문장이 아니라 근로자가 한눈에 읽는 핵심 키워드·짧은 문구 2~4개의 배열로 작성합니다(예: [\"비계 가장자리 개구부\", \"개인안전대 미체결\"]). hazardDetail·actionDetail은 보조가 필요할 때만 1문장으로, 불필요하면 빈 문자열로 둡니다. " +
  "hazardType은 해당 작업의 위험 종류를 아래 분류 중에서만 1~3개 선택한 배열입니다: 낙하·추락, 전도, 붕괴, 낙하물·비래, 감전, 화재·폭발, 질식·밀폐공간, 협착, 기계·장비, 감김·절단, 유해화학물질, 기타. " +
  "risks는 위험도가 높은 순으로 최대 12개. High는 인명 중대재해 가능성이 있는 작업에만 부여합니다. " +
  "제공되지 않은 작업을 지어내지 말고, 값이 없으면 '-' 로 표기합니다. JSON 외 다른 텍스트는 출력하지 않습니다.";

const SYSTEM_EN =
  "You are the HSE (Health, Safety & Environment) manager of a large automotive plant construction site. " +
  "Using ONLY the provided list of today's activities, select the works that require special safety attention. " +
  "Key judgement factors: work at height, heavy lifting / rigging, live electrical work & energisation, confined space entry, hot work, " +
  "energised commissioning of mechanical & electrical systems, simultaneous operations (SIMOPS) interference, heavy plant operation, excavation and temporary works. " +
  "Write in professional construction / HSE English (site terminology such as scaffolding, permit to work, LOTO, spotter, banksman, edge protection, fire watch, gas testing). " +
  "Output MUST be exactly one JSON object in this form: " +
  '{"risks":[{"level":"High"|"Medium","title":"activity name","bldg":"building/area","sub":"subcontractor","hazardType":["Fall","Electric Shock"],"hazard":["2-4 short hazard keywords/phrases"],"hazardDetail":"optional 1-sentence detail","action":["2-4 short control measure keywords/phrases"],"actionDetail":"optional 1-sentence detail"}]} . ' +
  "hazard and action are NOT full sentences: write them as arrays of 2-4 concise keywords or short phrases workers can scan at a glance (e.g. [\"Open edge on scaffold\", \"No safety harness clipped\"]). hazardDetail/actionDetail are optional one-sentence elaborations; use an empty string when not needed. " +
  "hazardType is an array of 1-3 values chosen ONLY from: Fall from Height, Overturning, Collapse, Falling Object, Electric Shock, Fire/Explosion, Asphyxiation/Confined Space, Caught-in/Crushing, Machinery/Equipment, Entanglement/Cutting, Hazardous Chemicals, Other. " +
  "List up to 12 risks, highest risk first. Use High only where a fatality or major injury is credible. " +
  "Never invent activities that are not provided; use '-' where a value is missing. Output no text other than the JSON.";

const col = (lang: SafetyLang) => (lang === "en" ? { risks: "risks_en", at: "generated_at_en" } : { risks: "risks", at: "generated_at" });

/** 당일 작업 목록 기반 High Risk 안전 작업 선별 */
export const analyzeSafety = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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

    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI 키가 설정되어 있지 않습니다.");

    /** 지정 언어로 AI 분석 1회 실행 후 저장 */
    const generate = async (target: SafetyLang): Promise<{ risks: SafetyRisk[]; generatedAt: string }> => {
      const tc = col(target);
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
        body: JSON.stringify({
          model: "google/gemini-3.8-flash",
          messages: [
            { role: "system", content: target === "en" ? SYSTEM_EN : SYSTEM_KO },
            {
              role: "user",
              content:
                target === "en"
                  ? `Today's activity list (respond in JSON):\n${data.facts}`
                  : `당일 작업 목록 (json 형식으로 응답):\n${data.facts}`,
            },
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
              hazard: toList(r["hazard"]),
              action: toList(r["action"]),
              hazardDetail: String(r["hazardDetail"] ?? ""),
              actionDetail: String(r["actionDetail"] ?? ""),
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
        .upsert(
          { day: data.day, [tc.risks]: risks, [tc.at]: generatedAt, created_by: context.userId } as never,
          { onConflict: "day" },
        );
      return { risks, generatedAt };
    };

    const out = await generate(lang);

    // 다른 언어 결과가 없으면 함께 생성 (실패해도 요청 언어 결과는 정상 반환)
    const other: SafetyLang = lang === "en" ? "ko" : "en";
    const oc = col(other);
    const hasOther = existing && existing[oc.risks];
    if (data.force || !hasOther) {
      try {
        await generate(other);
      } catch {
        // 보조 언어 생성 실패는 무시 — 다음 조회 시 다시 시도됨
      }
    }

    return { day: data.day, lang, risks: out.risks, generatedAt: out.generatedAt };
  });

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "google/gemini-3.8-flash",
        messages: [
          { role: "system", content: lang === "en" ? SYSTEM_EN : SYSTEM_KO },
          {
            role: "user",
            content:
              lang === "en"
                ? `Today's activity list (respond in JSON):\n${data.facts}`
                : `당일 작업 목록 (json 형식으로 응답):\n${data.facts}`,
          },
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
            hazard: toList(r["hazard"]),
            action: toList(r["action"]),
            hazardDetail: String(r["hazardDetail"] ?? ""),
            actionDetail: String(r["actionDetail"] ?? ""),
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
      .upsert(
        { day: data.day, [c.risks]: risks, [c.at]: generatedAt, created_by: context.userId } as never,
        { onConflict: "day" },
      );

    return { day: data.day, lang, risks, generatedAt };
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
      .select("day, risks, generated_at, risks_en, generated_at_en")
      .eq("day", data.day)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const r = row as Record<string, unknown> | null;
    if (!r || !r[c.risks]) return null;
    return { day: data.day, lang, risks: (r[c.risks] as unknown as SafetyRisk[]) ?? [], generatedAt: (r[c.at] as string | null) ?? null };
  });
