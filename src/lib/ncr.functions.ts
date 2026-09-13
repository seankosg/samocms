import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sequenceViolations, normCompanyKey, SLOT_ORDER, planField, actualField, type DateField } from "./ncr-model";
import type { Tables } from "@/integrations/supabase/types";

export type NcrItem = Tables<"ncr_items">;

type Ctx = { supabase: any; userId: string };

async function assertAdmin(context: Ctx) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("관리자만 NCR 자료를 업로드할 수 있습니다.");
}

/** NCR 리스트·대시보드 공용 조회 (보관 항목 제외) */
export const getNcrItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("ncr_items").select("*").is("hidden_at", null).order("id");
    if (error) throw new Error(error.message);
    return data as NcrItem[];
  });

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

let rowSchema = z.object({
  ser_no: z.string().nullable(),
  doc_type: z.string().nullable(),
  doc_no: z.string().min(1).max(120),
  description: z.string().nullable(),
  location: z.string().nullable(),
  issued_by: z.string().nullable(),
  issued_date: dateStr,
  team: z.string().nullable(),
  mic: z.string().nullable(),
  pic: z.string().nullable(),
  subcontractor: z.string().nullable(),
  status: z.string().nullable(),
  current_stage_file: z.string().nullable(),
  response_status: z.string().nullable(),
}) as z.ZodObject<any>;
for (const s of SLOT_ORDER) {
  rowSchema = rowSchema.extend({ [planField(s)]: dateStr, [actualField(s)]: dateStr });
}

const importSchema = z.object({
  fileName: z.string().min(1).max(200),
  fileDate: z.string().nullable(),
  rows: z.array(rowSchema).min(1).max(2000),
});

export type NcrReject = { docNo: string; description: string | null; reasons: string[] };

/**
 * NCR 마스터 업로드 — doc_no 기준 갱신(upsert).
 * 슬롯 순서(계획+실적) 위반 행은 그 행만 반려하고 나머지는 정상 반영합니다.
 * 파일에서 빠진 문서는 삭제하지 않고 보관(숨김)합니다.
 */
export const importNcrItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => importSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 협력사 표기 보정 — 별칭 테이블(company_disciplines)의 정규화 키로 canonical 표기에 매핑
    const { data: aliasRows, error: aliasErr } = await supabaseAdmin
      .from("company_disciplines")
      .select("name, aliases");
    if (aliasErr) throw new Error(aliasErr.message);
    const aliasMap = new Map<string, string>();
    for (const a of aliasRows ?? []) {
      aliasMap.set(normCompanyKey(a.name), a.name);
      for (const al of (a.aliases as string[] | null) ?? []) aliasMap.set(normCompanyKey(al), a.name);
    }

    const rejected: NcrReject[] = [];
    const unknownSubs = new Set<string>();
    const valid: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();

    for (const r of data.rows) {
      const rec = r as Record<string, string | null>;
      const key = (rec["doc_no"] ?? "").trim();
      if (seen.has(key)) {
        rejected.push({ docNo: key, description: rec["description"] ?? null, reasons: [`문서번호 "${key}"가 파일 안에서 중복됩니다 / Duplicate doc no in file`] });
        continue;
      }
      seen.add(key);

      const dates = r as unknown as Record<DateField, string | null>;
      const violations = sequenceViolations(dates);
      if (violations.length) {
        rejected.push({ docNo: key, description: rec["description"] ?? null, reasons: violations.map((v) => v.reason) });
        continue;
      }

      const subRaw = (rec["subcontractor"] ?? "").trim();
      let sub: string | null = subRaw || null;
      if (subRaw) {
        const hit = aliasMap.get(normCompanyKey(subRaw));
        if (hit) sub = hit;
        else unknownSubs.add(subRaw);
      }

      valid.push({
        ...r,
        doc_no: key,
        subcontractor: sub,
        source_file: data.fileName,
        file_date: data.fileDate,
        hidden_at: null,
        hidden_source_date: null,
      });
    }

    if (valid.length) {
      const { error: upError } = await supabaseAdmin.from("ncr_items").upsert(valid as never, { onConflict: "doc_no" });
      if (upError) throw new Error(upError.message);
    }

    // 파일에서 사라진 문서는 보관(숨김) 처리
    const prev = await supabaseAdmin.from("ncr_items").select("id, doc_no").is("hidden_at", null);
    if (prev.error) throw new Error(prev.error.message);
    const incoming = new Set(valid.map((r) => r["doc_no"] as string));
    const hideIds = (prev.data ?? []).filter((p) => !incoming.has(p.doc_no)).map((p) => p.id as number);
    if (hideIds.length) {
      const { error: hideError } = await supabaseAdmin
        .from("ncr_items")
        .update({ hidden_at: new Date().toISOString(), hidden_source_date: data.fileDate } as never)
        .in("id", hideIds);
      if (hideError) throw new Error(hideError.message);
    }

    const batch = await supabaseAdmin
      .from("import_batches")
      .insert({ kind: "ncr", slot: "ncr", file_name: data.fileName, file_date: data.fileDate, row_count: valid.length })
      .select("id")
      .single();
    if (batch.error) throw new Error(batch.error.message);

    return {
      inserted: valid.length,
      rejected,
      hidden: hideIds.length,
      batchId: batch.data.id,
      unknownSubs: [...unknownSubs],
    };
  });

const patchBase = z
  .object({
    ser_no: z.string().nullable(),
    doc_type: z.string().nullable(),
    description: z.string().nullable(),
    location: z.string().nullable(),
    issued_by: z.string().nullable(),
    issued_date: dateStr,
    team: z.string().nullable(),
    mic: z.string().nullable(),
    pic: z.string().nullable(),
    subcontractor: z.string().nullable(),
    status: z.string().nullable(),
    response_status: z.string().nullable(),
  })
  .partial() as z.ZodObject<any>;
let patchSchema = patchBase;
for (const s of SLOT_ORDER) {
  patchSchema = patchSchema.extend({ [planField(s)]: dateStr.optional(), [actualField(s)]: dateStr.optional() });
}

/** NCR 인라인 수정 — 관리자 또는 해당 행의 MIC/PIC(이름 일치)만 가능. 슬롯 순서 위반은 서버에서도 차단. */
export const updateNcrItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.number(), patch: patchSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const cur = await context.supabase.from("ncr_items").select("*").eq("id", data.id).single();
    if (cur.error) throw new Error("항목을 찾을 수 없습니다.");

    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) {
      const prof = await context.supabase.from("profiles").select("full_name").eq("id", context.userId).maybeSingle();
      const me = (prof.data?.full_name ?? "").trim();
      const owners = [cur.data.mic, cur.data.pic].map((v: string | null) => (v ?? "").trim()).filter(Boolean);
      if (!me || !owners.includes(me)) {
        throw new Error("본인이 담당(MIC/PIC)인 항목만 수정할 수 있습니다 / Only the MIC or PIC of this item can edit it.");
      }
    }

    const patch = data.patch as Record<string, unknown>;
    if (Object.keys(patch).length === 0) return { ok: true };

    // 병합 결과로 슬롯 순서 재검증 (계획+실적)
    const merged = { ...cur.data, ...patch } as Record<DateField, string | null>;
    const violations = sequenceViolations(merged);
    if (violations.length) {
      throw new Error(violations.map((v) => v.reason).join("\n"));
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("ncr_items").update(patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
