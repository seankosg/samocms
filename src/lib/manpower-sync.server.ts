/** 구글 시트(봇 장부) → 출면 DB 동기화 공통 로직 (서버 전용) */
import { parseSheet, diffAgainstExisting, type SheetEntry } from "./manpower-sheet";

const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

export async function readSheetTab(sheetId: string, tab: string) {
  const key = process.env["LOVABLE_API_KEY"];
  const conn = process.env["GOOGLE_SHEETS_API_KEY"];
  if (!key || !conn) throw new Error("구글 시트 연결이 설정되지 않았습니다.");
  const res = await fetch(`${GATEWAY}/spreadsheets/${sheetId}/values/${tab}!A1:R2000`, {
    headers: { Authorization: `Bearer ${key}`, "X-Connection-Api-Key": conn },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Sheets read failed [${res.status}]: ${body}`);
    throw new Error(`구글 시트를 읽지 못했습니다 [${res.status}] ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { values?: unknown[][] };
  return json.values;
}

export type SyncOptions = {
  sheetId: string;
  subTab: string;
  hdecTab: string;
  apply: boolean;
  /** ingest log 에 남길 실행 방식 */
  mode: string;
};

/** 시트를 읽어 미리보기(apply=false) 또는 실제 반영(apply=true) */
export async function syncManpowerFromSheet(opts: SyncOptions) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [subValues, hdecValues] = await Promise.all([
    readSheetTab(opts.sheetId, opts.subTab),
    readSheetTab(opts.sheetId, opts.hdecTab),
  ]);
  const sub = parseSheet(subValues, "SUB");
  const hdec = parseSheet(hdecValues, "HDEC");
  const rows: SheetEntry[] = [...sub.rows, ...hdec.rows];
  const errors = [
    ...sub.errors.map((e) => ({ ...e, tab: opts.subTab })),
    ...hdec.errors.map((e) => ({ ...e, tab: opts.hdecTab })),
  ];

  const { data: existing, error: exErr } = await supabaseAdmin
    .from("manpower_entries")
    .select("source, sheet_row, submission_id, status, subtotal, company, report_date");
  if (exErr) throw new Error(exErr.message);
  const summary = diffAgainstExisting(rows, (existing ?? []) as never);

  if (!opts.apply) {
    return { preview: true as const, rows: rows.length, ...summary, errors, sheetId: opts.sheetId, sample: rows.slice(0, 20) };
  }

  let upserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({ ...r, synced_at: new Date().toISOString() }));
    const { error } = await supabaseAdmin.from("manpower_entries").upsert(chunk, { onConflict: "source,sheet_row" });
    if (error) throw new Error(error.message);
    upserted += chunk.length;
  }
  await supabaseAdmin.from("manpower_ingest_log").insert({
    mode: opts.mode,
    rows_in: rows.length,
    rows_upserted: upserted,
    warnings: errors.length ? errors : null,
    ok: true,
  });
  const now = new Date().toISOString();
  await supabaseAdmin.from("app_settings").upsert([
    { key: "manpower_sheet_id", value: opts.sheetId, updated_at: now },
    { key: "manpower_sheet_sub_tab", value: opts.subTab, updated_at: now },
    { key: "manpower_sheet_hdec_tab", value: opts.hdecTab, updated_at: now },
    { key: "manpower_last_sync_at", value: now, updated_at: now },
  ]);
  return { preview: false as const, rows: rows.length, ...summary, upserted, errors, sheetId: opts.sheetId };
}

/** 저장된 시트 설정으로 자동 동기화 (자동 갱신용) */
export async function syncManpowerFromSavedSettings(mode = "cron-sheet") {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("key, value")
    .in("key", ["manpower_sheet_id", "manpower_sheet_sub_tab", "manpower_sheet_hdec_tab"]);
  if (error) throw new Error(error.message);
  const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value ?? ""]));
  const sheetId = map["manpower_sheet_id"];
  if (!sheetId) throw new Error("저장된 구글 시트 설정이 없습니다.");
  return syncManpowerFromSheet({
    sheetId,
    subTab: map["manpower_sheet_sub_tab"] || "Submissions",
    hdecTab: map["manpower_sheet_hdec_tab"] || "Verification",
    apply: true,
    mode,
  });
}
