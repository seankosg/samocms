import { createFileRoute } from "@tanstack/react-router";

/** 자동 출면 동기화 엔드포인트 — 스케줄러만 호출합니다(공유 비밀키 필요). */
async function handle(request: Request) {
  const secret = process.env["MANPOWER_SYNC_SECRET"];
  if (!secret) return new Response("Server configuration error", { status: 500 });
  const token = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token || token !== secret) return new Response("Unauthorized", { status: 401 });

  try {
    const { syncManpowerFromSavedSettings } = await import("@/lib/manpower-sync.server");
    const result = await syncManpowerFromSavedSettings("auto-sheet");
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("manpower auto sync failed:", message);
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("manpower_ingest_log").insert({ mode: "auto-sheet", ok: false, error: message });
    } catch { /* 로그 실패는 무시 */ }
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/manpower-sync")({
  server: { handlers: { POST: ({ request }) => handle(request), GET: ({ request }) => handle(request) } },
});
